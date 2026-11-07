#!/usr/bin/env python3
"""Browser CORS checks against the private production AWS video export endpoint.

Does not log bearer token, signed request URLs, clip contents or credentials.
"""
from __future__ import annotations
import json
from pathlib import Path
import requests

ROOT=Path("/home/codexagent/workspace/edushareclass-deploy")
CONF=json.loads((ROOT/"tools/video-renderer/cloud-export-api.json").read_text())
SECRET=(ROOT/"tools/video-renderer/cloud-export-access.secret").read_text().strip()
API=CONF["functionUrl"].rstrip("/")

def check():
    headers={
        "Origin":"https://notesug.com",
        "Access-Control-Request-Method":"POST",
        "Access-Control-Request-Headers":"authorization,content-type",
    }
    response=requests.options(API+"/v1/jobs",headers=headers,timeout=24)
    assert response.status_code in (200,204), "AWS API preflight failed"
    assert response.headers.get("Access-Control-Allow-Origin")=="https://notesug.com", "Lambda CORS origin rejected"
    print("LAMBDA_CORS_OK",response.status_code,flush=True)
    payload={
        "lessonTitle":"Private browser upload CORS check",
        "segments":[{"segmentId":"cors-only","mimeType":"video/webm","sizeBytes":1024}],
        "clips":[{"segmentId":"cors-only","sourceInMs":0,"sourceOutMs":1000,"rate":1}],
        "branding":{"enabled":False},
    }
    created=requests.post(
        API+"/v1/jobs",
        json=payload,
        headers={"Authorization":"Bearer "+SECRET,"Origin":"https://notesug.com"},
        timeout=24,
    )
    assert created.status_code==201,"Authenticated browser job creation failed"
    assert created.headers.get("Access-Control-Allow-Origin")=="https://notesug.com","Lambda response lacks CORS origin"
    print("AUTHENTICATED_BROWSER_JOB_CREATION_OK",flush=True)
    upload=created.json()["uploads"][0]["url"]
    response=requests.options(upload,headers={
        "Origin":"https://notesug.com",
        "Access-Control-Request-Method":"PUT",
        "Access-Control-Request-Headers":"content-type",
    },timeout=24)
    assert response.status_code in (200,204), "S3 CORS preflight failed"
    assert response.headers.get("Access-Control-Allow-Origin")=="https://notesug.com","S3 rejects the browser origin"
    assert "PUT" in response.headers.get("Access-Control-Allow-Methods",""),"S3 CORS missing PUT"
    print("S3_SIGNED_UPLOAD_BROWSER_CORS_OK",response.status_code,flush=True)

if __name__=="__main__":
    check()
