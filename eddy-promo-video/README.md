# 🦦 Eddy Promo Video — Remotion Project

A 45-second promotional video for [eddy.guide](https://eddy.guide), built with [Remotion](https://remotion.dev/) (React-powered programmatic video).

## 🎬 Video Structure

| # | Scene | Duration | What's Shown |
|---|-------|----------|-------------|
| 1 | **Opening Hook** | 0–6s | Cinematic river gradient, floating particles, title text |
| 2 | **Meet Eddy** | 6–11s | Otter mascot reveal, logo, tagline, feature badges |
| 3 | **Plan Your Float** | 11–17s | Animated planner UI — river/put-in/take-out selectors fill in |
| 4 | **Live River Gauges** | 17–23s | Dashboard with animated gauge bars, live USGS indicator |
| 5 | **Access Points** | 23–29s | Stylized map with animated pin drops + river path drawing |
| 6 | **Blog & Guides** | 29–34s | Staggered blog post cards sliding in |
| 7 | **Stats** | 34–38s | Animated counters (30+ access points, 8 rivers, 15 gauges) |
| 8 | **CTA** | 38–45s | eddy.guide URL with glow, otter, CTA button |

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Capture screenshots from live site
npm run capture

# Launch Remotion Studio (live preview)
npm start

# Render final MP4
npm run build
```

## 📁 Project Structure

```
eddy-promo-video/
├── src/
│   ├── Root.tsx              # Remotion entry — registers compositions
│   ├── EddyPromo.tsx         # Main composition — sequences all scenes
│   ├── index.ts              # Remotion bootstrap
│   ├── lib/
│   │   ├── constants.ts      # Colors, fonts, timing, narration script
│   │   └── animations.ts     # Spring presets, fade/slide hooks, counters
│   ├── components/
│   │   ├── WaterRipple.tsx    # Animated SVG water effect
│   │   ├── FloatingParticles.tsx  # Ambient floating dots
│   │   ├── Captions.tsx       # Synchronized subtitle overlay
│   │   └── GaugeMeter.tsx     # Animated gauge bar component
│   └── scenes/
│       ├── OpeningScene.tsx
│       ├── IntroEddyScene.tsx
│       ├── PlanFloatScene.tsx
│       ├── RiverGaugesScene.tsx
│       ├── AccessPointsScene.tsx
│       ├── BlogGuidesScene.tsx
│       ├── StatsScene.tsx
│       └── CTAScene.tsx
├── public/
│   ├── screenshots/          # Captured from live site
│   └── audio/
│       ├── narration.mp3      # (you generate this)
│       └── background-music.mp3  # (you source this)
├── scripts/
│   ├── capture-screenshots.mjs  # Puppeteer screenshot capture
│   └── generate-audio.ts        # TTS generation helper
├── package.json
├── tsconfig.json
└── remotion.config.ts
```

## 🎙️ Narration Script

Full script (~120 words, ~45 seconds at natural pace):

> Missouri's Ozark rivers are some of the most beautiful waterways in America. But planning a float trip? That's been the hard part. Until now.
>
> Meet Eddy — your Ozark float trip companion. A free tool that makes planning your next river adventure effortless.
>
> Pick your river. Choose your put-in and take-out. Eddy calculates distance and estimated float time instantly.
>
> Check real-time water levels powered by USGS gauges. Know if conditions are too low, optimal, or too high before you go.
>
> Over thirty curated access points across Missouri's best float rivers. Every launch mapped. Every detail covered.
>
> Plus in-depth river guides and blog posts to help you choose your perfect float.
>
> Trusted by Missouri floaters for live data and local knowledge.
>
> Plan your next float trip today. eddy dot guide. Your river. Your adventure.

## 🔊 Adding Audio

### Narration (Voice-Over)

Generate TTS audio using one of these options:

```bash
# See all options
npx ts-node scripts/generate-audio.ts

# Generate with OpenAI (requires OPENAI_API_KEY)
npx ts-node scripts/generate-audio.ts openai
```

**Recommended voices:**
- **OpenAI**: `onyx` (warm, clear) or `nova` (friendly, energetic)
- **ElevenLabs**: `Adam` or custom clone
- **Google**: `en-US-Neural2-J`

Place the output at `public/audio/narration.mp3`.

### Background Music

Source a royalty-free ambient/acoustic track (~45s):
- [Pixabay Music](https://pixabay.com/music/) — free, no attribution
- [Uppbeat](https://uppbeat.io) — free tier
- Search: "ambient nature", "acoustic adventure", "calm river"

Place at `public/audio/background-music.mp3`.

### Enable Audio in the Composition

In `src/EddyPromo.tsx`, uncomment the `<Audio>` components:

```tsx
<Audio src={staticFile("audio/narration.mp3")} />
<Audio
  src={staticFile("audio/background-music.mp3")}
  volume={(f) =>
    interpolate(f, [totalFrames - 90, totalFrames], [0.15, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  }
/>
```

## 🎨 Customization

### Using Real Eddy Assets

The Eddy mascot images are already configured to load from your Vercel blob storage in `src/lib/constants.ts`:

```ts
export const EDDY_IMAGES = {
  main: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png",
  flood: "...",
  canoe: "...",
  // etc.
};
```

### Adjusting Timing

All scene timing is centralized in `src/lib/constants.ts` under `SCENES`. Each scene has a `start` (frame) and `duration` (frames). At 30fps:
- 30 frames = 1 second
- Adjust `VIDEO_CONFIG.totalFrames` if you change total duration

### Adjusting the Narration Sync

The `NARRATION_SCRIPT` array in constants has `startFrame` and `endFrame` for each line. After generating your audio, listen through and tweak these values so captions align with the spoken words.

### Colors & Fonts

All in `constants.ts`. The palette is built around:
- Deep blues (river/water)
- Warm gold (accent/highlights)
- Moss green (nature)
- Sunset orange (CTAs)

## 🖥️ Rendering

```bash
# Full quality MP4 (1920x1080, 30fps)
npm run build

# Output goes to: out/eddy-promo.mp4
```

For social media crops, add new Compositions in `Root.tsx`:

```tsx
// Instagram Reel / TikTok (9:16)
<Composition
  id="EddyPromoVertical"
  component={EddyPromoVertical}
  width={1080}
  height={1920}
  fps={30}
  durationInFrames={1350}
/>
```

## 🛠️ Tech Stack

- **Remotion 4** — React-based video framework
- **TypeScript** — type-safe components
- **Puppeteer** — live screenshot capture from eddy.guide
- **Spring animations** — natural motion via `remotion` spring
- **SVG** — water ripples, floating particles

## 📜 License

Video assets and code for eddy.guide promotional use.
