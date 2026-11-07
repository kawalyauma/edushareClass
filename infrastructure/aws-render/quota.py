"""Atomic cost guard for the owner-requested four-digit upload PIN.

PIN 1212 is convenience access, NOT secure per-teacher authentication.
A globally bounded daily allowance ensures unauthenticated internet traffic
cannot create unlimited paid AWS rendering jobs.
"""
from __future__ import annotations
from datetime import datetime, timezone
import hashlib
import os
import time

import boto3
from botocore.exceptions import ClientError

TABLE = os.environ["EDUSHARE_RENDER_QUOTA_TABLE"]
MAX_JOBS_PER_DAY = 24
MAX_JOBS_PER_IP_PER_DAY = 8
MAX_TOTAL_BYTES_PER_DAY = 4 * 1024 * 1024 * 1024
MAX_RENDER_MS_PER_DAY = 2 * 60 * 60 * 1000
MAX_JOB_BYTES = 750 * 1024 * 1024
MAX_JOB_DURATION_MS = 30 * 60 * 1000
quota_store = boto3.client("dynamodb")


class UploadQuotaExceeded(Exception):
    pass


def reserve_upload(event: dict, bytes_requested: int, duration_ms: int) -> None:
    """Reserve an atomic day+source-IP allowance before issuing any upload URL."""
    if (not isinstance(bytes_requested, int) or bytes_requested < 1
        or bytes_requested > MAX_JOB_BYTES
        or not isinstance(duration_ms, int) or duration_ms < 1
        or duration_ms > MAX_JOB_DURATION_MS):
        raise UploadQuotaExceeded(
            "Cloud export allows up to 750 MiB and 30 minutes per upload."
        )
    ip = str(event.get("requestContext",{}).get("http",{}).get("sourceIp",""))
    if not ip or len(ip)>128:
        raise UploadQuotaExceeded("Unable to determine uploader network address")
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    ip_id = hashlib.sha256(ip.encode()).hexdigest()[:32]
    expires = int(time.time()) + 3*24*3600
    common = {
        ":zero": {"N":"0"},
        ":one": {"N":"1"},
        ":bytes": {"N":str(bytes_requested)},
        ":duration": {"N":str(duration_ms)},
        ":expire": {"N":str(expires)},
    }
    daily = {
        "Update": {
            "TableName": TABLE,
            "Key": {"pk": {"S": "global#"+day}},
            "UpdateExpression":
                "SET #jobs = if_not_exists(#jobs,:zero) + :one, "
                "#bytes = if_not_exists(#bytes,:zero) + :bytes, "
                "#duration = if_not_exists(#duration,:zero) + :duration, "
                "expiresAt = :expire",
            "ConditionExpression":
                "attribute_not_exists(pk) OR "
                "(#jobs < :maxJobs AND #bytes <= :maxOldBytes "
                "AND #duration <= :maxOldDuration)",
            "ExpressionAttributeNames": {
                "#jobs":"jobs","#bytes":"bytes","#duration":"durationMs",
            },
            "ExpressionAttributeValues": {
                **common,
                ":maxJobs":{"N":str(MAX_JOBS_PER_DAY)},
                ":maxOldBytes":{"N":str(MAX_TOTAL_BYTES_PER_DAY-bytes_requested)},
                ":maxOldDuration":{"N":str(MAX_RENDER_MS_PER_DAY-duration_ms)},
            },
        }
    }
    individual = {
        "Update": {
            "TableName":TABLE,
            "Key":{"pk":{"S":"ip#"+day+"#"+ip_id}},
            "UpdateExpression":
                "SET #jobs = if_not_exists(#jobs,:zero) + :one, expiresAt = :expire",
            "ConditionExpression":
                "attribute_not_exists(pk) OR #jobs < :maxJobs",
            "ExpressionAttributeNames":{"#jobs":"jobs"},
            "ExpressionAttributeValues":{
                ":zero":{"N":"0"},":one":{"N":"1"},
                ":expire":{"N":str(expires)},
                ":maxJobs":{"N":str(MAX_JOBS_PER_IP_PER_DAY)},
            },
        }
    }
    try:
        quota_store.transact_write_items(
            TransactItems=[daily, individual],
        )
    except ClientError as exc:
        if exc.response.get("Error",{}).get("Code")=="TransactionCanceledException":
            raise UploadQuotaExceeded(
                "Daily shared rendering allowance reached. Please try tomorrow."
            ) from None
        raise
