#!/usr/bin/env python3
"""Local/private H.264/AAC 1080p MP4 export from EduShareClass source segment files.

No network, no shell, no cloud upload. Run in an operator-approved local checkout.
Expected input: manifest from the browser export UI and source files named
<segment_id>.webm or <segment_id>.mp4 inside --media-dir.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

SAFE_ID = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")
MAX_CLIPS = 200
MAX_TOTAL_SECONDS = 6 * 3600


class ExportError(ValueError):
    pass


def check_manifest(obj: dict[str, Any]) -> list[dict[str, Any]]:
    if obj.get('format') != 'edushareclass-export-v1':
        raise ExportError('Unsupported or missing EduShareClass export manifest version.')
    clips = obj.get('clips')
    if not isinstance(clips, list) or not 1 <= len(clips) <= MAX_CLIPS:
        raise ExportError('Export must contain 1–200 timeline clips.')
    total = 0.0
    for idx, clip in enumerate(clips):
        if not isinstance(clip, dict) or not SAFE_ID.fullmatch(str(clip.get('segmentId', ''))):
            raise ExportError(f'Clip {idx} has an unsafe or missing segment ID.')
        a, b, rate = (clip.get(k) for k in ('sourceInMs', 'sourceOutMs', 'rate'))
        if any(type(n) not in (int, float) or not math.isfinite(n) for n in (a, b, rate)):
            raise ExportError(f'Clip {idx} has invalid time/rate values.')
        if a < 0 or b <= a or not 0.5 <= rate <= 2:
            raise ExportError(f'Clip {idx} has invalid trim or rate.')
        total += (b-a)/1000/rate
    if total > MAX_TOTAL_SECONDS:
        raise ExportError('Maximum export duration is six hours.')
    return clips


def file_for(media_dir: Path, segment_id: str) -> Path:
    for ext in ('.webm', '.mp4'):
        path = (media_dir / f'{segment_id}{ext}').resolve(strict=False)
        if path.parent != media_dir.resolve():
            raise ExportError('Recording path escaped the approved media directory.')
        if path.is_file() and not path.is_symlink():
            if path.stat().st_size > 4 * 1024**3:
                raise ExportError('Individual source recording exceeds 4 GiB.')
            return path
    raise ExportError(f'Original source media missing for {segment_id!r}.')


def execute(args: list[str], *, timeout: int = 600) -> str:
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
    if r.returncode:
        raise ExportError(f"FFmpeg/FFprobe failed ({r.returncode}): {r.stderr[-1500:]}")
    return r.stdout


def probe(path: Path) -> dict[str, Any]:
    return json.loads(execute(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], timeout=45))


def create_mp4(manifest_path: Path, media_dir: Path, output: Path) -> dict[str, Any]:
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise ExportError('Install the native ffmpeg and ffprobe executables first.')
    obj = json.loads(manifest_path.read_text(encoding='utf-8'))
    clips = check_manifest(obj)
    media_dir = media_dir.resolve(strict=True)
    output = output.resolve(strict=False)
    if output.suffix.lower() != '.mp4':
        raise ExportError('Output filename must end in .mp4')
    if output.exists():
        raise ExportError('Refusing to overwrite existing output. Choose a new filename.')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Preflight every requested source before writing any output.
    sources = []
    for clip in clips:
        file = file_for(media_dir, clip['segmentId'])
        info = probe(file)
        streams = info.get('streams', [])
        if not any(s.get('codec_type')=='video' for s in streams) or not any(s.get('codec_type')=='audio' for s in streams):
            raise ExportError(f'Clip {clip["segmentId"]!r} must have both board video and teacher audio.')
        seconds = float(info.get('format', {}).get('duration', 0))
        if clip['sourceOutMs']/1000 > seconds + 0.12:
            raise ExportError(f'Trim exceeds actual source video length: {clip["segmentId"]!r}.')
        sources.append(file)
    with tempfile.TemporaryDirectory(prefix='edushare-mp4-') as tmp:
        directory=Path(tmp)
        # Concatenate *before* encoding, so there is only one AAC encoder delay
        # and no independently primed per-clip streams (previously added ~220ms/2 clips).
        graph=[]
        for i,clip in enumerate(clips):
            start_ms=clip['sourceInMs']/1000
            end_ms=clip['sourceOutMs']/1000
            rate=float(clip['rate'])
            graph.append(f'[{i}:v:0]trim=start={start_ms:.3f}:end={end_ms:.3f},setpts=(PTS-STARTPTS)/{rate:.7f},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p[v{i}]')
            graph.append(f'[{i}:a:0]atrim=start={start_ms:.3f}:end={end_ms:.3f},asetpts=PTS-STARTPTS,atempo={rate:.7f},aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo[a{i}]')
        labelled=''.join(f'[v{i}][a{i}]' for i in range(len(clips)))
        graph.append(f'{labelled}concat=n={len(clips)}:v=1:a=1[v][a]')
        graph_file=directory/'filters.txt'
        graph_file.write_text(';'.join(graph),encoding='utf-8')
        staged=directory/'final.mp4'
        arguments=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y']
        for source in sources:arguments.extend(['-i',str(source)])
        arguments.extend(['-filter_complex_script',str(graph_file),'-map','[v]','-map','[a]',
            '-c:v','libx264','-preset','veryfast','-crf','21','-profile:v','high',
            '-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','160k','-ar','48000',
            '-ac','2','-movflags','+faststart',str(staged)])
        execute(arguments,timeout=1800)
        verification=probe(staged)
        video=next((s for s in verification.get('streams',[]) if s.get('codec_type')=='video'),None)
        audio=next((s for s in verification.get('streams',[]) if s.get('codec_type')=='audio'),None)
        if not video or not audio or video.get('codec_name')!='h264' or audio.get('codec_name')!='aac':
            raise ExportError('Export validation failed: expected H.264 video and AAC audio.')
        if (int(video.get('width',0)),int(video.get('height',0)))!=(1920,1080):
            raise ExportError('Export validation failed: output is not 1920×1080.')
        expected=sum((c['sourceOutMs']-c['sourceInMs'])/1000/c['rate'] for c in clips)
        actual=float(verification.get('format',{}).get('duration','0'))
        if abs(actual-expected)>max(.08,expected*.001):
            raise ExportError(f'Output timing failed verification: {actual:.3f}s vs expected {expected:.3f}s.')
        v_duration=float(video.get('duration',actual))
        a_duration=float(audio.get('duration',actual))
        if abs(v_duration-a_duration)>.10:
            raise ExportError(f'A/V drift exceeded 100 ms ({v_duration:.3f}s video, {a_duration:.3f}s audio).')
        # Only commit verified output; failed exports never clobber existing media.
        shutil.copy2(staged,output)
    return {'path':str(output),'codec':'h264+aac','resolution':'1920x1080','duration_s':actual,
            'segments':len(clips),'size_bytes':output.stat().st_size,'av_drift_s':abs(v_duration-a_duration)}


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--media-dir',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    options=parser.parse_args()
    print(json.dumps(create_mp4(options.manifest,options.media_dir,options.output),indent=2))

if __name__=='__main__':
    main()
