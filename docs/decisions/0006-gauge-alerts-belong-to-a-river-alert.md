# 0006 — A gauge alert can belong to the river alert it was created from

Status: **accepted — implemented** · 2026-08

`gauge_alert_subscriptions` gained a nullable `parent_subscription_id`
referencing `alert_subscriptions`, in migration
`20260802143000_gauge_alert_parent_subscription.sql`. A rule that names a parent
is **gated** by it — the evaluator skips it while the parent is paused — and is
**deleted with it** by cascade.

This record exists because the two rejected options are the shapes a future
reader will reach for first, and one of them shipped for three commits.

## The relationship that existed and was not recorded

`RiverGaugeAlerts` renders *inside* a river alert's edit screen. The Meramec is
gauged four times over 108 miles, and a river alert grades only the primary
station, so that section lets you switch on the other three — each of which
creates a `gauge_alert_subscriptions` row.

Nothing recorded that those rows came from the alert above them. Two
consequences, both user-visible:

1. **The Alerts tab showed four cards all titled "Current River."** One alert
   plus three refinements to it, drawn as four unrelated rules.
2. **Deleting the river alert orphaned them.** The gauge rules kept firing about
   a river the user believed they had stopped following.

## Option A — infer the relationship from `(user_id, river_id)`

What the app shipped first. `groupAlertRules` adopted every gauge rule on a
river the same user subscribed to.

Wrong in both directions. It adopts a custom level somebody set from the gauge
screen on a river they happen to follow, and it cannot express a rule that was
created from the river alert and should travel with it. The information simply
was not in the database, so no client could reconstruct it correctly.

## Option B — cascade the writes, and remember on the client

Also shipped, briefly. The parent's switch wrote `enabled` on every rule in the
group, and the app kept a device-local record of which children had already been
off so that resuming could avoid sweeping them back on.

It worked, and it was wrong in a way worth naming: **a master switch that
overwrites its children is not a master switch.** Every nested toggle on iOS —
Settings, Gmail, Slack — *gates* its children and hands them back untouched.
Option B destroyed the state it then had to reconstruct from a side-channel, and
the side-channel had failure modes of its own (a reinstall, a cleared store, a
child toggled while its parent was paused).

The argument that kept it alive for three commits was that the alternative
needed "a client-side shadow of server state." That was a misdescription: the
record was a log of what a control had done, not a copy of anything the server
held. The real objection to Option B is simpler — it wrote to rows the user had
not asked it to write to, and no amount of bookkeeping makes that not have
happened.

## Option C — record the parent, gate on it — chosen

One nullable column. The parent's `enabled` is read by
[`isRuleLive`](../../missouri-float-planner/src/lib/alerts/gating.ts), which both
alerting passes import: `evaluate-gauge-alerts` uses it to decide whether a rule
may write an outbox row, and `deliver-push` re-checks it before sending, because
those two run on different schedules and the answer can change in between.

What this buys, none of which is available without the column:

- **Pausing a river alert writes exactly one row.** The children are untouched,
  so resuming restores each of them to whatever it was, and there is nothing to
  remember anywhere.
- **`on delete cascade`** ends the orphan.
- **The list can group what actually belongs together** rather than everything
  that shares a river. How it draws the group is its own decision — see
  *How the list draws a group* below.

Client-side, this deleted `alertPauseMemory.ts`, the batch mutations added to
support the cascade, and the pause/resume selection logic — the whole of Option
B.

### The costs, stated

- **A gated child's own `enabled` stays true.** It is on and will not fire. A
  child that has a row of its own therefore shows **no switch** while its parent
  is paused, and says "Paused with the river alert above." That copy is
  load-bearing. The first version showed the switch on and disabled, to avoid
  misstating stored state; a disabled iOS switch barely dims, so the most
  prominent control in a paused group read ON.
- **Gating and pausing freeze the rule's crossing state identically.** A gated
  rule is dropped from the pass exactly like one the user paused, so resuming
  after a long gap can fire on the first crossing it sees. That is a property of
  pausing rather than of this mechanism, and giving the gate its own gentler
  behaviour would have meant two flavours of "paused" — which is the kind of
  second concept this record exists to avoid.
