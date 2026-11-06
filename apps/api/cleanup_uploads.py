"""Cron-friendly private upload retention cleanup. No scheduler started automatically."""
from __future__ import annotations
from datetime import datetime,timedelta,timezone
from sqlalchemy import select
from edushare_api.db import UploadSession,make_engine,sessions
from edushare_api.settings import Settings
from edushare_api.private_storage import PrivateStore

def cleanup(older_than_hours:int=48)->int:
    if older_than_hours<1:raise ValueError('Cleanup threshold must be positive.')
    cfg=Settings.from_env()
    if not cfg.enabled:raise RuntimeError('Cloud is disabled; not touching private storage.')
    storage=PrivateStore(cfg.storage_dir)
    session=sessions(make_engine(cfg.database_url))()
    cutoff=datetime.now(timezone.utc)-timedelta(hours=older_than_hours)
    removed=[]
    try:
        for item in session.scalars(select(UploadSession)).all():
            created=item.created_at
            if created.tzinfo is None:created=created.replace(tzinfo=timezone.utc)
            if created<cutoff:
                removed.append(item.storage_key);session.delete(item)
        session.commit()
    finally:session.close()
    for key in removed:storage.remove(key)
    return len(removed)

if __name__=='__main__':
    print('Expired upload sessions removed:',cleanup())
