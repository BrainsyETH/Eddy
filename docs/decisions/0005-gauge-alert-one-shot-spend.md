# 0005 — When a gauge alert's one shot is spent

Status: **accepted — implemented** · 2026-07

A gauge alert rule marked one-shot **was** spent at evaluation time, two crons
before delivery, so a rule could be consumed by an event that was never
delivered. **Option B below was chosen and implemented** in migration
`00212_gauge_alert_one_shot_fired_at.sql`; this record keeps the options and
their costs, because the two rejected ones are the shapes a future reader will
reach for first.

## The behaviour that was wrong

`gauge_alert_subscriptions.last_triggered_at` was the sole spend, and is stamped in
[`src/lib/alerts/gauge-threshold.ts`](../../missouri-float-planner/src/lib/alerts/gauge-threshold.ts)
(lines 445 and 481) at the moment the rule's condition is found to be met and
its event is written to the outbox. Delivery happens two crons later. If every
send then failed, or the event was dropped by quiet hours, the rule was still
spent — the user's one shot at "tell me when the Current comes down" is burned
by something they never saw.

This is the same user-visible symptom as the river-alert bug fixed in #1061
(`fired_at` stamped without reference to whether anything sent), by a completely
different mechanism. That fix does not transfer.

## Why the obvious fix is wrong

`last_triggered_at` does three jobs at once:

1. **One-shot state** — non-null means "this rule has fired".
2. **Per-rule cooldown** — how long since the last trigger, which suppresses
   re-firing while a gauge sits just over a threshold.
3. **The wire-format `firedAt`** — serialised to the client
   ([`rule-serialize.ts`](../../missouri-float-planner/src/lib/alerts/rule-serialize.ts)),
   which is how the app shows "last fired" on a rule row.

Clearing it on send failure — the reflex fix — would also reset the cooldown and
corrupt edge-trigger state: a gauge hovering at the threshold would re-evaluate
as a fresh crossing on the next cron and spam the outbox. It would also make the
client's "last fired" jump backwards.

`rule-serialize.ts:88-93` argues against splitting the column, and the argument
is good: *"carrying two columns that must agree is how they stop agreeing."*

## Options

**A — Do nothing, and document it.** The window is narrow: it needs a one-shot
rule whose event fails all five delivery attempts or lands entirely inside quiet
hours. Cost: a silent, unrecoverable failure on a feature whose entire promise is
a single notification.

**B — Add `one_shot_fired_at`, stamped only on delivery success.**
`last_triggered_at` keeps all three of its current jobs unchanged; the new column
answers only "is this rule spent", mirroring the `successBySubscription` shape
the river-alert fix landed. Cost: exactly the two-columns-that-must-agree problem
`rule-serialize.ts` warns about — though note the two would encode *different*
facts (last evaluation vs last delivery), which is weaker than the case it was
arguing against.

**C — Move the whole stamp to delivery.** One column, stamped in
`deliver-push` instead of `gauge-threshold`. Simplest shape, worst semantics: the
cooldown would not start until delivery completes, so a rule could re-evaluate
and re-fire before its first push lands. That turns a missed notification into a
duplicate storm, which is the worse direction to fail.

## Decision: B

`one_shot_fired_at` is nullable and the one-shot check reads it alone.
`last_triggered_at` keeps all three of its previous jobs except the spend, so
the cooldown still starts at evaluation.

The "two columns that must agree" objection does not apply, because these two do
not record the same fact and are not required to agree: `last_triggered_at` is
"last evaluated true", `one_shot_fired_at` is "reached a device". A rule with the
first set and the second null is not an inconsistency — it is precisely the state
the old schema could not express, and the bug.

### What changed

| File | Change |
|---|---|
| `00212_…sql` | the column, a backfill, and a partial index |
| `gauge-threshold.ts` | the spend check reads `one_shot_fired_at`; the `last_triggered_at` stamp is untouched |
| `gauge-delivery.ts` | tallies success per subscription and stamps `one_shot_fired_at` for delivered one-shots, reusing `spentOneShots()` from the river path |
| `rule-serialize.ts` | `firedAt` now means delivered, so a rule the app shows as fired is exactly a rule that will not fire again |
| `me/gauge-alerts/[id]` | re-arm clears both columns |

**The backfill is the part worth remembering.** Without it every already-spent
one-shot re-arms on deploy and fires at the next true evaluation — a
notification storm caused by a bug fix, aimed at the people who asked to be told
once. Existing `last_triggered_at` values are copied across, which may spend a
rule whose push never landed; that is the behaviour those users already have,
and the conservative direction.

### Not done

`gauge_alert_events` still has no per-item attempt count, so `planDrain` is used
for events and the two-state rule above for subscriptions. Leaving an undelivered
one-shot armed is safe because the event-level `MAX_ATTEMPTS` already bounds the
retry window — the same reasoning the river path uses.

## Revisit when

The river and gauge one-shot paths are next touched together. They now agree on
the rule (delivery spends, at-least-one-success counts) but not on the mechanism
— the river path stamps `fired_at` on `alert_subscriptions`, this one stamps a
second column. That is fine, and worth collapsing only if a third alert source
appears.
