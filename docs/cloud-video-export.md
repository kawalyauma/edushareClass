# EduShareClass — private AWS video export

Status: **live integration verified on 7 November 2026**. The web application is at
https://notesug.com/edushareclass/ and its cloud-export option is an explicit
teacher action. This feature does not upload lesson media automatically.

## Purpose

EduShareClass stores the teacher's original recorded lesson clips in IndexedDB.
The previous browser-only 1080p compositor can freeze on slow phones and
computers. Cloud export uploads the **saved source WebM/MP4 clips directly to
private S3**, then renders them into H.264/AAC MP4 on a separate EC2 FFmpeg worker.

The existing browser-only export is preserved as an opt-out/fallback.

## Resource map

- Account: `417081976539` (**new EduShare AWS account, not the existing Frankfurt account**)
- Region: `eu-north-1` (Stockholm)
- Worker EC2: `i-03d6552ce61bbc853`, `m7i-flex.large`, 2 vCPUs / 8 GB RAM
- Worker role: `EduShareVideoRendererRole`; management through AWS Systems Manager
- Private storage: `s3://edushare-render-417081976539-eu-north-1`
- Queue: `edushare-video-render-jobs`; dead-letter queue: `edushare-video-render-failures`
- Lambda control plane: `edushare-cloud-video-export`
- Restricted Function URL requires a random 288-bit bearer secret, checked by
  comparing SHA-256 digests; the full secret is not included in app JS, Git, or S3.
- CloudWatch: `edushare-video-renderer-idle-autostop` stops worker after approximately
  one hour of sustained CPU use below 3%. The Lambda service starts stopped
  workers when a new job is queued.

## Owner workflow

1. Finish recording, confirm source clips are saved in the **same browser profile**
   where the lesson was recorded, and navigate to the lesson's Controls panel.
2. Under **Cloud MP4 export**, paste the private access code and click
   **Export MP4 on AWS**. This is explicit consent to upload the selected clips.
3. Wait for the AWS processing status to become complete; click **Download MP4**.
   A provenance manifest is also available.
4. If the browser closes after the job is queued, reopen the same lesson, re-enter
   the access code and select **Check last AWS export / renew download link**.
   The non-secret job ID is remembered in localStorage for this purpose.
5. Do **not refresh while a microphone recording is actively in progress**.
   The previous web assets are retained on the server so open tabs can finish.

Read the private access code only on the server:

```bash
sudo -u codexagent cat /home/codexagent/workspace/edushareclass-deploy/tools/video-renderer/cloud-export-access.secret
```

Use a secure channel when providing it to the owner. Never commit the access code.

## Processing and privacy

- Browser creates job metadata; Lambda signs temporary S3 PUT URLs for
  `uploads/<job-id>/<segment-id>.webm` and `.mp4`.
- The browser performs the actual upload (without passing private video through
  the old web server). Requests are allowed from `https://notesug.com` only
  at the CORS layer.
- Lambda checks every object's MIME type and size, enqueues the job and wakes
  the EC2 worker if stopped.
- The worker downloads saved originals, applies clip trim/reorder/rate via FFmpeg,
  optionally adds NotesUG title cards and watermark, and writes an MP4 to
  `renders/<job-id>.mp4`.
- Job status remains private in `jobs/<job-id>.json` and is fetched with the
  private bearer secret. MP4 download links are signed for 15 minutes.
- The final MP4 has H.264 video, AAC audio, 30 fps and resolution up to 1080p.
  No synthetic narration or music is added.
- S3 objects are encrypted, block public access and deny insecure transport.
  Source clips expire after seven days, rendered videos and job metadata
  after thirty days. Original local recordings are not deleted.
- EC2 has **no inbound security-group ports**. Management uses SSM.

## Current limits and important caveats

- This is a **single-owner private access code**, not production-grade
  role-based multi-tenant authentication. Before exposing to school users,
  integrate it with the existing NotesUG identity/session system and enforce
  per-user and per-school quotas.
- Up to **40 distinct source clips** and **150 timeline edits** per export;
  source recording size up to 750 MiB each, 2 GiB total and edited duration
  up to two hours. Large or long exports can be slow on 2 vCPUs.
- Signed upload links expire after 15 minutes. A failed/expired upload can be
  retried by starting a new export; resuming incomplete uploads is not yet
  implemented.
- No progress percentage from individual FFmpeg clips yet; the UI reports
  upload progress and queued/rendering/completed status.
- A browser recording can be edited only if its IndexedDB source remains in
  the same device/browser profile. The server cannot access recordings stored
  on a separate user's device without user-initiated upload.
- A completed MP4 is not proof that the **owner's newest recording** has been
  uploaded. Owner must perform a new lesson export to verify that particular file.
- Amazon EC2, Lambda, SQS, S3 and CloudWatch can consume AWS Free-plan
  credits; eligibility does not imply unlimited free operation.

## Release QA evidence (2026-11-07)

- Backend true end-to-end: **S3 upload → SQS → EC2 worker → MP4 → signed download**.
- Actual source: the latest available prior **browser QA** WebM file
  (`logs/notesug-branded-export.webm`), not a file from the owner's separate PC.
- Standard MP4: 12.021 s, 1920×1080, H.264/AAC.
- Branded MP4: 16.221 s, 1920×1080, H.264/AAC.
- Lambda API and S3 browser CORS preflight tests: pass for `https://notesug.com`.
- Unauthorised requests: rejected with HTTP 401.
- Browser TypeScript build and selected lint: pass.
- Web automated tests: 117 passing prior to adding recovery checks.
- The live page and hashed JS asset returned HTTP 200 and contained the AWS UI.
- User-facing acceptance still needs confirmation on the **new** browser recording
  once that recording has been saved locally.

## Recovery and operational commands

```bash
# See the worker
aws ec2 describe-instances --profile edushare-renderer --region eu-north-1 \
  --instance-ids i-03d6552ce61bbc853

# See queue depth
aws sqs get-queue-attributes --profile edushare-renderer --region eu-north-1 \
  --queue-url https://sqs.eu-north-1.amazonaws.com/417081976539/edushare-video-render-jobs \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```

Production static web assets are served from
`/opt/notesug/archive/edushareclass/`. The pre-cloud backup is at
`/home/codexagent/workspace/edushareclass-deploy/backups/web-before-aws-cloud-20261107/`.
The previous hashed JavaScript file was intentionally retained so open
recording tabs would not break during deployment.
