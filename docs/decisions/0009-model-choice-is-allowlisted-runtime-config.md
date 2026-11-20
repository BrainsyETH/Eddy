# 0009 — Model choice is runtime config, bounded by a code-side allowlist

Status: **accepted — implemented** · 2026-08 · amended 2026-11 (second provider,
test-only models, cross-provider fallback, per-pass cut-off, OpenAI models
approved for every workload)

Which model writes each kind of generated copy is stored in a private
`llm_config` row and edited from `/admin/ai-models`, but the set of models that
may be stored — and the request parameters each one carries — lives in code, at
[`src/lib/ai/model-registry.ts`](../../missouri-float-planner/src/lib/ai/model-registry.ts).

Two obvious simplifications are both wrong, and this record exists because each
one looks like a cleanup from the inside.

## Why not environment variables

They were the cheaper answer and were considered first. `RIVER_UPDATE_MODEL` and
three siblings would give the same allowlist safety for almost no code, and would
not add an authenticated write path to production configuration.

What they cannot do is change without a deploy. The reason to build this at all
is to evaluate a model against the one before it — a switch, a day of output, a
switch back — and a flow that costs a deploy in each direction is a flow nobody
runs twice. That is the whole trade: **the table buys "no redeploy", and nothing
else.** If a future reader finds these switches are thrown once a year, the env
var version is genuinely better and this should be collapsed into it.

## Why the allowlist is not a database column

The tempting version stores a model id and validates it with a `CHECK`
constraint, or validates nothing at all because "an admin typed it".

`llm_config` feeds four production generators. A free-text model field there is a
way to point the daily cron at an arbitrarily expensive model from a browser, and
a `CHECK` constraint cannot express what actually has to be true:

1. **Approval is per workload, not per model.** Haiku 4.5 is the right model for
   secondary gauge updates and is deliberately not offered for the statewide
   summary, which is the copy that leads with flood framing when water is
   dangerous. "This string is a real model" is not the question being asked.
2. **A model id implies request parameters that differ between models.** Claude
   Sonnet 5 runs adaptive thinking when `thinking` is omitted, and `max_tokens`
   caps thinking and visible text *together* — so the statewide summary's
   200-token budget, correct for Sonnet 4.6, returns a truncated or empty quote
   on Sonnet 5 unless thinking is explicitly disabled. A registry that carried
   only the id would move that failure into production the first time someone
   used the dropdown.
3. **Approving a model should not require a migration.** It requires reading its
   output for that workload and adding a line here.

The river-and-section workload can use Haiku 4.5, but that pairing deliberately
runs without a prompt-cache breakpoint. Its roughly 1,900-token static system
prompt is shorter than Haiku's 4,096-token cache minimum. Cache eligibility is
therefore resolved per workload/model pairing: Sonnet keeps the existing cache,
while Haiku receives the same prompt without an ineffective cache marker. Haiku
remains unavailable for the statewide safety summary.

So the column is nullable free text with no constraint, `NULL` means "use the
code default", and every value is checked against the registry on write *and*
again on read. A row that somehow holds an unapproved value falls back to the
default and logs, rather than throwing: a bad row must not take the daily cron
down with it.

## Why the models are resolved once per pass

Each entrypoint — the two generation crons, `update-gauges` for event-driven
regeneration, and `clip-poster` — resolves the configuration once and threads the
result into every call it makes. Not to save reads. A switch landing mid-pass
would otherwise leave half a run's rows recording one `model_used` and half
another, with nothing marking the boundary, and the first question anyone asks
about a suspicious report is which model wrote it.

The cross-provider fallback below is the one way a pass can hold two models. It
is marked: the failed attempt writes its own `eddy_generation_log` row under the
model that was asked, and the published row's `model_used` names the model that
answered.

## More than one provider (2026-11)

OpenAI models joined the registry so river Reads can run on a prepaid OpenAI
balance. Three things follow from that, and each is a rule rather than a detail.

