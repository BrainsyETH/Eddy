# 0005 — When a gauge alert's one shot is spent

Status: **open — decision required** · 2026-07

A gauge alert rule marked one-shot is spent at **evaluation** time, two crons
before delivery, so a rule can be consumed by an event that is never delivered.
This records the options and their costs. It is deliberately not a code change:
the column involved is triple-duty, and the obvious fix corrupts two of its
three jobs.

## The behaviour today

`gauge_alert_subscriptions.last_triggered_at` is stamped in
[`src/lib/alerts/gauge-threshold.ts`](../../missouri-float-planner/src/lib/alerts/gauge-threshold.ts)
(lines 445 and 481) at the moment the rule's condition is found to be met and
its event is written to the outbox. Delivery happens two crons later. If every
send then fails, or the event is dropped by quiet hours, the rule is still
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

## Recommendation

**B**, with the new column nullable and the one-shot check reading it alone. The
"two columns that must agree" objection is about columns that duplicate a fact;
these record two different events, and the confusion the objection anticipates is
addressable by naming — `last_triggered_at` is "last evaluated true",
`one_shot_fired_at` is "delivered at least once".

Not scheduled. It needs a migration, a change to the fan-out skip rule at
`fanout.ts:220`, and regression coverage in `drain.test.ts` proving a failed send
leaves a one-shot armed.

## Revisit when

Any of: a user reports a gauge alert that never arrived and cannot be re-armed;
gauge alerting moves out of internal testing; or the river-alert one-shot rule in
`spentOneShots()` is next touched, since the two should end up shaped alike.
