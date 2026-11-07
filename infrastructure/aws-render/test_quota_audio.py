#!/usr/bin/env python3
"""Offline safety tests for PIN-access EduShare quota and speech mastering."""
from __future__ import annotations
import importlib.util
import hashlib
import os
from pathlib import Path
import unittest
from unittest.mock import Mock

from botocore.exceptions import ClientError

ROOT=Path(__file__).parent
os.environ.setdefault("EDUSHARE_RENDER_QUOTA_TABLE","EduShareCloudRenderQuota")
os.environ.setdefault("AWS_DEFAULT_REGION","eu-north-1")
os.environ.setdefault("AWS_REGION","eu-north-1")
os.environ.setdefault("EDUSHARE_RENDER_BUCKET","test-bucket")
os.environ.setdefault("EDUSHARE_RENDER_QUEUE_URL","https://sqs.eu-north-1.amazonaws.com/000000000000/test")
os.environ.setdefault("EDUSHARE_RENDER_INSTANCE_ID","i-00000000000000000")
os.environ.setdefault("EDUSHARE_RENDER_ACCESS_HASH",hashlib.sha256(b"2468").hexdigest())


def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/(name+".py"))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


quota=load("quota")
master=load("audio_mastering")
handler=load("handler")


class QuotaTests(unittest.TestCase):
    def setUp(self):
        self.original=quota.quota_store
        quota.quota_store=Mock()
        self.event={"requestContext":{"http":{"sourceIp":"203.0.113.32"}}}

    def tearDown(self):
        quota.quota_store=self.original

    def test_atomic_daily_and_ip_counter_transaction(self):
        quota.reserve_upload(self.event,2048,8500)
        items=quota.quota_store.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(items),2)
        global_write,ip_write=[part["Update"] for part in items]
        self.assertTrue(global_write["Key"]["pk"]["S"].startswith("global#"))
        self.assertTrue(ip_write["Key"]["pk"]["S"].startswith("ip#"))
        self.assertNotIn("203.0.113.32",ip_write["Key"]["pk"]["S"])
        self.assertEqual(global_write["ExpressionAttributeValues"][":bytes"]["N"],"2048")
        self.assertEqual(global_write["ExpressionAttributeValues"][":duration"]["N"],"8500")
        self.assertEqual(global_write["ExpressionAttributeValues"][":maxJobs"]["N"],str(quota.MAX_JOBS_PER_DAY))
        self.assertEqual(ip_write["ExpressionAttributeValues"][":maxJobs"]["N"],str(quota.MAX_JOBS_PER_IP_PER_DAY))

    def test_invalid_upload_is_not_reserved(self):
        with self.assertRaises(quota.UploadQuotaExceeded):
            quota.reserve_upload(self.event,quota.MAX_JOB_BYTES+1,500)
        with self.assertRaises(quota.UploadQuotaExceeded):
            quota.reserve_upload(self.event,200,quota.MAX_JOB_DURATION_MS+1)
        with self.assertRaises(quota.UploadQuotaExceeded):
            quota.reserve_upload({"requestContext":{"http":{}}},200,500)
        quota.quota_store.transact_write_items.assert_not_called()

    def test_conditional_transaction_rejection_is_a_rate_limit(self):
        quota.quota_store.transact_write_items.side_effect=ClientError(
            {"Error":{"Code":"TransactionCanceledException","Message":"Condition failed"}},
            "TransactWriteItems",
        )
        with self.assertRaisesRegex(quota.UploadQuotaExceeded,"Daily shared"):
            quota.reserve_upload(self.event,2048,8500)


class PinValidationTests(unittest.TestCase):
    def test_four_digit_pin_replaces_old_long_access_codes(self):
        self.assertTrue(handler.valid_access({"headers":{"authorization":"Bearer 2468"}}))
        self.assertFalse(handler.valid_access({"headers":{"authorization":"Bearer 2467"}}))
        self.assertFalse(handler.valid_access({"headers":{"authorization":"Bearer older-long-access-code"}}))
        self.assertFalse(handler.valid_access({"headers":{}}))

    def test_invalid_pin_rejected_before_any_external_aws_call(self):
        result=handler.lambda_handler({
            "headers":{"authorization":"Bearer 2467"},
            "rawPath":"/v1/jobs",
            "requestContext":{"http":{"method":"POST","sourceIp":"203.0.113.32"}},
        },None)
        self.assertEqual(result["statusCode"],401)


class AudioTests(unittest.TestCase):
    def test_adaptive_speech_chain_contains_denoising_and_safe_peak_limit(self):
        f=master.speech_mastering_filter(1.0)
        for name in ("highpass=","afftdn=","equalizer=","dynaudnorm=",
                     "asoftclip=","alimiter=limit=0.84","aresample=48000"):
            self.assertIn(name,f)
        self.assertNotIn("loudnorm",f)  # avoids over-attenuation of peaky input
        self.assertIn("atempo=1.0000",f)

    def test_speed_cannot_escape_static_filter(self):
        for bad in (0,0.49,2.01,20):
            with self.assertRaises(ValueError):
                master.speech_mastering_filter(bad)


if __name__=="__main__":
    unittest.main()
