#!/usr/bin/env python3
"""EduShareClass privacy-preserving video renderer for the dedicated EC2 instance.

Consumes only UUID job references from SQS; loads validated job metadata from
private S3, performs edits with a fixed FFmpeg command template (no user-supplied
FFmpeg commands), saves MP4 and marks completion. No public ports needed.
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import boto3

from audio_mastering import MASTERING_VERSION, speech_mastering_filter

REGION = os.environ["AWS_REGION"]
BUCKET = os.environ["EDUSHARE_RENDER_BUCKET"]
QUEUE_URL = os.environ["EDUSHARE_RENDER_QUEUE_URL"]
s3 = boto3.client("s3",region_name=REGION)
sqs = boto3.client("sqs",region_name=REGION)
log = logging.getLogger("edushare-ffmpeg")
logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
SEG_ID = re.compile(r"^[A-Za-z0-9_-]{1,96}$")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MAX_BYTES = 750*1024*1024
MAX_DURATION = 7200

class Cancelled(Exception):
    pass

def manifest(job_id):
    return json.loads(s3.get_object(Bucket=BUCKET,Key="jobs/"+job_id+".json")["Body"].read())

def update(job_id, status, **fields):
    job = manifest(job_id)
    if job["status"] == "cancelled":
        raise Cancelled("Teacher cancelled the rendering job")
    job.update(fields)
    job["status"] = status
    job["updatedAt"] = int(time.time())
    s3.put_object(
        Bucket=BUCKET,Key="jobs/"+job_id+".json",
        Body=json.dumps(job,separators=(",",":")).encode(),
        ContentType="application/json",CacheControl="no-store",
        ServerSideEncryption="AES256",
    )
    return job

def inspect_media(path):
    process = subprocess.run(
        ["ffprobe","-v","error","-show_entries",
         "format=duration:stream=codec_type,width,height",
         "-of","json",str(path)],
        capture_output=True,text=True,check=True,timeout=75
    )
    data=json.loads(process.stdout)
    raw=data.get("format",{}).get("duration")
    duration=float(raw) if raw not in (None,"N/A") else float("nan")
    if not math.isfinite(duration):
        # Chrome MediaRecorder WebM clips often omit EBML/format duration.
        # Derive the end timestamp from the final demuxed packet instead.
        scan=subprocess.run(
            ["ffprobe","-v","error","-show_entries",
             "packet=pts_time,duration_time","-of","csv=p=0",str(path)],
            capture_output=True,text=True,check=True,timeout=180
        )
        duration=0.0
        for line in scan.stdout.splitlines():
            items=line.split(",")
            try:
                start=float(items[0])
                length=float(items[1]) if len(items)>1 and items[1] not in ("N/A","") else 0.0
                if math.isfinite(start):duration=max(duration,start+(length if math.isfinite(length) else 0.0))
            except (ValueError,IndexError):
                continue
    if not math.isfinite(duration) or duration <= 0 or duration > MAX_DURATION:
        raise ValueError("Video length outside supported 2-hour range")
    streams=data["streams"]
    if not any(s.get("codec_type")=="video" for s in streams):
        raise ValueError("Recording lacks video")
    video=next(s for s in streams if s.get("codec_type")=="video")
    if video.get("width",0)<=0 or video.get("height",0)<=0:
        raise ValueError("Invalid source video dimensions")
    return duration,any(s.get("codec_type")=="audio" for s in streams)

def run_ffmpeg(args,limit):
    result=subprocess.run(
        ["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y",*args],
        stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True,timeout=limit
    )
    if result.returncode:
        raise RuntimeError("FFmpeg exited "+str(result.returncode)+": "+result.stderr[-350:])

def audio_video_args(target):
    return [
        "-c:v","libx264","-preset","veryfast","-crf","23",
        "-threads","2","-pix_fmt","yuv420p","-r","30",
        "-c:a","aac","-b:a","128k","-ar","48000","-ac","2",
        "-movflags","+faststart", "-max_muxing_queue_size","1024",str(target),
    ]

def make_title(path, text, duration, directory):
    title_file = directory/("title-"+str(path.stem)+".txt")
    title_file.write_text(text or "EduShare Academy",encoding="utf-8")
    # Input 0 is a solid-color card, input 1 generates silent audio.
    display=(f"drawtext=fontfile={FONT}:textfile={title_file}:"
             "fontcolor=white:fontsize=70:"
             "x=(w-text_w)/2:y=(h-text_h)/2")
    run_ffmpeg([
        "-f","lavfi","-i",f"color=c=0x0d2527:s=1920x1080:r=30:d={duration:.3f}",
        "-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=48000",
        "-map","0:v:0","-map","1:a:0",
        "-vf",display,
        "-t",f"{duration:.3f}",*audio_video_args(path)
    ],240)

def make_clip(source,clip,has_audio,watermark,caption,output,directory):
    start=clip["sourceInMs"]/1000.0
    end=clip["sourceOutMs"]/1000.0
    rate=float(clip["rate"])
    duration=end-start
    output_duration=duration/rate
    if duration <= 0 or not 0.5 <= rate <= 2.0 or output_duration <= 0:
        raise ValueError("Timeline trim is invalid")
    if end > MAX_DURATION:
        raise ValueError("Clip trim exceeds maximum lesson length")
    video_filter=(
        "fps=30,"
        "scale=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x10151a,"
        "setsar=1,setpts=(PTS-STARTPTS)/"+str(rate)
    )
    if watermark:
        badge_file=directory/"watermark.txt"
        badge_file.write_text(watermark,encoding="utf-8")
        video_filter+=(
            f",drawtext=fontfile={FONT}:textfile={badge_file}:"
            "fontcolor=white:fontsize=35:box=1:boxcolor=black@0.5:"
            "boxborderw=14:x=w-tw-55:y=50"
        )
    if caption:
        caption_file=directory/"caption.txt"
        caption_file.write_text(caption,encoding="utf-8")
        video_filter+=(
            f",drawtext=fontfile={FONT}:textfile={caption_file}:"
            "fontcolor=white:fontsize=38:box=1:boxcolor=black@0.65:"
            "boxborderw=16:x=55:y=h-th-80"
        )
    args=["-ss",f"{start:.3f}","-i",str(source)]
    if has_audio:
        args.extend(["-map","0:v:0","-map","0:a:0"])
        args.extend([
            "-vf",video_filter,
            "-af",f"atrim=duration={duration:.3f},asetpts=PTS-STARTPTS,{speech_mastering_filter(rate)}",
        ])
    else:
        args.extend([
            "-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=48000",
            "-map","0:v:0","-map","1:a:0",
            "-vf",video_filter,
        ])
    args.extend(["-t",f"{output_duration:.3f}",*audio_video_args(output)])
    run_ffmpeg(args, max(480,int(output_duration*9)))
    if not output.exists() or output.stat().st_size < 2500:
        raise RuntimeError("FFmpeg returned an empty clip")

def heartbeat(receipt,stop):
    while not stop.wait(240):
        try:
            sqs.change_message_visibility(
                QueueUrl=QUEUE_URL,ReceiptHandle=receipt,VisibilityTimeout=900)
        except Exception:
            log.exception("Failed to extend queue message visibility")

def transcode(job_id):
    job=manifest(job_id)
    if job.get("status") == "completed":
        return
    if job.get("status") == "cancelled":
        raise Cancelled("Job already cancelled")
    if job.get("version") != 2 or job.get("jobId") != job_id:
        raise ValueError("Unrecognised job manifest")
    segments=job["segments"]
    clips=job["clips"]
    if not 1 <= len(segments) <= 40 or not 1 <= len(clips) <= 150:
        raise ValueError("Manifest exceeds job limits")
    if not job.get("outputKey")==f"renders/{job_id}.mp4":
        raise ValueError("Invalid output S3 key")
    sources={}
    size_sum=0
    update(job_id,"rendering")
    with tempfile.TemporaryDirectory(prefix="edushare-render-") as temp:
        directory=Path(temp)
        for s in segments:
            sid=s["segmentId"]
            key=s["key"]
            if not isinstance(sid,str) or not SEG_ID.fullmatch(sid):
                raise ValueError("Invalid source segment ID")
            if key not in (f"uploads/{job_id}/{sid}.webm",f"uploads/{job_id}/{sid}.mp4"):
                raise ValueError("Source not scoped to this job")
            meta=s3.head_object(Bucket=BUCKET,Key=key)
            size=meta["ContentLength"]
            if not 0 < size <= MAX_BYTES or size != s["sizeBytes"]:
                raise ValueError("Uploaded source is too large or changed")
            size_sum+=size
            if size_sum > 2*1024*1024*1024:
                raise ValueError("Total uploads exceed maximum")
            path=directory/("source-"+sid+Path(key).suffix)
            s3.download_file(BUCKET,key,str(path))
            duration,audio=inspect_media(path)
            sources[sid]=(path,duration,audio)
        branded=job.get("branding",{})
        enabled=branded.get("enabled") is True
        watermark="NotesUG Academy" if enabled else ""
        caption=branded.get("caption","") if enabled else ""
        ordered=[]
        if enabled:
            intro=directory/"intro.mp4"
            lesson_title=branded.get("lessonTitle","EduShare Academy")
            make_title(intro,lesson_title,2.2,directory)
            ordered.append(intro)
        clip_duration=0.0
        for index,clip in enumerate(clips):
            sid=clip["segmentId"]
            if sid not in sources:
                raise ValueError("A timeline clip references missing source")
            source,duration,has_audio=sources[sid]
            if clip["sourceOutMs"] / 1000 > duration + 0.15:
                raise ValueError("A clip trim extends beyond saved video")
            part=directory/f"clip-{index:03}.mp4"
            make_clip(source,clip,has_audio,watermark,caption,part,directory)
            ordered.append(part)
            clip_duration+=(clip["sourceOutMs"]-clip["sourceInMs"])/clip["rate"]/1000
            # Cancellation checkpoint before further CPU-intensive work.
            if manifest(job_id).get("status")=="cancelled":
                raise Cancelled("Job cancelled while rendering")
        if enabled:
            outro=directory/"outro.mp4"
            make_title(outro,"Thank you for learning with NotesUG Academy",2.0,directory)
            ordered.append(outro)
        playlist=directory/"parts.txt"
        playlist.write_text("".join("file '"+str(p)+"'\n" for p in ordered),encoding="utf-8")
        final=directory/"final.mp4"
        run_ffmpeg([
            "-f","concat","-safe","0","-i",str(playlist),
            "-c","copy","-movflags","+faststart",str(final)
        ], max(180,int(clip_duration*2)))
        duration,has_audio=inspect_media(final)
        planned=clip_duration+(4.2 if enabled else 0)
        if not has_audio:
            raise RuntimeError("Rendered output has no audio track")
        if abs(duration-planned)>max(0.6,0.03*planned):
            raise RuntimeError(f"Duration mismatch: output={duration:.2f}s expected={planned:.2f}s")
        if manifest(job_id).get("status")=="cancelled":
            raise Cancelled("Job cancelled before publication")
        s3.upload_file(
            str(final),BUCKET,job["outputKey"],
            ExtraArgs={"ContentType":"video/mp4","ServerSideEncryption":"AES256"},
        )
        update(
            job_id,"completed",outputBytes=final.stat().st_size,
            outputDurationMs=round(duration*1000),finishedAt=int(time.time()),
            audioIncluded=has_audio,audioMastering=MASTERING_VERSION,
        )
        log.info("MP4 success: job=%s duration=%.2fs size=%d",job_id,duration,final.stat().st_size)

def process(message):
    receipt=message["ReceiptHandle"]
    body=json.loads(message["Body"])
    if body.get("version") != 2:
        # Legacy v1 transcoding jobs remain unsupported by this new v2 worker.
        raise ValueError("Unsupported queue job version")
    job_id=body.get("jobId")
    if not isinstance(job_id,str) or not UUID.fullmatch(job_id):
        raise ValueError("SQS message contains invalid job ID")
    stop=threading.Event()
    thread=threading.Thread(target=heartbeat,args=(receipt,stop),daemon=True)
    thread.start()
    try:
        transcode(job_id)
        sqs.delete_message(QueueUrl=QUEUE_URL,ReceiptHandle=receipt)
    except Cancelled:
        log.info("Cancelled job %s",job_id)
        sqs.delete_message(QueueUrl=QUEUE_URL,ReceiptHandle=receipt)
    except Exception as e:
        log.exception("Job %s failed",job_id)
        attempt=int(message.get("Attributes",{}).get("ApproximateReceiveCount","1"))
        try:
            update(job_id,"failed" if attempt >= 3 else "retrying",
                   error=("Rendering failed after three attempts" if attempt >= 3
                          else "Rendering will retry automatically"))
        except Cancelled:
            pass
        # SQS visibility expiry handles retries and eventual DLQ.
    finally:
        stop.set()
        thread.join(timeout=2)

def main():
    log.info("EduShare AWS media renderer started region=%s",REGION)
    while True:
        try:
            messages=sqs.receive_message(
                QueueUrl=QUEUE_URL,MaxNumberOfMessages=1,WaitTimeSeconds=20,
                VisibilityTimeout=900,AttributeNames=["ApproximateReceiveCount"])
            for message in messages.get("Messages",[]):
                process(message)
        except Exception:
            log.exception("Unable to poll SQS")
            time.sleep(5)

if __name__=="__main__":
    main()
