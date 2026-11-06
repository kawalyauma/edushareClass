from __future__ import annotations
from datetime import datetime,timedelta,timezone
from uuid import uuid4
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError,VerificationError
from fastapi import HTTPException,status

_hasher=PasswordHasher(time_cost=2,memory_cost=19456,parallelism=2)
ISSUER='edushareclass'
AUDIENCE='edushareclass-cloud'

def password_hash(password:str)->str:
    if not 12<=len(password)<=128:raise HTTPException(422,'Password must be 12–128 characters.')
    return _hasher.hash(password)

def verify_password(password:str,digest:str)->bool:
    try:return _hasher.verify(digest,password)
    except (VerifyMismatchError,VerificationError):return False

def new_token(user_id:str,secret:str)->str:
    now=datetime.now(timezone.utc)
    return jwt.encode({'sub':user_id,'iat':now,'nbf':now,'exp':now+timedelta(minutes=30),
                       'iss':ISSUER,'aud':AUDIENCE,'jti':str(uuid4())},secret,algorithm='HS256')

def decode_token(token:str,secret:str)->str:
    try:
        payload=jwt.decode(token,secret,algorithms=['HS256'],issuer=ISSUER,audience=AUDIENCE,options={'require':['exp','iat','sub','iss','aud']})
        return str(payload['sub'])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,'Invalid or expired account token.',headers={'WWW-Authenticate':'Bearer'}) from None
