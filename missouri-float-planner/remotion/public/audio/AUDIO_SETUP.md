# Audio Setup Guide

## Background Music

Place a royalty-free acoustic/folk track as `background-music.mp3` in this directory.

**Recommended sources:**
- Pixabay Music (free, no attribution required)
- Artlist.io (licensed)
- Epidemic Sound (licensed)

**Style:** Warm acoustic guitar or folk — matches the Missouri outdoor river vibe. Keep it mellow and upbeat, not distracting.

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
