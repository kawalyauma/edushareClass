from __future__ import annotations
import hashlib
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4
from fastapi import HTTPException

class PrivateStore:
    def __init__(self,root:Path):
        self.root=root.resolve()
        self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        os.chmod(self.root,0o700)
    def filename(self,key:str)->Path:
        if len(key)!=36 or any(x not in '0123456789abcdef-' for x in key):
            raise HTTPException(400,'Invalid storage key.')
        return self.root / key
    def create_key(self)->str:return str(uuid4())
    def remove(self,key:str):
        self.filename(key).unlink(missing_ok=True)
    async def save(self,key:str,stream,max_size:int)->tuple[int,str,bytes]:
        path=self.filename(key)
        h=hashlib.sha256()
        length=0
        prefix=bytearray()
        try:
            with NamedTemporaryFile(mode='wb',dir=self.root,prefix='.upload-',delete=False) as f:
                tmp=Path(f.name)
                os.chmod(tmp,0o600)
                async for chunk in stream:
                    length+=len(chunk)
                    if length>max_size:raise HTTPException(413,'Private upload exceeds size limit.')
                    if len(prefix)<8:prefix.extend(chunk[:8-len(prefix)])
                    h.update(chunk);f.write(chunk)
                f.flush();os.fsync(f.fileno())
            if path.exists():raise HTTPException(409,'Storage key collision.')
            os.replace(tmp,path)
            return length,h.hexdigest(),bytes(prefix)
        finally:
            if 'tmp' in locals():tmp.unlink(missing_ok=True)

def validate_pdf(mime:str,prefix:bytes):
    if mime!='application/pdf' or not prefix.startswith(b'%PDF-'):
        raise HTTPException(415,'Expected a real PDF file with %PDF- signature.')
