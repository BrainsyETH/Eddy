#!/usr/bin/env python3
# vtt-to-captions.py — Parse a WebVTT transcript into compact, timed caption
# cues for the Remotion clip-reel composition.
#
# Prints a JSON array of {"start","end","text"} to stdout, with times in seconds
# RELATIVE to the clip start, chunked into short on-screen phrases. This mirrors
# the windowing finalize-reel.sh did before burning captions with ffmpeg, so the
# Remotion branding path keeps caption parity (captions drive watch-time on
# muted autoplay feeds). On any problem it prints "[]" so callers can pass it
# straight through to render-clip without failing the run.
#
# Usage: vtt-to-captions.py <transcript.vtt> <clip-start-secs> <duration-secs>

import json
import re
import sys

GROUP = 5  # words per on-screen caption phrase


def parse_time(t):
    t = t.strip().replace(",", ".")
    parts = t.split(":")
    if len(parts) == 3:
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    if len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    return float(parts[0])


def main():
    if len(sys.argv) < 4:
        print("[]")
        return
    vtt_path = sys.argv[1]
    try:
        clip_start = float(sys.argv[2])
        clip_dur = float(sys.argv[3])
    except ValueError:
        print("[]")
        return
    clip_end = clip_start + clip_dur

    try:
        with open(vtt_path, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        print("[]")
        return

    # Collect cue lines that fall inside the clip window, offset to clip-relative.
    entries = []
    for block in re.split(r"\n\n+", content):
        lines = block.strip().split("\n")
        for i, line in enumerate(lines):
            m = re.match(r"(\d[\d:.]+)\s*-->\s*(\d[\d:.]+)", line)
            if not m:
                continue
            start = parse_time(m.group(1))
            end = parse_time(m.group(2))
            raw = " ".join(lines[i + 1:]).strip()
            # Skip karaoke/inline-timestamp duplicate cues that auto-subs emit.
            if "<c>" in raw or "<00:" in raw:
                continue
            raw = re.sub(r"<[^>]+>", "", raw).strip()
            if not raw or "[Music]" in raw or "[Applause]" in raw:
                continue
            if clip_start <= start < clip_end:
                entries.append((start - clip_start, end - clip_start, raw))

    if not entries:
        print("[]")
        return

    # Spread words evenly across each cue, then de-dup the overlap auto-subs add.
    words = []
    for start, end, text in entries:
        ws = text.split()
        if not ws:
            continue
        step = (end - start) / len(ws)
        for j, w in enumerate(ws):
            words.append((start + j * step, w))

    deduped = []
    for ts, w in words:
        if deduped and deduped[-1][1].lower() == w.lower() and ts - deduped[-1][0] < 1.0:
            continue
        deduped.append((ts, w))

    # Group into short phrases shown one at a time.
    cues = []
    i = 0
    while i < len(deduped):
        chunk = deduped[i:i + GROUP]
        start = chunk[0][0]
        end = deduped[i + GROUP][0] if i + GROUP < len(deduped) else clip_dur
        cues.append({
            "start": round(max(0.0, start), 2),
            "end": round(min(clip_dur, end), 2),
            "text": " ".join(w for _, w in chunk),
        })
        i += GROUP

    print(json.dumps(cues, ensure_ascii=False))


if __name__ == "__main__":
    main()
