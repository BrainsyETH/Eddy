# Float history card: design exports

The design canvas behind `docs/float-history-card-plan.md`, saved here so the
UI is reviewed against something in the repository rather than a private link.

| File | What it is |
| --- | --- |
| `float-history-card-mockup.html` | The canvas as exported: four boards, self-unpacking (open it in a browser). The otter stickers point at assets that were not packed into the export, so the history list and mood board render without them. |
| `board-history-list.png` | History list, rendered from the canvas. |
| `board-recap.png` | Float recap. |
| `board-share-image.png` | The 9:16 share image (phase 5). |
| `board-otter-moods.png` | The mood board: one sticker per mood, with stand-ins for art not yet drawn. |

## Where the plan overrides the canvas

The canvas predates both reviews of the plan. Its visual language (cards,
Fredoka mood names, Geist Mono stats, the river strip, the time-split bar) and
its mood names are what the app follows. Where they disagree, the merged plan
wins:

| Canvas | Built |
| --- | --- |
| Tilted double-ring stamp on every history card | A straight flat badge on cards and the recap; the stamp is for the share image |
| Large coral mood headline, otter as a hero tile | River first; a small otter and a secondary mood line on cards |
| "Under a minute on the water", "Barely got wet" | The recorded duration; no strip without credited river |
| "River completed", "5% of the Current", Headwaters to Mouth | "River explored", miles first, share of the river's float miles, the strip labelled with its first and last access points |
| "Clear and gentle when you put in", `USGS` id inline | The badge, then the gauge and the reading's age; the station id in the info tip |
| Share in the recap header and a Share float button | One Share float button on the recap, and a share button on each card |
| Quick dip `distance < 0.25 mi OR elapsed < 10 min`; rain "during the float" | Quick dip is time only; untracked floats get no mood; rain is measured at the put-in |

## Mood art

From the mood board. Five moods use an existing sticker until their own art
is drawn (prompts in `design/eddy-emoji/float-mood-otters.md`); the canvas
draws stand-ins faded, the app draws them as they are.

| Mood | Sticker |
| --- | --- |
| Made it! | `eddy-celebrate` |
| Good float | `eddy-thumbs-up` |
| Quick dip | `eddy-laugh` |
| Lazy river | `eddy-campfire-chill` |
| Big water | `eddy-high-water-alert` (stand-in) |
| Rain on the river | `eddy-safety-first` (stand-in) |
| Chilly one | `eddy-campfire-chill` (stand-in) |
| Scrape & drag | `eddy-thinking` (stand-in) |
| Speed run | `eddy-paddle-ready` (stand-in) |

## Still to export

The states the plan requires and the canvas does not draw: an untracked float,
a partly tracked one, no condition, a reading too old to rate, dark mode, and
the largest Dynamic Type size. `src/lib/float-history-display.test.ts` (web
suite) pins the copy for each; their screenshots come from a device, recorded
against the runbook's float-history gate.