1. **The provider is part of the profile, and so are its parameters.** OpenAI's
   models repeat the Sonnet 5 trap under another name: `max_output_tokens` covers
   reasoning tokens and visible text together, every current model reasons at
   `medium` when the effort is omitted, and a response that spends its cap
   reasoning comes back with no text. An OpenAI profile therefore has to state
   its `reasoning.effort`: `none` where the model accepts it, `low` with a larger
   cap where it does not.
2. **A workload offers a provider only once its generator can call it.** The
   request is phrased in one place,
   [`src/lib/ai/generate-text.ts`](../../missouri-float-planner/src/lib/ai/generate-text.ts).
   A generator that still builds an Anthropic request itself would send any other
   provider's id to Anthropic, so each workload declares its `providers` and
   `no-hardcoded-models.test.ts` checks that declaration against the code. All
   four workloads go through the adapter as of 2026-11-18.
3. **Token counts are stored in one convention.** Anthropic's `input_tokens`
   excludes cache reads and writes; OpenAI's includes them. `src/lib/ai/usage.ts`
   converts OpenAI's to four disjoint buckets before anything is stored or
   priced, and `pricing.ts` carries each model's own cache rates.

## Testable before approved (2026-11)

"Approved" still means someone has read a model's output for that workload. The
registry now has a second list per workload, `testable`: models the test panel on
`/admin/ai-models` may call and nothing else may. The panel replays a morning
recorded in `eddy_generation_log` on the chosen model, rebuilding the prompt from
the recorded inputs with today's builder and knowledge file (or sending the
stored prompt when a row cannot be rebuilt), and runs the answer through
the same automated checks production runs. It publishes nothing, accepts no
free-text prompt, and does not fall back. Moving an id from `testable` to
`approved` remains a code change, and is the record that the reading happened.

Two things about what the panel shows are rules, not presentation.

- **A pass is a pass of the automated checks, and they are narrow.** They compare
  the condition label, the measurement and the optimal-range comparison with the
  gauge, and require a complete report. An invented landmark, a wrong forecast or
  bad advice passes all of them. Approval rests on a person reading for supported
  local detail, whether the report stays on its own stretch, brevity and Eddy's
  voice. The panel says "Automated checks passed", never that a report is
  accurate, and a test pins that an invented landmark passes so nobody reads the
  label as more.
- **The reference is a re-run, not the published text.** The replay sends today's
  system prompt, and the published text may have been written under an older one,
  so a difference between them could be the model or the instructions. The first
  run on a report also re-runs the workload's current model, and that re-run is
  the default reference. It follows the resolved production selection, including
  changes saved on the same page. References are kept per model so changing that
  selection does not discard earlier results from the session or its export.
  The published text is one click away.

Runs are not stored. The panel exports them as a file, to go with the change that
approves a model.

## The cross-provider fallback (2026-11)

An override served by a different provider than the workload's code default
carries that default as a fallback, tried once when the override's call fails,
returns no text, or returns an incomplete report. The OpenAI balance is prepaid with auto-reload off: at zero,
every request fails until the next grant, and without a fallback a river pass
would write nothing for the rest of the month.

Same-provider overrides get none. If Sonnet 5 fails because Anthropic is failing,
Sonnet 4.6 fails too, and the retry only doubles how long a pass takes to find
that out.

## A report must be whole to be published (2026-11)

River and section generation accepts a model's answer only when the response
finished and holds text in all three blocks after marker cleanup. Repeated block
markers alone are not prose. "Returned some text" is not the test: a model
that spends its output cap part-way through returns text that parses into three
tidy blocks and reads as a report until its last line, and a response holding only
the claims line used to pass the checks and publish an empty report. Whether the
model finished is asked of the provider's stop reason, never inferred from the
text.

An incomplete answer from a model with a fallback is a failed attempt, recorded
as `incomplete_response`. From the last model it is replaced by the code-written
report, recorded as a fallback with reason `incomplete` and the model's partial
text kept beside it.

