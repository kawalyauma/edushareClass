#!/usr/bin/env python3
"""Live opt-in smoke test: last accessible browser QA recording -> S3 -> SQS -> FFmpeg -> MP4.

No credentials, request signatures or teacher videos are printed. Local smoke
output is private and never committed. A separate user's browser recording
cannot be tested unless its IndexedDB source is explicitly accessible.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import time
import requests

BASE=Path("/home/codexagent/workspace/edushareclass-deploy")
CONFIG=json.loads((BASE/"tools/video-renderer/cloud-export-api.json").read_text())
SECRET=(BASE/"tools/video-renderer/cloud-export-access.secret").read_text().strip()
URL=CONFIG["functionUrl"].rstrip("/")
SOURCE=BASE/"logs/notesug-branded-export.webm"
BRANDED=os.environ.get("EDUSHARE_SMOKE_BRANDED","0")=="1"
RESULT=BASE/("logs/aws-cloud-branded-smoke-output.mp4" if BRANDED else "logs/aws-cloud-smoke-output.mp4")
LOG=BASE/("logs/aws-cloud-branded-smoke-result.json" if BRANDED else "logs/aws-cloud-smoke-result.json")
HEADERS={"Authorization":"Bearer "+SECRET}
TIMEOUT=26

def request(method,path,payload=None):
    response=requests.request(
        method,URL+path,
        headers={**HEADERS,**({"content-type":"application/json"} if payload is not None else {})},
        json=payload,timeout=TIMEOUT)
    try:data=response.json()
    except ValueError:data={"nonJsonStatus":response.status_code}
    return response.status_code,data

def check(condition,message):
    if not condition:raise RuntimeError(message)

def media(path):
    return json.loads(subprocess.check_output([
        "ffprobe","-v","error","-show_entries",
        "format=duration,size:stream=codec_name,codec_type,width,height",
        "-of","json",str(path)
    ],text=True,timeout=30))

def main():
    check(SOURCE.is_file(),"Recording QA source not present")
    code,body=request("GET","/v1/health")
    check(code==200, f"Auth health failed ({code})")
    bad=requests.get(URL+"/v1/health",timeout=TIMEOUT)
    check(bad.status_code==401,"Unauthorized remote requests must be denied")
    print("AUTHENTICATION_CONFIRMED",flush=True)
    clip={
        "segmentId":"latest-qa-recording",
        "sourceInMs":0,"sourceOutMs":12000,"rate":1
    }
    code,body=request("POST","/v1/jobs",{
        "lessonTitle":"EduShare Recording Export Verification",
        "segments":[{"segmentId":"latest-qa-recording","sizeBytes":SOURCE.stat().st_size,"mimeType":"video/webm"}],
        "clips":[clip],
        "branding":{"enabled":BRANDED,"teacherName":"EduShare QA Teacher","caption":"Test recording"},
    })
    check(code==201 and "jobId" in body and len(body.get("uploads",[]))==1,
          f"Job creation failed ({code}) {body}")
    job_id=body["jobId"]
    print("CLOUD_JOB_CREATED",job_id,flush=True)
    upload=body["uploads"][0]
    with SOURCE.open("rb") as source:
        uploaded=requests.put(
            upload["url"],data=source,
            headers={"Content-Type":"video/webm"},timeout=100)
    check(uploaded.status_code==200,f"Private S3 upload failed ({uploaded.status_code})")
    print("PRIVATE_SOURCE_UPLOADED",SOURCE.stat().st_size,flush=True)
    code,body=request("POST","/v1/jobs/"+job_id)
    check(code==202 and body.get("status")=="queued",f"Queueing failed ({code}) {body}")
    print("CLOUD_JOB_QUEUED",flush=True)
    deadline=time.monotonic()+9*60
    status="queued"
    prev=None
    while time.monotonic()<deadline:
        code,body=request("GET","/v1/jobs/"+job_id)
        check(code==200,f"Poll failed ({code}) {body}")
        status=body.get("status")
        if status!=prev:
            print("CLOUD_RENDER_STATUS",status,flush=True)
            prev=status
        if status=="completed":
            url=body.get("downloadUrl")
            check(url and url.startswith("https://") and body.get("sizeBytes",0)>1500,
                  "Cloud completion lacked usable private MP4")
            with requests.get(url,stream=True,timeout=95) as download:
                check(download.status_code==200,
                      f"Signed MP4 download failed ({download.status_code})")
                with RESULT.open("wb") as output:
                    for chunk in download.iter_content(chunk_size=65536):
                        output.write(chunk)
            break
        if status in ("failed","cancelled"):
            raise RuntimeError("Cloud worker failed: "+str(body.get("error","no details")))
        time.sleep(6)
    else:
        raise TimeoutError(f"Cloud worker did not complete; last status={status}, job={job_id}")
    info=media(RESULT)
    streams=info.get("streams",[])
    video=next((s for s in streams if s.get("codec_type")=="video"),None)
    audio=next((s for s in streams if s.get("codec_type")=="audio"),None)
    duration=float(info["format"]["duration"])
    check(video and video.get("codec_name")=="h264","Output missing H.264 video")
    check(audio and audio.get("codec_name")=="aac","Output missing AAC audio")
    check(video["width"]==1920 and video["height"]==1080,"Output not 1080p")
    expected=16.2 if BRANDED else 12.0
    check(abs(duration-expected)<=0.7,f"Duration mismatch {duration} expected={expected}")
    output={
        "jobId":job_id,
        "status":"completed",
        "sourcePath":str(SOURCE),
        "mp4Path":str(RESULT),
        "mp4Bytes":RESULT.stat().st_size,
        "mp4DurationSeconds":duration,
        "resolution":"1920x1080",
        "videoCodec":"h264",
        "audioCodec":"aac",
        "sourceOrigin":"Earlier browser QA recording; not owner's separate browser session",
        "notesugBranding":BRANDED,
        "awsAccount":CONFIG["account"],
        "awsRegion":CONFIG["region"],
    }
    fd=os.open(LOG,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
    with os.fdopen(fd,"w") as file:
        json.dump(output,file,indent=2);file.write("\n")
    print("FINAL_MP4_VALIDATED",json.dumps(output),flush=True)

if __name__=="__main__":
    main()
