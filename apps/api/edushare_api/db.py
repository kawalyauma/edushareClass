from __future__ import annotations
from datetime import datetime,timezone
from uuid import uuid4
from sqlalchemy import (create_engine,Column,String,Integer,DateTime,ForeignKey,UniqueConstraint,JSON,Text,Boolean)
from sqlalchemy.orm import declarative_base,sessionmaker,relationship
from sqlalchemy.pool import StaticPool

Base=declarative_base()
def uuidstr():return str(uuid4())
def utcnow():return datetime.now(timezone.utc)

class School(Base):
    __tablename__='schools'
    id=Column(String(36),primary_key=True,default=uuidstr)
    name=Column(String(160),nullable=False)
    created_at=Column(DateTime(timezone=True),default=utcnow,nullable=False)

class User(Base):
    __tablename__='users'
    id=Column(String(36),primary_key=True,default=uuidstr)
    email=Column(String(320),unique=True,nullable=False,index=True)
    password_hash=Column(String(255),nullable=False)
    role=Column(String(32),nullable=False,default='teacher')
    school_id=Column(String(36),ForeignKey('schools.id'),nullable=True,index=True)
    created_at=Column(DateTime(timezone=True),default=utcnow,nullable=False)

class LessonRecord(Base):
    __tablename__='lessons'
    id=Column(String(128),primary_key=True)
    owner_id=Column(String(36),ForeignKey('users.id'),nullable=False,index=True)
    school_id=Column(String(36),ForeignKey('schools.id'),nullable=True,index=True)
    title=Column(String(200),nullable=False)
    payload=Column(JSON,nullable=False)
    version=Column(Integer,nullable=False,default=1)
    published=Column(Boolean,nullable=False,default=False)
    updated_at=Column(DateTime(timezone=True),default=utcnow,onupdate=utcnow,nullable=False)

class PrivateFile(Base):
    __tablename__='private_files'
    id=Column(String(36),primary_key=True,default=uuidstr)
    lesson_id=Column(String(128),ForeignKey('lessons.id'),nullable=False,index=True)
    owner_id=Column(String(36),ForeignKey('users.id'),nullable=False,index=True)
    storage_key=Column(String(80),unique=True,nullable=False)
    kind=Column(String(16),nullable=False)
    mime_type=Column(String(80),nullable=False)
    sha256=Column(String(64),nullable=False)
    size_bytes=Column(Integer,nullable=False)
    created_at=Column(DateTime(timezone=True),default=utcnow,nullable=False)

class UploadSession(Base):
    __tablename__='upload_sessions'
    id=Column(String(36),primary_key=True,default=uuidstr)
    lesson_id=Column(String(128),ForeignKey('lessons.id'),nullable=False)
    owner_id=Column(String(36),ForeignKey('users.id'),nullable=False,index=True)
    kind=Column(String(16),nullable=False)
    mime_type=Column(String(80),nullable=False)
    sha256=Column(String(64),nullable=False)
    size_bytes=Column(Integer,nullable=False)
    offset=Column(Integer,nullable=False,default=0)
    storage_key=Column(String(80),unique=True,nullable=False)
    created_at=Column(DateTime(timezone=True),default=utcnow,nullable=False)

class Course(Base):
    __tablename__='courses'
    id=Column(String(36),primary_key=True,default=uuidstr)
    school_id=Column(String(36),ForeignKey('schools.id'),nullable=False,index=True)
    title=Column(String(200),nullable=False)
    published=Column(Boolean,nullable=False,default=False)
    created_at=Column(DateTime(timezone=True),default=utcnow,nullable=False)

class CourseLesson(Base):
    __tablename__='course_lessons'
    id=Column(String(36),primary_key=True,default=uuidstr)
    course_id=Column(String(36),ForeignKey('courses.id'),nullable=False,index=True)
    lesson_id=Column(String(128),ForeignKey('lessons.id'),nullable=False)
    __table_args__=(UniqueConstraint('course_id','lesson_id',name='uq_course_lesson'),)

def make_engine(url:str):
    opts={'connect_args':{'check_same_thread':False}} if url.startswith('sqlite') else {'pool_pre_ping':True}
    if url=='sqlite://' :opts['poolclass']=StaticPool
    return create_engine(url,**opts)

def sessions(engine):return sessionmaker(bind=engine,autoflush=False,expire_on_commit=False)