The rule has two parts on the shared guard. River and section reports take
both. Secondary-gauge updates take only the first (2026-11-20): a response
that did not finish is never a report, from any workload, so from the last
model it is replaced the same way. They do not yet have to hold all three
blocks. They have never reliably carried them (about three in ten stored rows
lack one when this was written), so requiring them there would replace reports
that are published today. Whether to require them is decided from the gauge
replays, as a decision about that workload's prompt.

When every model has been asked and none returned a report (each call failed,
came back empty, or was refused as incomplete while another waited), the
generator publishes the code-written report from the facts it already
gathered, recorded as a fallback with reason `no_model_response` after each
attempt's own error row (2026-11-20). An outage therefore leaves readers a
factual Read, not none once the previous row expires.

## A failing provider is dropped for the rest of the pass (2026-11-18)

The fallback alone has no deadline for the whole pass. An exhausted balance is
refused at once, so it costs nothing to fall back from. A provider that hangs is
different: each target waits out the call timeout before its fallback starts, the
daily pass runs three targets at a time inside a five-minute limit, and a
sustained outage would spend that limit on timeouts and leave most rivers
unwritten.

So a pass counts consecutive failed calls per provider
([`pass-health.ts`](../../missouri-float-planner/src/lib/ai/pass-health.ts)), and
after two stops calling that provider: every remaining target goes straight to its
fallback. An OpenAI call is bounded at thirty seconds with no retry, because the
fallback is the retry. Together these cap what an outage costs a pass at about one
timeout. `attempts.test.ts` simulates the outage: thirty-one targets, three at a
time, OpenAI hanging; at most four OpenAI calls are made and every river is
written by the code default.

Three choices in that rule are deliberate.

- **Only a failed call counts.** A timeout, a network error, a 4xx or 5xx. An
  answer the generator judged unusable (empty, cut off, missing a block) is about
  one answer from a provider that is plainly up, and it resets the count.
- **Two, not one.** A single transient error costs one fallback, not the provider
  for the whole pass.
- **For the rest of the pass, with no timer.** A pass is short. The next one
  starts with a fresh record and tries the provider again.

Every generator runs its attempts through one loop
([`attempts.ts`](../../missouri-float-planner/src/lib/ai/attempts.ts)), because a
generator with its own loop would fall back and still wait out a timeout on every
target. `no-hardcoded-models.test.ts` checks that none does.

## The OpenAI models are approved on the owner's decision (2026-11-18)

GPT-6.2 Sol, GPT-6.1 Terra and GPT-6 Luna are approved for all four workloads.
That is a different basis from the Claude entries, which were approved after
someone read their output for that workload: the owner asked for them to be
selectable everywhere, so each can be judged on real output in production rather
than only replayed in the panel. The registry records this above
`WORKLOAD_SPECS` so the list does not imply a reading that did not happen.

What stands behind it: every OpenAI selection falls back to the workload's Claude
default, a failing provider is dropped for the rest of the pass, river reports
must be whole to be published, and captions still pass the accuracy lint.

Two things are knowingly not in place.

- The test panel replays river and section reports only. There is no replay for
  gauge updates, the statewide summary or captions, so an OpenAI model's first
  output for those is seen in production.
- GPT-6 Luna is OpenAI's smallest tier and is selectable for the statewide
  summary and captions, where Haiku, Anthropic's smallest, is deliberately absent.
  That exclusion was not found wrong; the two are simply not consistent today.

A saved sample set covering low, normal, high, dangerous, flood-alert and
sparse-knowledge cases was proposed as a condition of approval and was not built.
The panel still offers only the newest recorded report per river or section.

## What this does not cover

The brand-check vision call runs in GitHub Actions
(`.github/workflows/brand-check-clip.yml`) and is pinned in the workflow. CI
cannot read `llm_config` without adding another authenticated integration, and
passing a bare model id through a workflow input would hand it a model whose
`thinking` and `max_tokens` requirements the workflow does not implement — the
exact failure the registry exists to prevent. If that call becomes switchable, the
workflow must map an allowlisted id to safe parameters on its own side and reject
anything it does not recognise.
