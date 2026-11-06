from __future__ import annotations
import os
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class Settings:
    database_url: str
    secret_key: str
    storage_dir: Path
    enabled: bool = False
    allow_signup: bool = False
    auto_create_schema: bool = False
    max_user_bytes: int = 1024 * 1024 * 1024
    max_pdf_bytes: int = 30 * 1024 * 1024
    max_media_bytes: int = 500 * 1024 * 1024
    allowed_origins: tuple[str,...] = ()

    @classmethod
    def from_env(cls) -> 'Settings':
        enabled=os.getenv('EDUSHARE_CLOUD_ENABLED','0')=='1'
        secret=os.getenv('EDUSHARE_JWT_SECRET','')
        if enabled and len(secret)<32:
            raise RuntimeError('Cloud API requires EDUSHARE_JWT_SECRET with at least 32 characters. Do not commit it.')
        directory=Path(os.getenv('EDUSHARE_PRIVATE_DIR','./private-data')).expanduser().resolve()
        url=os.getenv('EDUSHARE_DATABASE_URL','sqlite:///./edushare-local.db')
        return cls(database_url=url,secret_key=secret,storage_dir=directory,enabled=enabled,
                   allow_signup=os.getenv('EDUSHARE_ALLOW_SIGNUP','0')=='1',
                   auto_create_schema=os.getenv('EDUSHARE_CREATE_SCHEMA','0')=='1',
                   allowed_origins=tuple(x.strip() for x in os.getenv('EDUSHARE_CORS_ORIGINS','').split(',') if x.strip()))
