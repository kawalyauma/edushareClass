"""EduShareClass opt-in cloud export: authenticated Lambda Function URL control plane.

Browser -> temporary presigned S3 PUT (raw saved clips, no browser canvas re-encode).
Worker -> private SQS -> FFmpeg -> private S3 rendered MP4.
User-selected 4-digit PIN plus strict per-IP and daily cost guard. Not an identity system.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import re
import time
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from quota import reserve_upload, UploadQuotaExceeded, MAX_JOB_BYTES, MAX_JOB_DURATION_MS

REGION = os.environ["AWS_REGION"]
BUCKET = os.environ["EDUSHARE_RENDER_BUCKET"]
QUEUE_URL = os.environ["EDUSHARE_RENDER_QUEUE_URL"]
INSTANCE_ID = os.environ["EDUSHARE_RENDER_INSTANCE_ID"]
ACCESS_HASH = os.environ["EDUSHARE_RENDER_ACCESS_HASH"]

# Force a region-specific S3 endpoint. Global s3.amazonaws.com 307 redirects
# change the signed host and cause SignatureDoesNotMatch on browser PUT.
s3 = boto3.client(
    "s3",region_name=REGION,
    endpoint_url=f"https://s3.{REGION}.amazonaws.com",
    config=Config(signature_version="s3v4",s3={"addressing_style":"virtual"}),
)
sqs = boto3.client("sqs")
ec2 = boto3.client("ec2")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
SEG_ID = re.compile(r"^[a-zA-Z0-9_-]{1,96}$")
MAX_SEGMENTS = 40
MAX_CLIPS = 150
MAX_VIDEO_BYTES = 750 * 1024 * 1024
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
MAX_DURATION = 2 * 3600 * 1000


def response(code, data):
    return {
        "statusCode": code,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(data, separators=(",", ":")),
    }


def valid_access(event):
    headers = {str(k).lower():v for k,v in (event.get("headers") or {}).items()}
    token = headers.get("authorization", "")
    if not isinstance(token, str) or not token.startswith("Bearer "):
        return False
    supplied = token[7:]
    if not re.fullmatch(r"[0-9]{4}",supplied):
        return False
    digest = hashlib.sha256(supplied.encode("utf-8")).hexdigest()
    return hmac.compare_digest(digest, ACCESS_HASH)


def data_body(event):
    text = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64
        text = base64.b64decode(text).decode("utf-8")
    if len(text) > 65536:
        raise ValueError("Job request exceeds 64 KiB")
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("Body must be a JSON object")
    return value


def load(job_id):
    return json.loads(s3.get_object(Bucket=BUCKET, Key=f"jobs/{job_id}.json")["Body"].read())


def save(job):
    s3.put_object(
        Bucket=BUCKET,
        Key=f"jobs/{job['jobId']}.json",
        Body=json.dumps(job, separators=(",", ":")).encode(),
        ContentType="application/json",
        ServerSideEncryption="AES256",
        CacheControl="no-store",
    )


def text_field(value, max_length):
    if not isinstance(value, str):
        raise ValueError("Text must be a string")
    return "".join(ch for ch in value if ch.isprintable() and ch not in "\\r\\n")[:max_length]


def validate_new_job(body):
    segments = body.get("segments")
    clips = body.get("clips")
    if not isinstance(segments, list) or not 1 <= len(segments) <= MAX_SEGMENTS:
        raise ValueError("Supply 1-40 saved media segments")
    if not isinstance(clips, list) or not 1 <= len(clips) <= MAX_CLIPS:
        raise ValueError("Supply 1-150 edited timeline clips")
    seen = set()
    size_sum = 0
    clean_segments = []
    for segment in segments:
        if not isinstance(segment, dict):
            raise ValueError("Invalid segment")
        segment_id = segment.get("segmentId")
        mime = segment.get("mimeType")
        length = segment.get("sizeBytes")
        if not isinstance(segment_id, str) or not SEG_ID.fullmatch(segment_id) or segment_id in seen:
            raise ValueError("Invalid or repeated segment ID")
        if mime not in ("video/webm", "video/mp4"):
            raise ValueError("Only video/webm and video/mp4 are supported")
        if type(length) is not int or length < 1 or length > MAX_VIDEO_BYTES:
            raise ValueError("Source recording exceeds 750 MiB")
        seen.add(segment_id)
        size_sum += length
        clean_segments.append({"segmentId":segment_id, "mimeType":mime, "sizeBytes":length})
    if size_sum > MAX_JOB_BYTES:
        raise ValueError("Total cloud upload exceeds 750 MiB")
    total = 0.0
    clean_clips = []
    for clip in clips:
        if not isinstance(clip, dict) or clip.get("segmentId") not in seen:
            raise ValueError("Timeline references an unknown recording")
        start, stop, rate = (clip.get("sourceInMs"), clip.get("sourceOutMs"), clip.get("rate"))
        if not all(type(n) in (int, float) and math.isfinite(float(n)) for n in (start,stop,rate)):
            raise ValueError("Trim values must be finite numbers")
        if start < 0 or stop <= start or not 0.5 <= rate <= 2:
            raise ValueError("Invalid trim range or playback speed")
        if stop > MAX_DURATION:
            raise ValueError("Clip position exceeds 2-hour limit")
        total += (stop - start) / rate
        clean_clips.append({
            "segmentId":clip["segmentId"],
            "sourceInMs":int(round(start)),
            "sourceOutMs":int(round(stop)),
            "rate":float(rate),
        })
    if not 0 < total <= MAX_JOB_DURATION_MS:
        raise ValueError("PIN export supports a maximum of 30 minutes per lesson")
    brand = body.get("branding") or {}
    if not isinstance(brand, dict):
        raise ValueError("Branding must be an object")
    return clean_segments, clean_clips, {
        "enabled":brand.get("enabled") is True,
        "lessonTitle":text_field(body.get("lessonTitle", ""), 100),
        "teacherName":text_field(brand.get("teacherName", ""), 65),
        "caption":text_field(brand.get("caption", ""), 42),
    }, int(round(total))


def create(event):
    body = data_body(event)
    segments, clips, branding, duration = validate_new_job(body)
    reserve_upload(event, sum(s["sizeBytes"] for s in segments), duration)
    job_id = str(uuid.uuid4())
    put_urls = []
    for segment in segments:
        extension = "webm" if segment["mimeType"] == "video/webm" else "mp4"
        key = f"uploads/{job_id}/{segment['segmentId']}.{extension}"
        segment["key"] = key
        url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket":BUCKET,"Key":key,"ContentType":segment["mimeType"]},
            ExpiresIn=900,
        )
        put_urls.append({"segmentId":segment["segmentId"],"url":url,"mimeType":segment["mimeType"]})
    save({
        "version":2, "jobId":job_id,"status":"awaiting_upload",
        "createdAt":int(time.time()),
        "segments":segments,"clips":clips,"branding":branding,
        "durationMs":duration,"outputKey":f"renders/{job_id}.mp4",
    })
    return response(201,{"jobId":job_id,"status":"awaiting_upload","uploads":put_urls})


def begin(job_id):
    job = load(job_id)
    if job["status"] != "awaiting_upload":
        return response(409,{"error":"Job already started; see status","status":job["status"]})
    for segment in job["segments"]:
        key = segment["key"]
        try:
            meta = s3.head_object(Bucket=BUCKET,Key=key)
        except ClientError as ex:
            if ex.response["Error"]["Code"] in ("404","NoSuchKey"):
                raise ValueError("Upload is incomplete: "+segment["segmentId"]) from None
            raise
        if meta["ContentLength"] != segment["sizeBytes"]:
            raise ValueError("Uploaded clip size does not match the saved recording")
        if meta.get("ContentType") != segment["mimeType"]:
            raise ValueError("Uploaded media type changed unexpectedly")
    job["status"] = "queued"
    job["queuedAt"] = int(time.time())
    save(job)
    try:
        sqs.send_message(QueueUrl=QUEUE_URL,MessageBody=json.dumps({"version":2,"jobId":job_id}))
    except Exception:
        job["status"]="awaiting_upload"
        save(job)
        raise
    state = ec2.describe_instances(InstanceIds=[INSTANCE_ID])
    machines = [i for res in state["Reservations"] for i in res["Instances"]]
    if len(machines) == 1 and machines[0]["State"]["Name"] == "stopped":
        ec2.start_instances(InstanceIds=[INSTANCE_ID])
    return response(202,{"jobId":job_id,"status":"queued"})


def state(job_id):
    job = load(job_id)
    public = {
        "jobId":job_id,"status":job["status"],
        "durationMs":job.get("durationMs",0),
        "error":job.get("error"),
    }
    if job["status"]=="completed":
        try:
            output = s3.head_object(Bucket=BUCKET,Key=job["outputKey"])
            if output["ContentLength"]>0:
                public["sizeBytes"] = output["ContentLength"]
                public["downloadUrl"] = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket":BUCKET,"Key":job["outputKey"],
                            "ResponseContentDisposition":f'attachment; filename="edushareclass-{job_id}.mp4"'},
                    ExpiresIn=900,
                )
            else:
                public["status"]="failed"
        except ClientError:
            public["status"]="failed"
            public["error"]="Worker reports completion but video is missing"
    return response(200,public)


def cancel(job_id):
    job = load(job_id)
    if job["status"] in ("completed","failed","cancelled"):
        return response(409,{"error":"Job already finished"})
    job["status"]="cancelled"
    save(job)
    return response(200,{"jobId":job_id,"status":"cancelled"})


def lambda_handler(event, context):
    try:
        if not valid_access(event):
            return response(401,{"error":"Incorrect uploader PIN"})
        raw_path = event.get("rawPath") or "/"
        method = event.get("requestContext",{}).get("http",{}).get("method","GET")
        parts = [part for part in raw_path.split("/") if part]
        if method == "GET" and parts == ["v1","health"]:
            return response(200,{"status":"ok","service":"EduShare cloud video export"})
        if method=="POST" and parts==["v1","jobs"]:
            return create(event)
        if len(parts)==3 and parts[:2]==["v1","jobs"] and UUID.fullmatch(parts[2]):
            job_id=parts[2]
            if method=="POST":
                return begin(job_id)
            if method=="GET":
                return state(job_id)
            if method=="DELETE":
                return cancel(job_id)
        return response(404,{"error":"Unknown rendering endpoint"})
    except UploadQuotaExceeded as exc:
        return response(429,{"error":str(exc)})
    except ValueError as exc:
        return response(400,{"error":str(exc)})
    except ClientError as exc:
        name = exc.response.get("Error",{}).get("Code","")
        if name in ("NoSuchKey","404","NotFound"):
            return response(404,{"error":"Rendering job was not found"})
        print("AWS request error",name)
        return response(503,{"error":"Rendering storage is temporarily unavailable"})
    except Exception as exc:
        print("Rendering service failed",type(exc).__name__,str(exc)[:130])
        return response(503,{"error":"Rendering service is temporarily unavailable"})
