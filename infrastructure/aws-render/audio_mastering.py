"""Adaptive speech restoration/mastering for EduShareClass exports.

Noise reduction and dynamics improve captured voice. They cannot reconstruct
words never recorded by the microphone, and no filter makes *all* noise vanish.
"""
from __future__ import annotations

MASTERING_VERSION = "speech-v2"
TARGET_INTEGRATED_LUFS = -14
MAX_OUTPUT_TRUE_PEAK_DBFS = -1.5


def speech_mastering_filter(speed: float = 1.0) -> str:
    """Bounded FFmpeg audio filter chain, no user-controlled commands.

    Source trim/speed -> rumble/hiss removal -> speech warmth/presence EQ ->
    adaptive loudness recovery -> soft saturation -> peak-safe lookahead limiter.
    Unlike indiscriminate digital gain, AGC tracks sections of quiet speech.
    """
    if not 0.5 <= speed <= 2.0:
        raise ValueError("Audio playback speed outside supported range")
    return ",".join([
        f"atempo={speed:.4f}",
        "highpass=f=85",
        "lowpass=f=14500",
        "afftdn=nr=12:nf=-48:tn=1",
        "equalizer=f=185:t=q:w=1.0:g=1.5",
        "equalizer=f=3200:t=q:w=1.0:g=2.5",
        "dynaudnorm=f=150:g=25:p=0.95:m=18",
        "volume=12dB",
        "asoftclip=type=tanh:threshold=0.8",
        "alimiter=limit=0.84:level=false",
        "aresample=48000",
    ])
