#!/usr/bin/env python3
"""Deploy the authenticated EduShare AWS cloud export API.

No application credentials are shipped to browser assets or Git.
Uploader PINs are not stored in code or returned to browser bundles.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import zipfile

import boto3
from botocore.exceptions import ClientError

ACCOUNT="417081976539"
REGION="eu-north-1"
PROFILE="edushare-renderer"
BUCKET=f"edushare-render-{ACCOUNT}-{REGION}"
QUEUE_URL=f"https://sqs.{REGION}.amazonaws.com/{ACCOUNT}/edushare-video-render-jobs"
QUEUE_ARN=f"arn:aws:sqs:{REGION}:{ACCOUNT}:edushare-video-render-jobs"
INSTANCE_ID="i-03d6552ce61bbc853"
FUNCTION="edushare-cloud-video-export"
ROLE="EduShareCloudExportApiRole"
WORKER_ROLE="EduShareVideoRendererRole"
QUOTA_TABLE="EduShareCloudRenderQuota"
ROOT=Path(__file__).parent
SECRETS=Path("/home/codexagent/workspace/edushareclass-deploy/tools/video-renderer")
LEGACY_ACCESS_FILE=SECRETS/"cloud-export-access.secret"
RESULT=SECRETS/"cloud-export-api.json"

# The system boto3 is older than AWS CLI's `aws login` credential provider.
# Resolve the named profile through AWS CLI without printing its temporary keys.
_process = subprocess.run(
    ["aws","configure","export-credentials","--profile",PROFILE,"--format","process"],
    capture_output=True,text=True,check=True,timeout=20,
)
_creds=json.loads(_process.stdout)
session=boto3.Session(
    aws_access_key_id=_creds["AccessKeyId"],
    aws_secret_access_key=_creds["SecretAccessKey"],
    aws_session_token=_creds.get("SessionToken"),
    region_name=REGION,
)
del _process,_creds
iam=session.client("iam")
lam=session.client("lambda")
s3=session.client("s3")
ec2=session.client("ec2")
dynamo=session.client("dynamodb")


def call(f,*args,**kwargs):
    return f(*args,**kwargs)


def iam_upsert():
    trust={"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
    try: role=iam.get_role(RoleName=ROLE)["Role"]
    except iam.exceptions.NoSuchEntityException:
        role=iam.create_role(RoleName=ROLE,AssumeRolePolicyDocument=json.dumps(trust),Description="EduShare cloud video export gated control plane")["Role"]
        print("CREATED_IAM_ROLE",ROLE,flush=True)
    iam.attach_role_policy(RoleName=ROLE,PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole")
    policy={"Version":"2012-10-17","Statement":[
        {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject"],"Resource":f"arn:aws:s3:::{BUCKET}/jobs/*"},
        {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject"],"Resource":f"arn:aws:s3:::{BUCKET}/uploads/*"},
        {"Effect":"Allow","Action":["s3:GetObject"],"Resource":f"arn:aws:s3:::{BUCKET}/renders/*"},
        {"Effect":"Allow","Action":["sqs:SendMessage"],"Resource":QUEUE_ARN},
        {"Effect":"Allow","Action":["dynamodb:TransactWriteItems"],
         "Resource":f"arn:aws:dynamodb:{REGION}:{ACCOUNT}:table/{QUOTA_TABLE}"},
        {"Effect":"Allow","Action":["ec2:DescribeInstances"],"Resource":"*"},
        {"Effect":"Allow","Action":["ec2:StartInstances"],"Resource":f"arn:aws:ec2:{REGION}:{ACCOUNT}:instance/{INSTANCE_ID}"},
    ]}
    iam.put_role_policy(RoleName=ROLE,PolicyName="EduShareSingleQueueRenderAccess",PolicyDocument=json.dumps(policy))
    role_policy={"Version":"2012-10-17","Statement":[
        {"Sid":"JobMetadataReadWrite","Effect":"Allow","Action":["s3:PutObject","s3:GetObject"],
         "Resource":f"arn:aws:s3:::{BUCKET}/jobs/*"},
        {"Sid":"ReadUploadsAndWorkerCode","Effect":"Allow","Action":["s3:GetObject"],
         "Resource":[f"arn:aws:s3:::{BUCKET}/uploads/*",f"arn:aws:s3:::{BUCKET}/service/*"]},
        {"Sid":"WriteOutput","Effect":"Allow","Action":["s3:PutObject"],
         "Resource":f"arn:aws:s3:::{BUCKET}/renders/*"},
        {"Sid":"ReadOneQueue","Effect":"Allow",
         "Action":["sqs:ReceiveMessage","sqs:DeleteMessage","sqs:ChangeMessageVisibility","sqs:GetQueueAttributes"],
         "Resource":QUEUE_ARN},
    ]}
    iam.put_role_policy(RoleName=WORKER_ROLE,PolicyName="EduSharePrivateVideoJobAccess",PolicyDocument=json.dumps(role_policy))
    print("WORKER_POLICY_UPDATED",flush=True)
    return role["Arn"]


def setup_storage():
    s3.put_bucket_cors(Bucket=BUCKET,CORSConfiguration={"CORSRules":[{
        "AllowedHeaders":["content-type"],"AllowedMethods":["PUT"],
        "AllowedOrigins":["https://notesug.com"],
        "ExposeHeaders":["ETag"],"MaxAgeSeconds":300
    }]})
    lifecycle={"Rules":[
        {"ID":"UploadFilesExpireAfterSevenDays","Status":"Enabled","Filter":{"Prefix":"uploads/"},"Expiration":{"Days":7}},
        {"ID":"RenderedFilesExpireAfterThirtyDays","Status":"Enabled","Filter":{"Prefix":"renders/"},"Expiration":{"Days":30}},
        {"ID":"JobMetadataExpireAfterThirtyDays","Status":"Enabled","Filter":{"Prefix":"jobs/"},"Expiration":{"Days":30}},
        {"ID":"CleanUnfinishedUploads","Status":"Enabled","Filter":{"Prefix":""},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}},
    ]}
    s3.put_bucket_lifecycle_configuration(Bucket=BUCKET,LifecycleConfiguration=lifecycle)
    s3.upload_file(str(ROOT/"worker.py"),BUCKET,"service/worker-v2.py",
                   ExtraArgs={"ContentType":"text/x-python","ServerSideEncryption":"AES256"})
    s3.upload_file(str(ROOT/"audio_mastering.py"),BUCKET,"service/audio_mastering.py",
                   ExtraArgs={"ContentType":"text/x-python","ServerSideEncryption":"AES256"})
    print("PRIVATE_STORAGE_READY",flush=True)


def private_access_key():
    pin=os.environ.get("EDUSHARE_UPLOAD_PIN", "")
    if len(pin)!=4 or not pin.isascii() or not pin.isdigit():
        raise RuntimeError("Set a four-digit uploader PIN in the deployment environment")
    return pin


def setup_quota():
    try:
        dynamo.describe_table(TableName=QUOTA_TABLE)
    except dynamo.exceptions.ResourceNotFoundException:
        dynamo.create_table(
            TableName=QUOTA_TABLE,
            AttributeDefinitions=[{"AttributeName":"pk","AttributeType":"S"}],
            KeySchema=[{"AttributeName":"pk","KeyType":"HASH"}],
            BillingMode="PAY_PER_REQUEST",
            Tags=[{"Key":"Project","Value":"EduShare"},
                  {"Key":"Component","Value":"RenderQuota"}],
        )
        print("QUOTA_TABLE_CREATED",QUOTA_TABLE,flush=True)
    dynamo.get_waiter("table_exists").wait(TableName=QUOTA_TABLE)
    ttl=dynamo.describe_time_to_live(TableName=QUOTA_TABLE).get("TimeToLiveDescription",{})
    if ttl.get("TimeToLiveStatus") not in ("ENABLED","ENABLING"):
        dynamo.update_time_to_live(
            TableName=QUOTA_TABLE,
            TimeToLiveSpecification={"Enabled":True,"AttributeName":"expiresAt"}
        )
    print("ATOMIC_QUOTAS_READY",QUOTA_TABLE,flush=True)


def lambda_zip():
    with tempfile.TemporaryFile() as fd:
        with zipfile.ZipFile(fd,"w",compression=zipfile.ZIP_DEFLATED) as z:
            z.write(ROOT/"handler.py","handler.py")
            z.write(ROOT/"quota.py","quota.py")
        fd.seek(0)
        return fd.read()


def create_lambda(role_arn,key):
    code=lambda_zip()
    environment={"Variables":{
        "EDUSHARE_RENDER_BUCKET":BUCKET,
        "EDUSHARE_RENDER_QUEUE_URL":QUEUE_URL,
        "EDUSHARE_RENDER_INSTANCE_ID":INSTANCE_ID,
        "EDUSHARE_RENDER_ACCESS_HASH":hashlib.sha256(key.encode()).hexdigest(),
        "EDUSHARE_RENDER_QUOTA_TABLE":QUOTA_TABLE,
    }}
    try:
        current=lam.get_function(FunctionName=FUNCTION)
    except lam.exceptions.ResourceNotFoundException:
        current=None
    if current:
        lam.update_function_code(FunctionName=FUNCTION,ZipFile=code,Publish=False)
        lam.get_waiter("function_updated").wait(FunctionName=FUNCTION,WaiterConfig={"Delay":3,"MaxAttempts":30})
        lam.update_function_configuration(
            FunctionName=FUNCTION,Environment=environment,Timeout=30,MemorySize=256)
        print("LAMBDA_UPDATED",flush=True)
    else:
        for attempt in range(5):
            try:
                lam.create_function(
                    FunctionName=FUNCTION,Runtime="python3.12",Role=role_arn,
                    Handler="handler.lambda_handler",Code={"ZipFile":code},
                    Environment=environment,
                    Timeout=30,MemorySize=256,
                    Description="EduShare opt-in browser video export. Secret required on every request.",
                    Tags={"Project":"EduShare","Component":"VideoExport","Environment":"Development"},
                )
                break
            except ClientError as e:
                if "cannot be assumed by Lambda" in str(e) and attempt<4:
                    time.sleep(6)
                else:raise
        print("LAMBDA_CREATED",flush=True)
    lam.get_waiter("function_updated").wait(FunctionName=FUNCTION,WaiterConfig={"Delay":2,"MaxAttempts":50})
    try:
        config=lam.get_function_url_config(FunctionName=FUNCTION)
    except lam.exceptions.ResourceNotFoundException:
        config=None
    cors={
        "AllowOrigins":["https://notesug.com"],
        "AllowMethods":["GET","POST","DELETE"],
        "AllowHeaders":["authorization","content-type"],
        "ExposeHeaders":[],
        "MaxAge":300,
    }
    if config:
        lam.update_function_url_config(FunctionName=FUNCTION,AuthType="NONE",Cors=cors)
        config=lam.get_function_url_config(FunctionName=FUNCTION)
    else:
        config=lam.create_function_url_config(FunctionName=FUNCTION,AuthType="NONE",Cors=cors)
        print("FUNCTION_URL_CREATED",flush=True)
    try:
        lam.add_permission(
            FunctionName=FUNCTION,StatementId="AllowFunctionUrlRequests",
            Action="lambda:InvokeFunctionUrl",Principal="*",FunctionUrlAuthType="NONE",
        )
    except ClientError as e:
        if e.response.get("Error",{}).get("Code")!="ResourceConflictException":raise
    # AWS CLI v2 supports the extra condition unsupported by system boto3 1.34.
    permission=subprocess.run([
        "aws","lambda","add-permission","--profile",PROFILE,"--region",REGION,
        "--function-name",FUNCTION,"--statement-id","AllowFunctionUrlInvoke",
        "--action","lambda:InvokeFunction","--principal","*",
        "--invoked-via-function-url",
    ],capture_output=True,text=True)
    if permission.returncode and "ResourceConflictException" not in permission.stderr:
        raise RuntimeError("Unable to set URL-only invoke permission: "+permission.stderr[-500:])
    print("URL_INVOKE_RESTRICTED_TO_FUNCTION_URL",flush=True)
    return config["FunctionUrl"]


def main():
    account=session.client("sts").get_caller_identity()["Account"]
    if account!=ACCOUNT:raise SystemExit("Wrong AWS account. Refusing to deploy")
    instance=ec2.describe_instances(InstanceIds=[INSTANCE_ID])["Reservations"][0]["Instances"][0]
    if instance["InstanceType"]!="m7i-flex.large":
        raise SystemExit("Expected approved m7i-flex.large instance")
    print("ACCOUNT_VERIFIED",account,flush=True)
    setup_quota()
    role=iam_upsert()
    setup_storage()
    key=private_access_key()
    url=create_lambda(role,key)
    import requests
    # Confirm the new PIN is live before revoking and deleting the older long code.
    old_code=LEGACY_ACCESS_FILE.read_text().strip() if LEGACY_ACCESS_FILE.exists() else None
    for attempt in range(10):
        try:
            auth=requests.get(url.rstrip("/")+"/v1/health",
                headers={"Authorization":"Bearer "+key},timeout=10)
            legacy=(requests.get(url.rstrip("/")+"/v1/health",
                headers={"Authorization":"Bearer "+old_code},timeout=10)
                if old_code and old_code != key else None)
            if auth.status_code==200 and (legacy is None or legacy.status_code==401):
                break
        except requests.RequestException:
            pass
        time.sleep(3)
    else:
        raise RuntimeError("New four-digit PIN or old-code revocation could not be verified")
    if LEGACY_ACCESS_FILE.exists():
        LEGACY_ACCESS_FILE.unlink()
    print("OLD_LONG_ACCESS_CODE_REVOKED_AND_DELETED",flush=True)
    result={"account":ACCOUNT,"region":REGION,"function":FUNCTION,"functionUrl":url,
            "workerInstanceId":INSTANCE_ID,"bucket":BUCKET,
            "authMode":"four_digit_shared_pin_with_atomic_quota","quotaTable":QUOTA_TABLE}
    fd=os.open(RESULT,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
    with os.fdopen(fd,"w") as f:json.dump(result,f,indent=2);f.write("\n")
    print("FUNCTION_URL",url,flush=True)
    print("FOUR_DIGIT_PIN_ACTIVE_WITH_QUOTAS",flush=True)
    print("DEPLOYMENT_RESULT",str(RESULT),flush=True)

if __name__=="__main__":
    main()
