"""Opt-in private EduShareClass API. No automatic cloud synchronization or public files."""
from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from datetime import datetime,timezone,timedelta
from pathlib import Path
from typing import Any,Literal
from uuid import uuid4

from fastapi import FastAPI,APIRouter,Depends,Header,HTTPException,Request,Response,status
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer,HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel,EmailStr,Field
from sqlalchemy import select,func
from sqlalchemy.orm import Session

from .auth import password_hash,verify_password,new_token,decode_token
from .db import (Base,User,School,LessonRecord,PrivateFile,UploadSession,Course,CourseLesson,
                 utcnow,make_engine,sessions)
from .private_storage import PrivateStore,validate_pdf
from .settings import Settings

MAX_LESSON_JSON=2*1024*1024
CHUNK_LIMIT=8*1024*1024
bearer=HTTPBearer(auto_error=False)

class AuthPayload(BaseModel):
    email:EmailStr
    password:str=Field(min_length=12,max_length=128)
class LessonPut(BaseModel):
    title:str=Field(min_length=1,max_length=200)
    payload:dict[str,Any]
class UploadInit(BaseModel):
    lessonId:str=Field(min_length=1,max_length=128)
    kind:Literal['pdf','media']
    mimeType:Literal['application/pdf','video/webm','video/mp4']
    sizeBytes:int=Field(gt=0)
    sha256:str=Field(pattern='^[a-f0-9]{64}$')
class CourseInput(BaseModel):
    title:str=Field(min_length=1,max_length=200)
class CourseLessonInput(BaseModel):
    lessonId:str=Field(min_length=1,max_length=128)


