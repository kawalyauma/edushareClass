from __future__ import annotations
import hashlib
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from edushare_api.app import create_app
from edushare_api.settings import Settings
from edushare_api.db import User,School,make_engine,sessions,Base
from edushare_api.auth import password_hash

@pytest.fixture()
def client(tmp_path:Path):
    settings=Settings(database_url='sqlite://',secret_key='testing-secret-must-be-at-least-32-characters!',
                      storage_dir=tmp_path/'private',enabled=True,allow_signup=True,auto_create_schema=True,
                      max_user_bytes=800_000,max_pdf_bytes=500_000,max_media_bytes=600_000)
    engine=make_engine('sqlite://')
    app=create_app(settings,engine)
    with TestClient(app) as api:yield api,engine,tmp_path
    engine.dispose()

def account(api,email):
    pw='SafePassword2026!'
    r=api.post('/api/v1/auth/register',json={'email':email,'password':pw});assert r.status_code==201,r.text
    r=api.post('/api/v1/auth/login',json={'email':email,'password':pw});assert r.status_code==200,r.text
    return {'Authorization':'Bearer '+r.json()['access_token']}

def lesson(api,headers,id='lesson-1',version='"0"'):
    payload={'id':id,'formatVersion':1,'title':'Science','actions':[],'sources':[]}
    return api.put('/api/v1/lessons/'+id,headers={**headers,'If-Match':version},json={'title':'Science','payload':payload})

def test_auth_scope_and_versioning(client):
    api,_,_=client;alice=account(api,'teacher1@example.com');bob=account(api,'teacher2@example.com')
    assert lesson(api,alice).json()['version']==1
    assert lesson(api,alice,version='"1"').json()['version']==2
    assert lesson(api,alice,version='"1"').status_code==409
    assert api.get('/api/v1/lessons/lesson-1',headers=alice).headers['etag']=='"2"'
    assert api.get('/api/v1/lessons/lesson-1',headers=bob).status_code==404
    assert api.put('/api/v1/lessons/lesson-1',headers={**bob,'If-Match':'"2"'},json={'title':'steal','payload':{'id':'lesson-1','formatVersion':1}}).status_code==404
    assert api.get('/api/v1/lessons/lesson-1').status_code==401

def test_private_pdf_and_media_signatures(client):
    api,_,_=client;auth=account(api,'pdf@example.com');other=account(api,'other@example.com')
    assert lesson(api,auth).status_code==200
    contents=b'%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'
    upload=api.post('/api/v1/lessons/lesson-1/files?kind=pdf',headers={**auth,'content-type':'application/pdf'},content=contents)
    assert upload.status_code==201,upload.text
    file_id=upload.json()['id']
    assert api.get('/api/v1/files/'+file_id,headers=auth).content==contents
    assert api.get('/api/v1/files/'+file_id,headers=other).status_code==404
    assert api.post('/api/v1/lessons/lesson-1/files?kind=pdf',headers={**auth,'content-type':'application/pdf'},content=b'not a pdf').status_code==415
    assert api.post('/api/v1/lessons/lesson-1/files?kind=media',headers={**auth,'content-type':'video/webm'},content=b'not video').status_code==415

def test_resumable_upload_requires_offset_and_hash(client):
    api,_,_=client;auth=account(api,'chunk@example.com');lesson(api,auth)
    data=b'%PDF-1.4\nhello\n%%EOF'
    h=hashlib.sha256(data).hexdigest()
    init=api.post('/api/v1/uploads',headers=auth,json={'lessonId':'lesson-1','kind':'pdf','mimeType':'application/pdf','sizeBytes':len(data),'sha256':h})
    assert init.status_code==201,init.text
    id=init.json()['id']
    part=api.patch('/api/v1/uploads/'+id,headers={**auth,'upload-offset':'0'},content=data[:8]);assert part.status_code==200,part.text
    assert part.json()['offset']==8
    assert api.patch('/api/v1/uploads/'+id,headers={**auth,'upload-offset':'0'},content=data[8:]).status_code==409
    done=api.patch('/api/v1/uploads/'+id,headers={**auth,'upload-offset':'8'},content=data[8:]);assert done.status_code==200,done.text
    assert done.json()['complete'] is True
    assert api.get('/api/v1/files/'+done.json()['file_id'],headers=auth).content==data

