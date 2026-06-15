# Eddy Mascot Assets

Download these images from the Vercel Blob storage and place them in this directory:

| Filename | URL |
|----------|-----|
| `eddy-standard.png` | https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png |
| `eddy-canoe.png` | https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png |
| `eddy-flag.png` | https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png |
| `eddy-green.png` | https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png |
| `eddy-favicon.png` | https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png |

### Condition-mood otters (full host-face parity with the app)

These three complete the canonical condition→otter moods in
`shared/condition-system.ts` (`low` → yellow, `high` → red, `dangerous` → flood)
and are wired up in `remotion/src/components/EddyMascot.tsx`. URLs kept here for
reproducibility if assets ever need to be re-fetched.

| Filename | URL |
|----------|-----|
| `eddy-yellow.png` | https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png |
| `eddy-red.png` | https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png |
| `eddy-flood.png` | https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png |

## Quick download script

```bash
cd remotion/public/eddy
curl -sL -o eddy-standard.png 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png'
curl -sL -o eddy-canoe.png 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png'
curl -sL -o eddy-flag.png 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png'
curl -sL -o eddy-green.png 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png'
curl -sL -o eddy-favicon.png 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png'
# Condition-mood otters:
curl -sL -o eddy-yellow.png 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png'
curl -sL -o eddy-red.png 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png'
curl -sL -o eddy-flood.png 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png'
```
