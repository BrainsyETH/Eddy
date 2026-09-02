# 0009 — Model choice is runtime config, bounded by a code-side allowlist

Status: **accepted — implemented** · 2026-08

Which Claude model writes each kind of generated copy is stored in a private
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

## What this does not cover

The brand-check vision call runs in GitHub Actions
(`.github/workflows/brand-check-clip.yml`) and is pinned in the workflow. CI
cannot read `llm_config` without adding another authenticated integration, and
passing a bare model id through a workflow input would hand it a model whose
`thinking` and `max_tokens` requirements the workflow does not implement — the
exact failure the registry exists to prevent. If that call becomes switchable, the
workflow must map an allowlisted id to safe parameters on its own side and reject
anything it does not recognise.