- **Integrity needs a trigger, not a `CHECK`.** A parent must belong to the same
  user and river, and neither fact is on the row. `gauge_alert_parent_is_same_river`
  enforces it, for the reason migration 00200 gives about its own constraints: a
  bad backfill or a psql session must not be able to create a row the evaluator
  would have to guess about.
- **The backfill cannot be precise.** A condition rule created from the gauge
  screen on a followed river is indistinguishable from one created in the river
  alert, because nothing ever recorded the difference. The migration adopts
  them; both alert tables were empty in production when it was written, so this
  cost was theoretical there and is real for any environment that is not.

## How the list draws a group

Amended 2026-11. The mechanism above is unchanged; this is what the Alerts tab
shows for it.

The first version drew every child as an indented row under its river: its own
switch, its own trigger sentence, its own edit screen. That matched the rows in
the database and not what the user had done. A child is created by one station
switch inside the river alert's edit screen and copies the river alert's
setting, so to the person who flipped it, it is the same alert on more of the
river. Drawn as a row it repeated the parent's sentence, could be turned off
three ways (its own switch, the edit-screen switch that deletes it, the parent's
gate), and needed copy to explain why it read on beside a paused parent.

So the list now splits a group's children
([`groupCoverage`](../../eddy-ios/src/lib/alertGroups.ts)):

- **A child that still follows its parent is coverage.** Same condition setting,
  on, not a one-shot the parent is not. It has no row. The river's row names it
  ("Main gauge + Sullivan"), reports the latest send across the stations it
  covers, and says when one of them has stopped reporting. It is switched off
  where it was switched on: the river alert's edit screen, which deletes it.
- **A child that differs keeps an indented row** — paused by hand, given its own
  trigger, or spent. That difference is the one thing the river's row cannot
  say for it.

What this gives up, on purpose: a covered station can no longer be paused or
given its own trigger from the list. A different trigger on one station is a
standalone gauge alert set from the gauge screen, which has no parent and is
not gated.

### A change of setting follows; a pause still does not

Coverage is only true while parent and child agree, so a change to the river
alert's **setting** — its kind, its one-time flag, or re-arming it — is applied
to the children that were on the old setting. Both replacing an existing alert and editing it call the same database transaction.
It locks the river subscription before updating its followers and commits both
changes together. [Migration](../../missouri-float-planner/supabase/migrations/20261120150000_river_alert_delivery.sql)

Without it, switching a river alert from floatable to high water left every
covered gauge firing on the trigger just replaced, each one now an exception
row.

This is not Option B. Option B wrote `enabled` to children on a pause and then
had to remember what it had overwritten. Pausing is still a gate that writes
nothing. A setting change writes the trigger, in the request where the user
changed the trigger, to rows that held the old one because they inherited it; a
child given its own trigger is left alone. A child the server cannot move — the
new setting would duplicate a standalone alert on that station — keeps its old
setting and shows as an exception.

Gauges added from the edit screen are created on the river alert's saved
setting, one-time flag included. When a one-time river alert sends, delivery
switches it off, which gates its gauges until it is re-armed; re-arming it
re-arms the spent gauges that follow it.

### "Sent" means a notification went out

A river alert's `lastTriggeredAt` is written by delivery. A gauge rule's is
written by the evaluator when the reading crosses, before quiet hours, the gate
and the push itself. So the list says "Last sent" only for a river alert, and
"met its trigger" for a gauge — on a gauge's own row and when a covered gauge is
the latest thing a river's row has to report.

The row's hint about the parent's reach ("Also pauses the gauge alert below")
shows only while the parent is on. It previously read "paused together" in both
states, which on a live alert looked like a status.

## Failing open

`isRuleLive` treats a parent it cannot resolve as *not paused*. A failed lookup
must not silently withhold a flood warning somebody explicitly asked for, and
the cascade makes the deleted-parent case moot in practice — but a predicate
should not depend on a foreign key to be safe.