def test_school_publishing_requires_admin_and_ownership(client):
    api,engine,_=client;auth=account(api,'teacher@example.com');lesson(api,auth)
    assert api.post('/api/v1/courses',headers=auth,json={'title':'P5 Mathematics'}).status_code==403
    with sessions(engine)() as db:
        user=db.scalar(select(User).where(User.email=='teacher@example.com'))
        school=School(name='Demo school');db.add(school);db.flush()
        user.role='school_admin';user.school_id=school.id
        # In a real bootstrap flow the school's existing lesson is not silently adopted.
        db.commit()
    courses=api.post('/api/v1/courses',headers=auth,json={'title':'P5 Mathematics'})
    assert courses.status_code==201,courses.text
    course_id=courses.json()['id']
    assert api.patch('/api/v1/courses/'+course_id+'/publish',headers=auth).status_code==422
    assert api.post('/api/v1/courses/'+course_id+'/lessons',headers=auth,json={'lessonId':'lesson-1'}).status_code==403
    lesson(api,auth,id='lesson-2')
    assert api.post('/api/v1/courses/'+course_id+'/lessons',headers=auth,json={'lessonId':'lesson-2'}).status_code==201
    assert api.patch('/api/v1/courses/'+course_id+'/publish',headers=auth).json()['published'] is True

def test_cloud_disabled_by_default(tmp_path):
    settings=Settings(database_url='sqlite://',secret_key='',storage_dir=tmp_path,enabled=False)
    app=create_app(settings,make_engine('sqlite://'))
    with TestClient(app) as api:
        assert api.get('/health').json()['cloud_enabled'] is False
        assert api.get('/api/v1/lessons').status_code==503

def test_teacher_provisioning_is_admin_only_and_tokens_expire(client):
    api,engine,_=client
    teacher=account(api,'initial@example.com')
    assert api.post('/api/v1/users/teachers',headers=teacher,json={'email':'new@example.com','password':'StrongPass2026!'}).status_code==403
    with sessions(engine)() as db:
        school=School(name='School X');db.add(school);db.flush()
        user=db.scalar(select(User).where(User.email=='initial@example.com'))
        user.role='school_admin';user.school_id=school.id;db.commit()
    r=api.post('/api/v1/users/teachers',headers=teacher,json={'email':'new@example.com','password':'StrongPass2026!'})
    assert r.status_code==201,r.text
    assert r.json()['school_id']
    assert api.post('/api/v1/auth/login',json={'email':'new@example.com','password':'StrongPass2026!'}).status_code==200
    assert api.get('/api/v1/auth/me',headers={'Authorization':'Bearer tampered'}).status_code==401

def test_quotas_and_resumable_upload_cancellation(client):
    api,_,root=client
    user=account(api,'quota@example.com');assert lesson(api,user).status_code==200
    data=b'%PDF-1.5\nabcdef\n%%EOF'
    session=api.post('/api/v1/uploads',headers=user,json={'lessonId':'lesson-1','kind':'pdf','mimeType':'application/pdf','sizeBytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    assert session.status_code==201,session.text
    id=session.json()['id']
    assert api.patch('/api/v1/uploads/'+id,headers={**user,'Upload-Offset':'0'},content=data[:8]).status_code==200
    assert api.delete('/api/v1/uploads/'+id,headers=user).status_code==204
    assert api.get('/api/v1/uploads/'+id,headers=user).status_code==404
    too_big=api.post('/api/v1/uploads',headers=user,json={'lessonId':'lesson-1','kind':'media','mimeType':'video/webm','sizeBytes':700001,'sha256':'a'*64})
    assert too_big.status_code==413

def test_upload_recovers_uncommitted_tail_after_restart(client):
    api,engine,_=client;auth=account(api,'recover@example.com');lesson(api,auth)
    data=b'%PDF-1.4\nrecovery\n%%EOF'
    upload=api.post('/api/v1/uploads',headers=auth,json={
        'lessonId':'lesson-1','kind':'pdf','mimeType':'application/pdf',
        'sizeBytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}).json()
    assert api.patch('/api/v1/uploads/'+upload['id'],headers={**auth,'Upload-Offset':'0'},content=data[:8]).status_code==200
    from edushare_api.db import UploadSession
    from edushare_api.private_storage import PrivateStore
    with sessions(engine)() as db:
        row=db.get(UploadSession,upload['id'])
        path=PrivateStore(api.app.state.settings.storage_dir).filename(row.storage_key)
    with path.open('ab') as f:f.write(b'garbage-from-crashed-writer')
    finished=api.patch('/api/v1/uploads/'+upload['id'],headers={**auth,'Upload-Offset':'8'},content=data[8:])
    assert finished.status_code==200,finished.text
    assert finished.json()['complete']
    assert api.get('/api/v1/files/'+finished.json()['file_id'],headers=auth).content==data
