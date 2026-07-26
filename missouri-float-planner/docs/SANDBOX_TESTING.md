# Testing Eddy end to end in sandbox

How to exercise the whole paid path — sign-in, purchase, entitlement, push,
deletion — before anything is public. Written as a runbook; each section says
what it proves and how you know it worked.

Companion to `REVENUECAT_SETUP.md`, which is the *configuration* runbook. This
is the *verification* one.

---

## The two things that make people think it is broken

Read these before you start. Both produce a flow that looks buggy and is not.

### 1. A simulator cannot do any of this

StoreKit sandbox purchases and APNs both require a **real device**. On a
simulator `Device.isDevice` is false, so the app never even asks for a push
token, and there is no sandbox App Store to buy from.

The `development` EAS profile builds for the simulator. Use
**`development-device`**, which is the same profile with `simulator: false`.

### 2. A sandbox purchase against PRODUCTION will never unlock

This is the one that costs an afternoon.

A sandbox purchase writes an `entitlements` row tagged `environment='SANDBOX'`.
`isEntitlementActive()` **ignores those rows** unless
`ALLOW_SANDBOX_ENTITLEMENTS=true`, and that flag belongs on preview deploys
only — setting it in production would let anyone with a sandbox Apple ID unlock
the paid product for free.

So against production: Apple takes the purchase, RevenueCat fires the webhook,
the row lands correctly, and the app still says you have no subscription.
Nothing is broken. The interlock is working.

**A sandbox build must point at a preview deploy.** Set
`EXPO_PUBLIC_API_BASE_URL` for the environment you build with. The Profile tab
prints the API host in accent colour whenever it is not production — if you do
not see a host there, you are talking to production.

---

## 0. Prerequisites

| What | Where | Proves |
|---|---|---|
| Paid Applications Agreement **Active** | App Store Connect → Business | IAP can exist at all |
| Products created, entitlement `eddy_premium` | RevenueCat + ASC | see `REVENUECAT_SETUP.md` |
| Webhook returns 200 on **Send test event** | RevenueCat → Integrations | URL, header format and secret together |
| APNs key uploaded | `eas credentials` → iOS → Push Notifications | push can be delivered |
| Sandbox tester account | App Store Connect → Users and Access → Sandbox | you have something to buy with |

Vercel environment variables on the **Preview** environment:

```
REVENUECAT_WEBHOOK_SECRET=<same secret as the RevenueCat webhook>
ALLOW_SANDBOX_ENTITLEMENTS=true      # Preview only. NEVER production.
```

Redeploy after setting them — they are read at build time.

---

## 1. Point a build at the preview backend

Get the preview deployment URL from Vercel (any deploy of this branch works —
`https://<something>.vercel.app`).

```bash
cd eddy-ios
eas env:create --environment development \
  --name EXPO_PUBLIC_API_BASE_URL --value "https://<preview-host>"
```

The same environment also needs the variables the app already uses:

```bash
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL       --value "…"
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY  --value "…"
eas env:create --environment development --name EXPO_PUBLIC_MAPBOX_TOKEN       --value "pk.…"
eas env:create --environment development --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value "appl_…"
```

Then build for a real device:

```bash
eas device:create      # register the iPhone once, if you have not
eas build --profile development-device --platform ios
```

Install from the link EAS gives you.

**Check before going further:** open Profile. Under the version you should see
the preview host in accent colour. If that line is missing, the build is
pointed at production and step 4 will not work.

---

## 2. Sign the device into the sandbox account

iOS 18 and later: **Settings → Developer → Sandbox Apple Account**.
Earlier: **Settings → App Store → Sandbox Account** (scroll to the bottom).

**Do not sign into your normal App Store account with the sandbox credentials.**
It is a separate slot; using the main one associates a throwaway tester with
your real Apple ID.

---

## 3. Sign in with Apple, and check the identity upgraded

Launch the app before signing in, star a river, then open Profile and sign in.

```sql
select id, email, is_anonymous, created_at
from auth.users order by created_at desc limit 5;
```

What you want: the row you already had is **still there**, now with
`is_anonymous = false` and an Apple email. A **second** row appearing instead
means the anonymous-to-permanent upgrade failed and that user's stars were left
behind on the old id — that is a bug, not a quirk.

Confirm the stars followed:

```sql
select user_id, river_id, created_at from starred_rivers order by created_at desc limit 5;
```

---

## 4. Buy something

Open a river → **Notify me when it's floatable** → the paywall appears (a 402
from `/api/me/alert-subscriptions` is what triggers it) → buy the yearly
package.

Sandbox subscriptions renew on an accelerated clock — a 1-year subscription
expires in about an hour, and renews up to 6 times before stopping. That is
useful: it means you can watch a renewal without waiting a year.

