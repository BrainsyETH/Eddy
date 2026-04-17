# Audio Setup Guide

## Background Music

`background-music.wav` is a 12-second synthesized acoustic-folk loop (D →
G → Bm → A, finger-picked feel, 44.1 kHz stereo 16-bit PCM). It's
generated deterministically from `generate-background-music.py` — regenerate
with:

```bash
cd missouri-float-planner/remotion/public/audio
python3 generate-background-music.py
```

### Replacing with a real track

To use real music, drop a new file at `background-music.wav` (or commit an
MP3 and update the `staticFile(...)` calls and workflow `AUDIO_SRC`). The
render pipeline enforces two gates so any dud audio fails loudly instead
of shipping a silent Reel:

1. **Encoded-audio-size floor** — after AAC re-encode at 192 kb/s, the
   audio stream must be ≥5 KiB per second of video. Silent tracks
   compress to a fraction of that.
2. **silencedetect** — fails if >80% of the final MP4 is below −40 dBFS.

Target specs for replacement tracks:
- ≥128 kb/s MP3 or 16-bit PCM WAV
- 44.1 kHz, stereo
- 12+ seconds (pipeline loops shorter sources via `-stream_loop -1`)
- RMS around −18 to −14 dBFS, peak ≤−3 dBFS

**Sources for royalty-free tracks:**
- Pixabay Music (free, no attribution required)
- Artlist.io (licensed)
- Epidemic Sound (licensed)

**Style:** Warm acoustic guitar or folk — matches the Missouri outdoor
river vibe. Keep it mellow and upbeat, not distracting.

## Voiceover Audio

Generate or record per-scene voiceover files and place them in `voiceover/`:

| File | Script |
|------|--------|
| `01-intro.mp3` | "Meet Eddy — your guide to the best float trips in Missouri." |
| `02-home.mp3` | "Eddy gives you a daily river report with real-time conditions across Missouri's top floating rivers. See what's running good at a glance." |
| `03-rivers.mp3` | "Browse eight of Missouri's best float rivers. Each one shows live conditions so you know exactly what to expect before you go." |
| `04-river-detail.mp3` | "Dive into any river to see an interactive map with every access point, gauge station, and hazard marked." |
| `05-float-planner.mp3` | "Pick your put-in and take-out, and Eddy calculates your float time, distance, and shuttle drive — all in seconds." |
| `06-gauges.mp3` | "Track real-time water levels from USGS gauge stations. Sparkline charts show you the seven-day trend at a glance." |
| `07-access-point.mp3` | "Every access point has detailed info — parking, facilities, road conditions, and nearby outfitters." |
| `08-share-plan.mp3` | "Share your float plan with friends. One link, all the details — put-in, take-out, estimated time, and a map." |
| `09-ask-eddy.mp3` | "Got questions? Ask Eddy. He knows the rivers, the conditions, and can help you plan the perfect trip." |
| `10-outro.mp3` | "Start planning your next float at eddy dot guide." |

### AI TTS Generation

**Option 1: ElevenLabs**
```bash
# Use the ElevenLabs API or web UI
# Recommended voice: "Adam" or "Daniel" (warm, friendly male)
# Settings: Stability 0.5, Similarity 0.75, Style 0.3
```

**Option 2: OpenAI TTS**
```bash
curl https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1-hd",
    "input": "Meet Eddy — your guide to the best float trips in Missouri.",
    "voice": "onyx"
  }' \
  --output voiceover/01-intro.mp3
```

Export all files as MP3, 44.1kHz, mono or stereo.