def create_app(settings:Settings|None=None,engine=None)->FastAPI:
    cfg=settings or Settings.from_env()
    if cfg.enabled and len(cfg.secret_key)<32:raise RuntimeError('Cloud JWT secret must be at least 32 characters.')
    engine=engine or make_engine(cfg.database_url)
    SessionLocal=sessions(engine)
    store=PrivateStore(cfg.storage_dir) if cfg.enabled else None
    app=FastAPI(title='EduShareClass Private API',version='0.1.0',docs_url='/docs' if cfg.enabled else None)
    app.state.settings=cfg
    if cfg.allowed_origins:
        app.add_middleware(CORSMiddleware,allow_origins=list(cfg.allowed_origins),allow_credentials=False,
                           allow_methods=['GET','PUT','POST','PATCH','DELETE'],allow_headers=['Authorization','Content-Type','If-Match','Upload-Offset','X-Content-SHA256'])
    if cfg.auto_create_schema and cfg.enabled:
        Base.metadata.create_all(engine)  # Development/testing only. Production uses migrations.

    @app.get('/health')
    def health():return {'service':'edushareclass-api','cloud_enabled':cfg.enabled}

    def enabled():
        if not cfg.enabled:raise HTTPException(503,'Cloud features are disabled; local recording remains available.')

    def db():
        with SessionLocal() as session:yield session

    def me(credentials:HTTPAuthorizationCredentials|None=Depends(bearer),session:Session=Depends(db)):
        if not credentials or credentials.scheme.lower()!='bearer':
            raise HTTPException(401,'Bearer token required.',headers={'WWW-Authenticate':'Bearer'})
        user_id=decode_token(credentials.credentials,cfg.secret_key)
        user=session.get(User,user_id)
        if not user:raise HTTPException(401,'Unknown account.',headers={'WWW-Authenticate':'Bearer'})
        return user

    def owned(session:Session,lesson_id:str,user:User)->LessonRecord:
        row=session.get(LessonRecord,lesson_id)
        if not row or row.owner_id!=user.id:raise HTTPException(404,'Lesson was not found.')
        return row

    def quota(session:Session,user:User,added:int):
        # Locks the account row in PostgreSQL, serializing concurrent quota reservations.
        session.execute(select(User).where(User.id==user.id).with_for_update()).scalar_one()
        stored=session.scalar(select(func.coalesce(func.sum(PrivateFile.size_bytes),0)).where(PrivateFile.owner_id==user.id)) or 0
        pending=session.scalar(select(func.coalesce(func.sum(UploadSession.size_bytes),0)).where(UploadSession.owner_id==user.id)) or 0
        if stored+pending+added>cfg.max_user_bytes:raise HTTPException(413,'Private storage quota exceeded.')

    api=APIRouter(prefix='/api/v1',dependencies=[Depends(enabled)])

    @api.post('/auth/register',status_code=201)
    def register(item:AuthPayload,session:Session=Depends(db)):
        if not cfg.allow_signup:raise HTTPException(403,'Self-registration is disabled. Ask the school administrator.')
        email=item.email.strip().casefold()
        if session.scalar(select(User.id).where(User.email==email)):
            raise HTTPException(409,'This email address already has an account.')
        user=User(email=email,password_hash=password_hash(item.password),role='teacher',school_id=None)
        session.add(user);session.commit()
        return {'id':user.id,'role':user.role}

    @api.post('/auth/login')
    def login(item:AuthPayload,session:Session=Depends(db)):
        user=session.scalar(select(User).where(User.email==item.email.strip().casefold()))
        if not user or not verify_password(item.password,user.password_hash):
            raise HTTPException(401,'Incorrect email or password.')
        return {'access_token':new_token(user.id,cfg.secret_key),'token_type':'bearer','expires_in':1800,
                'role':user.role,'school_id':user.school_id}

    @api.get('/auth/me')
    def current(user:User=Depends(me)):
        return {'id':user.id,'email':user.email,'role':user.role,'school_id':user.school_id}

    @api.get('/lessons')
    def lessons(user:User=Depends(me),session:Session=Depends(db)):
        rows=session.scalars(select(LessonRecord).where(LessonRecord.owner_id==user.id).order_by(LessonRecord.updated_at.desc())).all()
        return [{'id':x.id,'title':x.title,'version':x.version,'published':x.published,'updated_at':x.updated_at.isoformat()} for x in rows]

    @api.get('/lessons/{lesson_id}')
    def get_lesson(lesson_id:str,response:Response,user:User=Depends(me),session:Session=Depends(db)):
        row=owned(session,lesson_id,user);response.headers['ETag']=f'"{row.version}"';response.headers['Cache-Control']='no-store'
        return {'id':row.id,'title':row.title,'payload':row.payload,'version':row.version,'published':row.published}

    @api.put('/lessons/{lesson_id}')
    def put_lesson(lesson_id:str,item:LessonPut,if_match:str|None=Header(default=None),
                   user:User=Depends(me),session:Session=Depends(db)):
        if not if_match or not if_match.startswith('"') or not if_match.endswith('"'):
            raise HTTPException(428,'If-Match version required; use "0" for a new lesson.')
        if not if_match[1:-1].isdigit():raise HTTPException(400,'Invalid version header.')
        version=int(if_match[1:-1])
        if len(lesson_id)>128 or not lesson_id or item.payload.get('id')!=lesson_id or item.payload.get('formatVersion')!=1:
            raise HTTPException(422,'Lesson ID and v1 source format must match the path.')
        if len(json.dumps(item.payload,ensure_ascii=False).encode('utf-8'))>MAX_LESSON_JSON:
            raise HTTPException(413,'Lesson metadata exceeds 2 MiB; source media must use private file uploads.')
        row=session.scalar(select(LessonRecord).where(LessonRecord.id==lesson_id).with_for_update())
        if row:
            if row.owner_id!=user.id:raise HTTPException(404,'Lesson was not found.')
            if version!=row.version:raise HTTPException(409,detail={'message':'Cloud version conflict; reload before overwriting.','current_version':row.version})
            row.payload=item.payload;row.title=item.title;row.version+=1;row.updated_at=utcnow()
        else:
            if version!=0:raise HTTPException(409,'New lesson requires If-Match: "0".')
            row=LessonRecord(id=lesson_id,owner_id=user.id,school_id=user.school_id,title=item.title,payload=item.payload,version=1)
            session.add(row)
        session.commit();return {'id':row.id,'version':row.version,'updated_at':row.updated_at.isoformat()}

    @api.delete('/lessons/{lesson_id}',status_code=204)
    def delete_lesson(lesson_id:str,user:User=Depends(me),session:Session=Depends(db)):
        row=owned(session,lesson_id,user)
        private=session.scalars(select(PrivateFile).where(PrivateFile.lesson_id==row.id)).all()
        unfinished=session.scalars(select(UploadSession).where(UploadSession.lesson_id==row.id)).all()
        for rel in session.scalars(select(CourseLesson).where(CourseLesson.lesson_id==row.id)).all():session.delete(rel)
        for f in private:session.delete(f)
        for u in unfinished:session.delete(u)
        session.delete(row);session.commit()
        for f in [*private,*unfinished]:store.remove(f.storage_key) # type: ignore[union-attr]
        return Response(status_code=204)

    @api.post('/lessons/{lesson_id}/files',status_code=201)
    async def upload_file(lesson_id:str,request:Request,kind:Literal['pdf','media'],user:User=Depends(me),session:Session=Depends(db)):
        owned(session,lesson_id,user)
        mime=request.headers.get('content-type','').split(';',1)[0].strip()
        if (kind=='pdf' and mime!='application/pdf') or (kind=='media' and mime not in {'video/webm','video/mp4'}):
            raise HTTPException(415,'Unsupported private file kind or content type.')
        cap=cfg.max_pdf_bytes if kind=='pdf' else cfg.max_media_bytes
        quota(session,user,cap)
        key=store.create_key() # type: ignore[union-attr]
        try:
            size,digest,prefix=await store.save(key,request.stream(),cap) # type: ignore[union-attr]
            if size==0:raise HTTPException(422,'Empty upload is not allowed.')
            if kind=='pdf':validate_pdf(mime,prefix)
            else:
                if not (mime=='video/webm' and prefix.startswith(b'\x1a\x45\xdf\xa3') or mime=='video/mp4' and prefix[4:8]==b'ftyp'):
                    raise HTTPException(415,'Uploaded video signature does not match declared media type.')
            expected=request.headers.get('x-content-sha256')
            if expected and expected.lower()!=digest:raise HTTPException(422,'Content SHA-256 does not match.')
            row=PrivateFile(lesson_id=lesson_id,owner_id=user.id,storage_key=key,kind=kind,mime_type=mime,sha256=digest,size_bytes=size)
            session.add(row);session.commit()
            return {'id':row.id,'sha256':digest,'size_bytes':size,'kind':kind}
        except Exception:
            store.remove(key) # type: ignore[union-attr]
            raise

    @api.get('/files/{file_id}')
    def read_file(file_id:str,user:User=Depends(me),session:Session=Depends(db)):
        f=session.get(PrivateFile,file_id)
        if not f or f.owner_id!=user.id:raise HTTPException(404,'Private file not found.')
        path=store.filename(f.storage_key) # type: ignore[union-attr]
        if not path.is_file():raise HTTPException(404,'Private file data missing.')
        return FileResponse(path,media_type=f.mime_type,filename=f'{f.id}.{ "pdf" if f.kind=="pdf" else "webm" if f.mime_type=="video/webm" else "mp4" }',
                            headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})

    @api.post('/uploads',status_code=201)
    def initiate_upload(item:UploadInit,user:User=Depends(me),session:Session=Depends(db)):
        owned(session,item.lessonId,user)
        if (item.kind=='pdf' and item.mimeType!='application/pdf') or (item.kind=='media' and item.mimeType not in {'video/webm','video/mp4'}):
            raise HTTPException(415,'Kind and MIME type do not match.')
        limit=cfg.max_pdf_bytes if item.kind=='pdf' else cfg.max_media_bytes
        if item.sizeBytes>limit:raise HTTPException(413,'Resumable upload exceeds the file size limit.')
        quota(session,user,item.sizeBytes)
        key=store.create_key() # type: ignore[union-attr]
        row=UploadSession(lesson_id=item.lessonId,owner_id=user.id,kind=item.kind,mime_type=item.mimeType,sha256=item.sha256,
                          size_bytes=item.sizeBytes,offset=0,storage_key=key)
        session.add(row);session.commit()
        return {'id':row.id,'offset':0,'size_bytes':row.size_bytes}

    @api.get('/uploads/{upload_id}')
    def upload_status(upload_id:str,user:User=Depends(me),session:Session=Depends(db)):
        row=session.get(UploadSession,upload_id)
        if not row or row.owner_id!=user.id:raise HTTPException(404,'Upload not found.')
        return {'id':row.id,'offset':row.offset,'size_bytes':row.size_bytes}

    @api.patch('/uploads/{upload_id}')
    async def upload_chunk(upload_id:str,request:Request,upload_offset:int=Header(alias='Upload-Offset'),
                           user:User=Depends(me),session:Session=Depends(db)):
        row=session.scalar(select(UploadSession).where(UploadSession.id==upload_id).with_for_update())
        if not row or row.owner_id!=user.id:raise HTTPException(404,'Upload not found.')
        if row.offset!=upload_offset:raise HTTPException(409,detail={'message':'Upload offset conflict','expected':row.offset})
        path=store.filename(row.storage_key) # type: ignore[union-attr]
        # One resumable chunk per request, maximum 8 MiB; reject unordered/replayed bytes.
        payload=bytearray()
        async for chunk in request.stream():
            payload.extend(chunk)
            if len(payload)>CHUNK_LIMIT:raise HTTPException(413,'Chunk exceeds 8 MiB.')
        if not payload:raise HTTPException(422,'Upload chunk must be non-empty.')
        if row.offset+len(payload)>row.size_bytes:raise HTTPException(413,'Chunk exceeds reserved upload length.')
        mode='r+b' if path.exists() else 'w+b'
        with path.open(mode) as f:
            import fcntl
            fcntl.flock(f,fcntl.LOCK_EX)
            f.seek(0,2)
            # A process may have crashed after fsync but before the SQL offset commit.
            # Recover by discarding *only* bytes beyond the last committed offset.
            current_size=f.tell()
            if current_size<row.offset:raise HTTPException(409,'Resumable upload is missing committed bytes; restart safely.')
            if current_size>row.offset:
                f.truncate(row.offset)
                f.flush()
            f.seek(row.offset)
            f.write(payload);f.flush()
            import os;os.fsync(f.fileno())
            fcntl.flock(f,fcntl.LOCK_UN)
        row.offset+=len(payload)
        if row.offset==row.size_bytes:
            digest=hashlib.sha256()
            with path.open('rb') as f:
                prefix=f.read(8);digest.update(prefix)
                for chunk in iter(lambda:f.read(1024*1024),b''):digest.update(chunk)
            if digest.hexdigest()!=row.sha256:
                session.delete(row);session.commit();store.remove(row.storage_key) # type: ignore[union-attr]
                raise HTTPException(422,'Final upload SHA-256 did not match; incomplete media was discarded.')
            if row.kind=='pdf':
                try:validate_pdf(row.mime_type,prefix)
                except HTTPException:
                    session.delete(row);session.commit();store.remove(row.storage_key)
                    raise
            elif not ((row.mime_type=='video/webm' and prefix.startswith(b'\x1a\x45\xdf\xa3')) or (row.mime_type=='video/mp4' and prefix[4:8]==b'ftyp')):
                session.delete(row);session.commit();store.remove(row.storage_key)
                raise HTTPException(415,'Video signature mismatch.')
            file=PrivateFile(lesson_id=row.lesson_id,owner_id=user.id,storage_key=row.storage_key,kind=row.kind,
                             mime_type=row.mime_type,sha256=row.sha256,size_bytes=row.size_bytes)
            session.add(file);session.delete(row);session.commit()
            return {'complete':True,'file_id':file.id,'offset':file.size_bytes}
        session.commit();return {'complete':False,'offset':row.offset}

    @api.delete('/uploads/{upload_id}',status_code=204)
    def abort_upload(upload_id:str,user:User=Depends(me),session:Session=Depends(db)):
        row=session.get(UploadSession,upload_id)
        if not row or row.owner_id!=user.id:raise HTTPException(404,'Upload not found.')
        key=row.storage_key;session.delete(row);session.commit();store.remove(key) # type: ignore[union-attr]
        return Response(status_code=204)

    def require_admin(user:User):
        if user.role!='school_admin' or not user.school_id:raise HTTPException(403,'School administrator role required.')

    @api.post('/users/teachers',status_code=201)
    def create_teacher(item:AuthPayload,user:User=Depends(me),session:Session=Depends(db)):
        require_admin(user)
        email=item.email.strip().casefold()
        if session.scalar(select(User.id).where(User.email==email)):
            raise HTTPException(409,'This email address is already registered.')
        teacher=User(email=email,password_hash=password_hash(item.password),role='teacher',school_id=user.school_id)
        session.add(teacher);session.commit()
        return {'id':teacher.id,'email':teacher.email,'school_id':teacher.school_id,'role':teacher.role}

    @api.get('/lessons/{lesson_id}/files')
    def list_lesson_files(lesson_id:str,user:User=Depends(me),session:Session=Depends(db)):
        owned(session,lesson_id,user)
        files=session.scalars(select(PrivateFile).where(PrivateFile.lesson_id==lesson_id,PrivateFile.owner_id==user.id)).all()
        return [{'id':f.id,'kind':f.kind,'mime_type':f.mime_type,'sha256':f.sha256,'size_bytes':f.size_bytes}
                for f in files]

    @api.get('/courses')
    def courses(user:User=Depends(me),session:Session=Depends(db)):
        if not user.school_id:return []
        rows=session.scalars(select(Course).where(Course.school_id==user.school_id)).all()
        return [{'id':x.id,'title':x.title,'published':x.published} for x in rows]

    @api.post('/courses',status_code=201)
    def create_course(item:CourseInput,user:User=Depends(me),session:Session=Depends(db)):
        require_admin(user)
        obj=Course(school_id=user.school_id,title=item.title,published=False)
        session.add(obj);session.commit();return {'id':obj.id,'title':obj.title,'published':False}

    @api.post('/courses/{course_id}/lessons',status_code=201)
    def attach_course_lesson(course_id:str,item:CourseLessonInput,user:User=Depends(me),session:Session=Depends(db)):
        require_admin(user)
        course=session.get(Course,course_id)
        if not course or course.school_id!=user.school_id:raise HTTPException(404,'Course not found.')
        lesson=owned(session,item.lessonId,user)
        if lesson.school_id!=user.school_id:raise HTTPException(403,'Lesson does not belong to this school.')
        if session.scalar(select(CourseLesson.id).where(CourseLesson.course_id==course_id,CourseLesson.lesson_id==lesson.id)):
            raise HTTPException(409,'Lesson is already in the course.')
        row=CourseLesson(course_id=course_id,lesson_id=lesson.id);session.add(row);session.commit()
        return {'course_id':course_id,'lesson_id':lesson.id}

    @api.patch('/courses/{course_id}/publish')
    def publish_course(course_id:str,user:User=Depends(me),session:Session=Depends(db)):
        require_admin(user)
        course=session.get(Course,course_id)
        if not course or course.school_id!=user.school_id:raise HTTPException(404,'Course not found.')
        if not session.scalar(select(CourseLesson.id).where(CourseLesson.course_id==course_id)):
            raise HTTPException(422,'A course must contain at least one consented lesson before publishing.')
        course.published=True;session.commit();return {'id':course.id,'published':True}

    app.include_router(api)
    return app


# Application factory reads secure configuration at startup; cloud stays disabled by default.
app=create_app()
