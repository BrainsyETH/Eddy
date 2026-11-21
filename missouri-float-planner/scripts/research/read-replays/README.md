# Read replays: fixed mornings for comparing prompt and knowledge changes

This is a saved set of mornings from `eddy_generation_log`. Each one holds the
inputs, the prompt, the model's own words and what readers got. It was saved
on 2026-11-21, before any change to the Read prompts or to
`EDDY_KNOWLEDGE.md` that followed PR #1932. The point is to compare a later
change against the same water, rather than against whichever mornings happen
to follow it.

`scripts/report-eddy-reads.ts` scores only model-written Reads
(`outcome = 'model'`). On that report, a change can look better just because
more Reads fell back to the code-written report. The scorer here counts every
output, and it also reports a **strict** rate that counts each fallback as a
miss (see `score.ts`).

## What is here

| Path | What it is |
| --- | --- |
| `mornings/*.json` | One file per morning: why it was chosen, the full log row (`user_prompt`, `inputs` with `facts`, `system_prompt_hash`, `knowledge_blocks`, `raw_response`, `published`, `outcome`, `reason`, model, tokens, git sha), and the river's context from the `rivers` table at save time |
| `build-set.ts` | Wrote `mornings/` from production. It is read-only, and it holds the list of row ids and the reasons |
| `replay.ts` | Rebuilds each morning's prompt with today's code and knowledge file, asks production's model once per morning, and judges the answer the way production does |
| `score-set.ts` | Scores the stored outputs or a replay file, or compares two of them. Offline |
| `score.ts`, `set.ts` | The pure scoring and the file shapes. `score.test.ts` tests both, and the set itself |
| `results/baseline-stored.*` | The baseline from production's own outputs |

The set holds no secrets and no user data. These are river prompts. Before
writing, `build-set.ts` rejects any morning whose text looks like an email
address, a phone number or a user or device field.

## The mornings

The log holds Reads written under three river system prompts and three gauge
system prompts. Unless the table notes otherwise, a morning
uses the newest recorded prompt: river `6a122bc7…`
(2026-11-19 22:00 to 2026-11-20 13:00 UTC) and gauge `55f53262…`
(2026-11-20 17:10 UTC). The prompts at the base commit are newer than any row
in the log: river `7871a103…` and gauge `cf86d962…`. PR #1932 merged at 17:11
UTC on 2026-11-20, and no Read was logged under it before the set was saved.
So the stored outputs were written under older instructions than a replay
sends. The replay rows are the baseline for later changes. The stored rows
show what readers actually got.

| Key | Condition | Why |
| --- | --- | --- |
| r01-james-2026-11-20 | Low | James, named in PR #1932. The original full text says rain is likely Sunday and to check back |
| r02-gasconade-2026-11-20 | Low | Gasconade, named in PR #1932. A section note for the gauge |
| r03-meramec-2026-11-20 | Good | Meramec, named in PR #1932. Good at Steelville while below the optimal range |
| r04-big-river-2026-11-20 | Flowing | The highest condition recorded |
| r05-current-2026-11-20 | Good | The river whose Reads misplaced Big Spring on 2026-11-17 |
| r06-niangua-2026-11-20 | Good | Its gauge sits above Bennett Spring, which earlier Reads credited to it |
| r07-buffalo-2026-11-20 | Low | Arkansas, a park river |
| r08-black-2026-11-20 | Low | A section note and the elsewhere list |
| r09-courtois-2026-11-20 | Too Low | Written on a condition change (Low to Too Low). Read from the Huzzah gauge |
| r10-big-piney-2026-11-20 | Too Low | Sparse notes: the river and gauge blocks only |
| r11-eleven-point-2026-11-20 | Too Low | Sparse notes |
| r12-caddo-river-2026-11-20 | Too Low | Sparse notes. In the Ouachitas, Arkansas |
| r13-gasconade-2026-11-17 | Low | Earlier prompt `c262e81d…`. The original had only the General and river blocks |
| r14-elk-2026-11-20 | Unknown | Fallback `no_rating`: what readers got |
| r15-white-2026-11-20 | Unknown | Fallback `no_gauge`: what readers got |
| g01-james-07052250-2026-11-20 | Too Low | James near Boaz |
| g02-gasconade-06933500-2026-11-20 | Good | Gasconade at Jerome |
| g03-meramec-07010350-2026-11-20 | Flowing | Meramec at Cook Station. Sparse notes: no section |
| g04-current-07068000-2026-11-20 | Low | Doniphan, the thinnest gauge notes (about 1,050 characters) |
| g05-buffalo-07055646-2026-11-19 | Too Low | Earlier prompt `a51bff24…`. Knowledge blocks were `[river]` only |
| g06-current-07064533-2026-11-19 | Low | A condition change. Earlier prompt `a51bff24…`. Two section notes |
| g07-big-river-07018500-2026-11-20 | Low | Byrnesville, a section note |
| g08-gasconade-06934000-2026-11-20 | Unknown | Fallback `no_rating`: what readers got |
| d01-meramec-flood-warning | Good | **Derived** from r03: adds a river Flood Warning downstream (Valley Park) |
| d02-big-river-flash-flood-warning | Flowing | **Derived** from r04: adds a Flash Flood Warning for the surrounding counties |
| d03-james-stale-reading | Low | **Derived** from r01: the reading is 9 hours old |
| d04-meramec-07010350-flood-warning | Flowing | **Derived** from g03: adds a river Flood Warning downstream (Sullivan) |
| d05-gasconade-06933500-stale-reading | Good | **Derived** from g02: the reading is 8 hours old |

