"""Transcrição com faster-whisper (candidato P0/P1, §15).

Uso (chamado por FasterWhisperProvider em packages/integrations):
    python -I workers/media/transcribe.py --model small --input arquivo.mp4 [--language pt]

Saída: JSON em stdout {language, segments:[{text,startSec,endSec,words:[...]}]}.
Tempos são do ORIGINAL. Instale com: pip install -r workers/media/requirements.txt
"""
import argparse
import json
import os
import subprocess
import sys


def decode_audio(path: str):
    """Decodifica com FFmpeg (16 kHz mono float32), sem depender do PyAV:
    versões novas do PyAV quebram o decodificador embutido do faster-whisper."""
    import numpy as np

    ffmpeg = os.environ.get("FFMPEG_PATH") or "ffmpeg"
    raw = subprocess.run(
        [ffmpeg, "-nostdin", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="small")
    parser.add_argument("--input", required=True)
    parser.add_argument("--language", default=None)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--compute-type", default="default")
    # Música: o VAD (treinado em fala) corta trechos cantados com instrumental.
    parser.add_argument("--no-vad", action="store_true")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper não instalado: pip install -r workers/media/requirements.txt", file=sys.stderr)
        return 2

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(decode_audio(args.input), language=args.language, word_timestamps=True, vad_filter=not args.no_vad)
    out = {"language": info.language, "segments": []}
    for seg in segments:
        out["segments"].append(
            {
                "text": seg.text.strip(),
                "startSec": round(seg.start, 3),
                "endSec": round(seg.end, 3),
                "words": [
                    {
                        "text": w.word.strip(),
                        "startSec": round(w.start, 3),
                        "endSec": round(w.end, 3),
                        "confidence": round(w.probability, 3),
                    }
                    for w in (seg.words or [])
                ],
            }
        )
    json.dump(out, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