```sql
select user_id, entitlement_id, expires_at, environment, will_renew, product_id
from entitlements order by updated_at desc limit 5;
```

Expect exactly one row, `entitlement_id = 'eddy_premium'`,
`environment = 'SANDBOX'`, `user_id` equal to the signed-in Supabase user.

Then check the app agreed:

- Profile shows **Eddy Premium is active** with a renewal date.
- The alert subscription the paywall interrupted now exists:

```sql
select user_id, river_id, kind, one_shot from alert_subscriptions order by created_at desc limit 5;
```

That last one is the whole point of the flow — the user asked to be told about
a river, hit a wall, paid, and the thing they asked for happened. If the
entitlement is live but this table is empty, the post-purchase retry is broken.

### If the app still says no subscription

Work down this list:

1. Does Profile show the preview host? If not, see gotcha 2 above.
2. Did the webhook fire? RevenueCat → the customer → **Events**.
3. `ALLOW_SANDBOX_ENTITLEMENTS` set on Preview *and redeployed*?
4. Does `entitlement_id` match `eddy_premium` exactly?

---

## 5. Push

Push needs the permission prompt, which the app only shows after a subscription
exists — that is deliberate (the iOS prompt is one-shot, so it is spent when
there is a concrete notification waiting). You should have seen the primer at
the end of step 4.

```sql
select user_id, platform, device_name, app_version, disabled_at, last_seen_at
from device_tokens order by last_seen_at desc limit 5;
```

A row here means the client did its half.

### Forcing a notification without waiting for a river to change

Insert an event straight into the outbox and drain it. This is exactly what the
gauge cron does, minus the gauge.

```sql
-- Pick a river you are subscribed to.
insert into river_condition_events
  (river_id, old_condition_code, new_condition_code, kind, detected_at)
values
  ('<river-uuid>', 'low', 'flowing', 'floatable', now());
```

Then drain the outbox (the cron runs every 5 minutes on its own, so you can
also just wait):

```bash
curl -X POST "https://<preview-host>/api/cron/deliver-push" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expect a notification within seconds, and a ledger row:

```sql
select event_id, user_id, kind, status, error_code
from alert_push_deliveries order by created_at desc limit 5;
```

`status = 'sent'` is the success case. `error_code = 'device_not_registered'`
means the token is stale — reinstalling regenerates it.

Also worth exercising:

- **Tap the notification** while the app is closed. It should open that
  river's screen, not just the app. This is the cold-start path, which is
  handled separately from the foreground one and is easy to break.
- **Receive one with the app open.** It should still appear as a banner.

---

## 6. Restore purchases

Delete the app, reinstall it, sign in with the same Apple ID, and open Profile →
**Restore purchases**.

This is the one App Review will definitely try. It is also the real test of
Keychain persistence: the Supabase session survives reinstall, so the same user
id is presented to RevenueCat and the entitlement comes back attached to the
same account rather than an orphaned one.

Expect: "Your subscription is restored", and Profile showing it active again.

---

## 7. Account deletion

Profile → **Delete account** → through both confirmations.

```sql
select count(*) from auth.users where id = '<the-user-id>';          -- 0
select count(*) from starred_rivers where user_id = '<the-user-id>'; -- 0
select count(*) from float_plans where user_id = '<the-user-id>';    -- 0
```

The third one matters most and is the easiest to get wrong. `float_plans.user_id`
is `ON DELETE SET NULL`, and a NULL `user_id` means *publicly readable* under
the RLS policy — so if deletion were left to the cascade, a deleted user's saved
floats would become world-readable instead of being removed. They are deleted
explicitly. Check that no plan was merely orphaned:

```sql
select id, short_code, user_id from float_plans
where user_id is null order by created_at desc limit 10;
```

None of these should be plans you created while signed in during this test.

If the account had an active subscription, the app must have told you that
deleting does **not** cancel it. Only Apple can, in Settings → Apple ID →
Subscriptions. Verify that message appeared.

---

## 8. Clearing state between runs

Sandbox accounts remember what they bought, so a second purchase test on the
same tester is a *renewal*, not an initial purchase. To test
`INITIAL_PURCHASE` again, make a new sandbox tester — they are free and
unlimited.

To reset the app side without deleting the account, delete the app; the
Keychain entry goes with it on a device wipe, though a plain reinstall
deliberately keeps it (that is what step 6 tests).

---

## What this does not cover

Refunds, subscription transfers between Apple IDs, and out-of-order webhook
delivery cannot practically be triggered by hand. They are covered by
`src/lib/revenuecat/events.test.ts`, and can be exercised against a preview
deploy with signed payloads — see the last section of `REVENUECAT_SETUP.md`.
