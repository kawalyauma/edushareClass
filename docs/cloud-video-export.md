# EduShareClass AWS video export and loud voice enhancement

## Deployment status

**7 November 2026:** The audio mastering engine is installed and active on AWS EC2.
The owner-requested **four-digit shared uploader PIN** is implemented with
rate limits in the repository, but the change is **not yet activated on the
public Function URL**. The old code continues to protect the existing live
page until the owner runs the activation script and enters the intended PIN
directly in an interactive server terminal.

Do **not** publish the PIN-only frontend separately before the backend PIN
and quota deployment succeeds. Otherwise user uploads will fail.

## Infrastructure

- AWS account: `417081976539`, separate from the original Frankfurt account.
- Region: `eu-north-1` (Stockholm).
- EC2: `i-03d6552ce61bbc853`, `m7i-flex.large`, 2 vCPU / 8 GiB RAM.
- Private S3: `edushare-render-417081976539-eu-north-1`.
- SQS `edushare-video-render-jobs` and dead-letter queue.
- Lambda `edushare-cloud-video-export` handles job metadata, signed uploads,
  queueing, worker auto-start and signed downloads.
- DynamoDB `EduShareCloudRenderQuota` is created and active for transaction-safe
  budget limits. It is not used until the PIN backend is activated.
- Worker role has limited S3/SQS permissions; no inbound ports, controlled via SSM.
- CloudWatch idle alarm stops the EC2 after approximately one hour of low CPU.
  Lambda wakes it for the next queued export.

## Owner activation: shared PIN and old-code revocation

Run this single script in an **interactive Ubuntu terminal**. It prompts for the
four digits with terminal echo disabled; do not paste the PIN into Git or the
JavaScript bundle:

```bash
bash /home/codexagent/workspace/edushareclass-deploy/remote-export-wt/infrastructure/aws-render/activate-uploader-pin.sh
```

The script verifies quota/audio unit tests, deploys DynamoDB-backed PIN
validation, waits until the new PIN works and the old long access code is
rejected, deletes the old credential file, checks browser CORS, runs an
actual S3→SQS→EC2→MP4 smoke export, builds frontend and atomically switches
`/opt/notesug/archive/edushareclass/index.html` to the new UI. Old hashed
assets are preserved so existing recording tabs can finish.

The shared four-digit PIN is only a convenient upload gate, **not secure
per-teacher authentication**. Anyone who knows/guesses it can use the shared
daily capacity, and PIN access alone does not verify ownership of a
teacher's recording. Private S3 objects remain inaccessible by default;
download links are scoped to unguessable job IDs and expire after 15 minutes.
For an unrestricted public school, add real account authentication,
per-teacher ownership and a WAF/rate-limiting edge before removing quotas.

### Maximum daily allowance

The Lambda accepts a maximum **24 new jobs per UTC day**, including **8 jobs
per source IP**, **4 GiB total source data** and **120 minutes total edited
duration**. Individual jobs may contain up to **750 MiB** and **30 minutes** of
edited output (with the existing 40 source files/150 timeline edits limits).
DynamoDB transactions reserve both per-IP and global allowance *atomically*
before S3 upload URLs are issued. Rejected requests receive HTTP 429.
Unused reservations are intentionally not refunded, preventing abuse via
repeated incomplete uploads. Quota values can be changed in `quota.py`
subject to account budget review.

S3 uploads expire after seven days; outputs and job manifests after thirty.
EC2, S3, SQS, Lambda, DynamoDB and CloudWatch can consume AWS credits and incur
charges. Free-plan instance eligibility does not mean unlimited free renders.

## Adaptive voice enhancement engine

`infrastructure/aws-render/audio_mastering.py` runs on EC2 for **every
recorded audio clip**, after temporal trimming/playback-rate correction.

Fixed, audited FFmpeg chain (no user shell arguments):

1. High-pass at 85 Hz and low-pass at 14.5 kHz to reduce mic rumble and hiss.
2. FFT spectral denoiser (`afftdn`) to reduce broadband background noise.
3. Two EQ boosts around 185 Hz (warmth) and 3.2 kHz (vocal intelligibility).
4. Dynamic normalisation (`dynaudnorm`) to recover quiet teacher speech.
5. Controlled gain, soft clipping and a true-peak-oriented limiter to
   increase perceived loudness without digital sample clipping.
6. Audio resampled to 48 kHz and encoded as AAC; video stays H.264/1080p.

The audio is processed automatically; no additional teacher audio file or
paid speech model is needed. The target is **strong, consistent spoken audio**
near -14 LUFS on typical recording material, but results depend on the source.
It cannot reconstruct missing words or guarantee total noise removal.

### Verified media QA (actual EC2 export)

- Test source: prior NotesUG/EduShareClass browser QA WebM from the deployment
  host; **not the owner's newest browser recording**.
- New speech-v2 AWS MP4: 1920×1080, H.264 video, AAC audio, 12.021 seconds.
- Measured input integrated loudness: **-17.2 LUFS**, input true peak **+0.5 dBFS**.
- Measured exported MP4 integrated loudness: **-14.6 LUFS**, true peak
  **-1.5 dBFS**. Improvement: **2.6 LU** louder perceived loudness with peak
  safely reduced.
- Data flow S3 upload → SQS → EC2 FFmpeg → S3 MP4 → signed download: PASS.
- The old long access code remained valid *during this test*; activation
  must re-run the smoke test with the new user-provided PIN.

## Using the uploader after PIN activation

1. Finish saving the recording in the same browser profile used to record it.
2. Open https://notesug.com/edushareclass/ and the lesson's Controls panel.
3. Enter the four-digit uploader PIN, select NotesUG branding if desired, and
   click **Export MP4 on AWS**.
4. Download the finished MP4. If the tab closes after queueing, reopen the same
   lesson, re-enter the PIN and click **Check last AWS export**.

There is no AI voice replacement or synthetic teacher narration. The browser
does not re-encode the full edited lesson. The original recording stays local
unless a teacher explicitly starts an AWS export.

## Recovery

The pre-PIN web files are backed up before activation; the previous
pre-cloud backup lives at
`/home/codexagent/workspace/edushareclass-deploy/backups/web-before-aws-cloud-20261107`.
The new backend code is in `infrastructure/aws-render/{handler.py,quota.py}`,
and the worker/mastering code in `{worker.py,audio_mastering.py}`. Do not
re-enable the old leaked long credential after revocation.
