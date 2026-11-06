"""Offline admin bootstrap. Reads credentials only from environment; never prints passwords."""
from __future__ import annotations
import os
from sqlalchemy import select
from edushare_api.settings import Settings
from edushare_api.db import School,User,Base,make_engine,sessions
from edushare_api.auth import password_hash

def main():
    cfg=Settings.from_env()
    if not cfg.enabled:raise RuntimeError('Enable EDUSHARE_CLOUD_ENABLED=1 explicitly.')
    email=os.environ['EDUSHARE_BOOTSTRAP_EMAIL'].strip().casefold()
    password=os.environ['EDUSHARE_BOOTSTRAP_PASSWORD']
    school_name=os.environ['EDUSHARE_BOOTSTRAP_SCHOOL'].strip()
    if not school_name:raise ValueError('School name required.')
    db=sessions(make_engine(cfg.database_url))()
    try:
        if db.scalar(select(User.id).where(User.email==email)):raise ValueError('Account already exists; refusing to overwrite.')
        school=School(name=school_name);db.add(school);db.flush()
        user=User(email=email,password_hash=password_hash(password),role='school_admin',school_id=school.id)
        db.add(user);db.commit()
        print('School administrator created:',user.id,'school:',school.id)
    finally:db.close()
if __name__=='__main__':main()