### What production never recorded

The log covers 2026-11-17 to 2026-11-20 (263 rows). It holds:

- **No NWS alert of any kind.** No row has an alert in `inputs`.
- **No stale reading.** The oldest reading was 1.4 hours old when its Read was
  written, and no prompt carries the "Reading is N hours old" warning.
- **No High or Dangerous condition.** It was a dry November. Flowing is the
  highest condition recorded.
- **No guard fallback.** Every fallback was decided before the model was
  asked: `no_gauge`, `no_rating`, or `unsupported_section` on a paused stretch
  Read. None was caused by a contradiction, a claims mismatch or an incomplete
  answer.

The flood-warning and stale-reading cases are therefore **derived**. Each is a
recorded morning with one input changed, and `derived.change` in its file
names the change. The alert text was written for this test and is not an NWS
product. Derived mornings have no stored output, so only a replay scores them.
They are not a substitute for recorded mornings. When the log records real
flood warnings, stale readings or High water, add those mornings.

Stretch Reads (`section_slug` set) are excluded. They are paused, and no
screen shows them.

## Replaying and comparing

From `missouri-float-planner/`, on Node 20:

```sh
# Build every prompt. Calls nothing.
npx tsx scripts/research/read-replays/replay.ts --dry-run

# One pass: one billed call per morning that is not a preflight fallback (25 now).
npx tsx scripts/research/read-replays/replay.ts --label before-<change>

# Score one set, or compare two.
npx tsx scripts/research/read-replays/score-set.ts stored
npx tsx scripts/research/read-replays/score-set.ts results/replay-before-<...>.json results/replay-after-<...>.json
```

For a before/after comparison, replay once on `main`, make the change, replay
once more, and compare the two replay files. Comparing a replay with `stored`
also changes the instructions, because the stored outputs answered older
prompts.

What a replay keeps fixed: the recorded inputs (facts, trend, forecast, alerts)
and the river context frozen in each file. What it takes from the checkout:
the prompt builders, the system prompts and `EDDY_KNOWLEDGE.md`. Those are the
things being tested. `createdAt` stands in for "now", so the date line and the
staleness warning describe the recorded morning.

The replay uses production's models. It reads `llm_config` from the linked
project and resolves it with `resolveConfiguredModels()`. On 2026-11-21 that
was `claude-sonnet-4-6` for both river and gauge Reads, because the gauge
workload carries an override. If the provider's key is missing, the replay
stops before any call. It never substitutes another model. It publishes
nothing, writes nothing to the database, and turns upstream telemetry off.

Production's own checks decide each replay outcome (`evaluateReport` in
`src/lib/ai/model-test.ts`):

- A preflight fallback is not sent to the model.
- A passing answer is `model`.
- A replaced or incomplete answer is `fallback`, with the code-written report.
- An empty answer or a failed call is `error`.

## Baseline

### Production's stored outputs

`results/baseline-stored.txt` holds the full table and each morning's failed
rules. It covers the 23 recorded mornings: 20 model-written, 3 fallbacks
(`no_rating` 2, `no_gauge` 1), 0 errors. The rules are the ones in
`read-checks.ts` at the base commit.

| Rule | All outputs | Model-written | Strict |
| --- | --- | --- | --- |
| summary_length | 87% 20/23 | 85% 17/20 | 74% 17/23 |
| read_length | 39% 9/23 | 30% 6/20 | 26% 6/23 |
| read_measurements | 78% 18/23 | 80% 16/20 | 70% 16/23 |
| read_forecast_talk | 100% 23/23 | 100% 20/20 | 87% 20/23 |
| weather_talk | 96% 22/23 | 95% 19/20 | 83% 19/23 |
| flat_forecast | 96% 22/23 | 95% 19/20 | 83% 19/23 |
| numbers_match_inputs | 85% 17/20 | 85% 17/20 | 74% 17/23 |
| numbers_from_knowledge | 95% 19/20 | 95% 19/20 | 83% 19/23 |
| stock_lines | 17% 4/23 | 5% 1/20 | 4% 1/23 |
| brief_talk | 65% 15/23 | 70% 14/20 | 61% 14/23 |

The code-written fallbacks do not pass every rule either. Both river
fallbacks say "thresholds" (`brief_talk`). The Rich Fountain gauge fallback
quotes 2.04 ft in its short Read (`read_measurements`).

### Live replay

A live replay with the current prompts has not been run. Production's river
and gauge model is `claude-sonnet-4-6`, and `ANTHROPIC_API_KEY` was not set in
the environment that saved the set. The dry run builds all 25 prompts. Run one
pass where the key is available, and commit its file under `results/` as the
first replay baseline.
