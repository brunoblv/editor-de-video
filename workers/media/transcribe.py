"""Transcrição com faster-whisper (candidato P0/P1, §15).

Uso (chamado por FasterWhisperProvider em packages/integrations):
    python -I workers/media/transcribe.py --model small --input arquivo.mp4 [--language pt]

Saída: JSON em stdout {language, segments:[{text,startSec,endSec,words:[...]}]}.
Tempos são do ORIGINAL. Instale com: pip install -r workers/media/requirements.txt
"""
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="small")
    parser.add_argument("--input", required=True)
    parser.add_argument("--language", default=None)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--compute-type", default="default")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper não instalado: pip install -r workers/media/requirements.txt", file=sys.stderr)
        return 2

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(args.input, language=args.language, word_timestamps=True, vad_filter=True)
    out = {"language": info.language, "segments": []}
    for seg in segments:
        out["segments"].append(
            {
                "text": seg.text.strip(),
                "startSec": round(seg.start, 3),
                "endSec": round(seg.end, 3),
                "words": [
                    {"text": w.word.strip(), "startSec": round(w.start, 3), "endSec": round(w.end, 3)}
                    for w in (seg.words or [])
                ],
            }
        )
    json.dump(out, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
