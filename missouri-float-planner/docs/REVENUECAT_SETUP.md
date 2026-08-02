# Eddy Premium subscriptions via RevenueCat

> **Status: active** — runbook for Eddy Premium subscriptions via RevenueCat.

Everything required to take Eddy from "no consumer payments" to a working
Apple IAP subscription, end to end. Written as a runbook — follow it top to
bottom; each section says what it unblocks.

Backend code this configures:
- `src/app/api/webhooks/revenuecat/route.ts` — the only writer of `entitlements`
- `src/lib/revenuecat/events.ts` — event → entitlement-state semantics
- `src/lib/entitlement.ts` — `requireEntitlement()` / `withEntitlement()` guards
- migration `00180_ios_profiles_entitlements.sql` — the `entitlements` table

## Flow

```
   iOS app (Phase 1)
        │  1. Sign in with Apple  →  Supabase user id (a UUID)
        │  2. Purchases.logIn(<that UUID>)     ← appUserID MUST be this
        │  3. purchase()  ──▶ Apple StoreKit
        ▼
   Apple App Store  ──App Store Server Notifications──▶  RevenueCat
        │                                                    │
        │                                                    │ POST, shared secret
        │                                                    ▼
        │                            POST /api/webhooks/revenuecat
        │                                 │  1. verify Authorization header
        │                                 │  2. reduce event → entitlement state
        │                                 │  3. idempotent upsert (service role)
        │                                 ▼
        │                            Supabase: entitlements
        ▼                                 │
   app reads entitlement ◀────────────────┘  (also GET /api/me/profile)
```

## Four things that trip people up

1. **The `appUserID` must be the Supabase user id.** If the app lets someone
   purchase while RevenueCat is still using its own anonymous id
   (`$RCAnonymousID:…`), the entitlement has nowhere to land — the webhook
   logs an error and grants nothing, by design. A reinstall would orphan the
   purchase entirely. This is why the paywall requires Sign in with Apple
   *before* the purchase sheet.

2. **The Authorization header must include the literal word `Bearer`.** The
   route compares the entire header against `Bearer ${REVENUECAT_WEBHOOK_SECRET}`
   in constant time. Pasting only the secret produces a 401 on every event.

3. **The entitlement identifier is not free-form.** It must be `eddy_premium` —
   that string is `DEFAULT_ENTITLEMENT_ID` in `src/lib/entitlement.ts`, the
   `entitlements` column default (migration 00192), and `ENTITLEMENT_ID` in the
   app. A different identifier writes rows nothing reads, and the paywall never
   unlocks — silently, with no error anywhere. `src/lib/entitlement-id.test.ts`
   keeps the copies in step; it cannot check the dashboard, so that one is on
   you.

4. **Auto-renewable subscriptions must live in a subscription group.** Annual
   and monthly belong in the *same* group, or users cannot upgrade/downgrade
   between them and Apple treats them as unrelated purchases.

---

## 1. Apple prerequisites (start first — these have multi-day latency)

### 1a. Paid Applications Agreement + banking and tax

App Store Connect → **Business** (older UI: *Agreements, Tax, and Banking*).

Accept the **Paid Applications** agreement, then complete the bank account and
tax forms. **You cannot create in-app purchases until this shows Active.** Bank
verification and tax review commonly take several business days, which is why
this is step one.

### 1b. Apple Small Business Program

App Store Connect → **Business → Small Business Program** → enroll.

Drops Apple's commission from 30% → **15%** for under ~$1M/yr. Net revenue on a
$19.99 annual sub goes from ~$14 to ~$17 — the strategy's margin model assumes
this. Enrollment takes effect the *month after* approval, so enrolling early
costs nothing and forgetting is expensive.

### 1c. App record and bundle ID — ✅ DONE

The registered bundle ID is **`eddy.guide.app`**. Note it is the domain in
forward order rather than reverse-DNS; that is intentional and immutable. Use
this exact string everywhere below — RevenueCat, App Store Connect and the
Supabase Apple provider all key on it, and a mismatch fails at runtime with an
unhelpful error.

Also confirm **Sign in with Apple** is enabled as a capability on this App ID
(Identifiers → `eddy.guide.app` → Capabilities). Without it the entitlement is
missing from the provisioning profile and the native sign-in sheet never
appears.

Still outstanding from this step: the App Store Connect app record itself, which
**reserves the App Store name**. Because coverage is national (raw gauges) and
multi-state (the Buffalo is in Arkansas), avoid a state in the name — e.g.
*"Eddy: Ozark River Conditions"*, not *"Missouri…"*. You do not need a built
binary to create it.

---

## 2. Keys and provider configuration

### 2a. In-App Purchase Key (StoreKit 2 — preferred)

App Store Connect → **Users and Access → Integrations → In-App Purchase**
→ **+** → name it `RevenueCat` → **Generate**.

Download the `.p8` file. **Apple lets you download it exactly once.** Note the
**Key ID** and your **Issuer ID** from the same page.

### 2b. App Store Connect API Key

App Store Connect → **Users and Access → Integrations → App Store Connect API**
→ **Team Keys** → **+**.

Give it the **App Manager** role (RevenueCat's documented minimum for managing
products). Download the `.p8` — again, one download only. Record the Key ID and
Issuer ID.

### 2c. App-Specific Shared Secret (legacy StoreKit 1 fallback)

App Store Connect → your app → **App Information** → **App-Specific Shared
Secret** → generate and copy.

Still worth setting: it covers receipt validation paths the newer keys don't.

> Store all three secrets in your password manager. None of them should ever be
> pasted into a chat, a commit, or an issue.

---

### 2d. Supabase: the Apple provider

This is what makes Sign in with Apple actually mint a Supabase session, and it
is the smallest step here by a wide margin — which is worth saying plainly,
because most Apple/Supabase guides describe a much heavier setup that does not
apply.

Supabase dashboard → **Authentication → Sign In / Providers → Apple**:

1. **Enable** the provider.
2. **Client IDs**: `eddy.guide.app`
3. Leave **Secret Key (for OAuth)** and **Services ID** EMPTY.
4. Save.

Then, still under Authentication → Providers, confirm **Anonymous sign-ins** is
**enabled**. The app acquires an anonymous identity on first launch so stars
have somewhere to live before anyone signs in, and Apple sign-in upgrades that
same user id in place. With it disabled the client gets
`422 anonymous_provider_disabled`, degrades to local-only, and the conversion
path silently stops working.

### Why there is no secret key here

Two different Apple sign-in flows exist and they need different things:

| Flow | Used by | Needs |
|---|---|---|
| **Web OAuth** — redirect to appleid.apple.com | a browser | Services ID + a `.p8` key + a **JWT client secret that expires ~6 months** |
| **Native ID token** — `signInWithIdToken` | this app | the **bundle ID**, and nothing else |

The app takes the second path (`src/hooks/useSession.tsx`). iOS hands back a
signed identity token whose `aud` claim is the bundle ID; Supabase verifies the
signature against Apple's public keys and checks `aud` against the Client IDs
list. There is no shared secret in that exchange, so there is nothing to rotate
and nothing to expire.

**Do not add the Services ID "for completeness."** Configuring the OAuth flow
creates a credential that expires in six months, and when it does, the failure
is a silent one nobody is watching for.

### Verifying it

There is nothing to test until a build runs on a device or simulator (Sign in
with Apple does not work in Expo Go). Once it does, a successful sign-in shows
up in the dashboard: **Authentication → Users**, where the row's provider reads
`apple` and — the part that matters — the **user id is unchanged from the
anonymous session it replaced**. A NEW row appearing instead means the upgrade
path broke and the user's stars were left behind on the old id.

---

## 3. Create the subscription products

App Store Connect → your app → **Monetization → Subscriptions**.

1. **Create a Subscription Group** — name it `Eddy Plus`. Both products go in
   this one group (see gotcha #4).

2. **Add the annual product:**
   - Product ID: `eddy_plus_annual`
   - Duration: 1 year
   - Price: **$19.99**
   - Localized display name + description (required before submission)

3. **Add the monthly product:**
   - Product ID: `eddy_plus_monthly`
   - Duration: 1 month
   - Price: **$1.99**
   - ⚠️ At these prices monthly is **no longer a decoy**. Twelve months of
     monthly is $23.88 against $19.99 annual — a 1.19x premium, where the
     original $5.99/$29.99 pair was 2.4x. More to the point, this product is
     SEASONAL: four summer months on monthly costs $7.96, or 40% of the annual
     price, against 80% under the old pair. A rational floater now subscribes
     in May and cancels in September. See the strategy doc's break-even
     section — the annual-first framing depends on that arithmetic.

4. **Add the free trial** — on `eddy_plus_annual` → **Introductory Offers** →
   **Free** → **7 days** → all territories.

   Put the trial on annual only. The trial is the conversion mechanism for the
   product we actually want people on.

Product IDs are yours to choose — the backend records whatever arrives and
never branches on them, so the `eddy_plus_*` names above are illustrative and
may not match what is actually live in App Store Connect. Only the *entitlement*
identifier is load-bearing, and that one is `eddy_premium`.

---

## 4. RevenueCat project

1. Create an account at revenuecat.com and create a **Project** named `Eddy`.

2. **Project Settings → Apps → + New → App Store**:
   - App name: `Eddy`
   - Bundle ID: `eddy.guide.app` (exactly — see 1c)
   - **In-App Purchase Key**: upload the `.p8` from 2a, with its Key ID + Issuer ID
   - **App Store Connect API Key**: upload the `.p8` from 2b
   - **App-Specific Shared Secret**: paste from 2c

3. **Import the products** — Product Catalog → **Products** → RevenueCat can
   import from App Store Connect once the API key is attached. Confirm both
   `eddy_plus_annual` and `eddy_plus_monthly` appear.

---

## 5. Entitlement and Offering

### 5a. Entitlement (load-bearing — get this exactly right)

Product Catalog → **Entitlements** → **+ New**:

- Identifier: **`eddy_premium`** ← must match exactly; see gotcha #3
- Description: `Eddy Premium — Eddy's daily written read on a river`
- **Attach both products** to it.

Changing it later means changing `DEFAULT_ENTITLEMENT_ID` in
`src/lib/entitlement.ts`, `ENTITLEMENT_ID` in `eddy-ios/src/lib/purchases.ts`,
and a migration for the column default — all three together.
`src/lib/entitlement-id.test.ts` fails if any two disagree, but nothing can
check the dashboard for you.

### 5b. Offering

Product Catalog → **Offerings** → **+ New**:

- Identifier: `default`
- Packages: **Annual** → `eddy_plus_annual`, **Monthly** → `eddy_plus_monthly`

Nothing server-side reads this; the Phase 1 paywall does. Creating it now means
the app has something to render on day one, and it's what RevenueCat
Experiments will A/B against later (price testing, per the strategy).

---

## 6. The webhook

RevenueCat → **Project Settings → Integrations → Webhooks → + New**.

| Field | Value |
|---|---|
| **URL** | `https://eddy.guide/api/webhooks/revenuecat` |
| **Authorization header** | `Bearer <REVENUECAT_WEBHOOK_SECRET>` |
| **Event types** | All (the default) |
| **Environment** | Send both Sandbox and Production |

Generate the secret with:

```bash
openssl rand -base64 32
```

Notes:

- **Include the word `Bearer` and one space** before the secret. See gotcha #2.
- **Before this PR is merged**, point the URL at the branch's Vercel preview
  deploy instead (`https://<preview-host>/api/webhooks/revenuecat`), and set
  the same secret on the Preview environment.
- Leave event types at "all". The route handles the full vocabulary and
  explicitly acknowledges (200) anything it doesn't act on, so nothing gets
  stuck in RevenueCat's retry queue.
- RevenueCat retries on 5xx. The route returns 5xx only for genuine config or
  database failures, and 200 for events that can never succeed (unknown user,
  non-UUID `appUserID`) — so a bad event won't retry forever.

---

## 7. Apple Server Notifications

RevenueCat needs Apple to push it lifecycle events, or refunds and expirations
arrive late or not at all.

RevenueCat's App Store app settings shows an **Apple Server Notifications URL**.
Copy it into App Store Connect → your app → **App Information → App Store
Server Notifications**:

- **Production Server URL**: the RevenueCat URL
- **Sandbox Server URL**: the same URL
- Version: **Version 2**

This is what makes `CANCELLATION` (with `cancel_reason: CUSTOMER_SUPPORT` for
refunds) and `EXPIRATION` arrive promptly. The backend already revokes
immediately on a support-issued refund — but only if Apple tells RevenueCat.

---

## 8. Vercel environment variables

Vercel → project → **Settings → Environment Variables**:

| Variable | Value | Environments |
|---|---|---|
| `REVENUECAT_WEBHOOK_SECRET` | the secret from step 6 | **Production + Preview** |
| `DENY_SANDBOX_ENTITLEMENTS` | *unset* | — see below |

`REVENUECAT_WEBHOOK_SECRET` is mandatory: without it the route returns 500 by
design (fail-closed) rather than accepting unverified events.

### Sandbox entitlements are honoured, and that is deliberate

`ALLOW_SANDBOX_ENTITLEMENTS` used to be required before a `environment='SANDBOX'`
row would unlock anything, and it was documented as "Preview only — never
Production".

**That would have failed App Review, silently.** App Review purchases through the
StoreKit sandbox. The reviewer signs in, buys, RevenueCat sends
`environment='SANDBOX'`, the webhook writes the row correctly — and
`isEntitlementActive()` then answered false, so `/api/me/profile` reported
`isActive:false` and Premium stayed locked behind a purchase that had just
succeeded. Nothing in the app, the RevenueCat dashboard or the database would
have pointed at the cause.

The exposure the old default guarded against is narrower than it reads. A
sandbox receipt cannot be minted by the public — sandbox tester credentials come
from this App Store Connect account, TestFlight membership is invited, and
RevenueCat validates the receipt with Apple before the webhook fires. The set of
people who can hold a SANDBOX entitlement is exactly {App Review, invited
testers}, and both should have the paid features while testing them.

`DENY_SANDBOX_ENTITLEMENTS=true` restores the old strict behaviour if it is ever
wanted. Nothing sets it. Redeploy after changing it — env vars are read at build
time.

---

## 9. Verification

### 9a. Webhook wiring (30 seconds, touches no data)

RevenueCat webhook settings → **Send test event**.

Expected: HTTP 200, and a Vercel log line:

```
[RevenueCatWebhook] Received TEST event — webhook wiring is good
```

This single click validates URL, header format, and secret together.

| Symptom | Cause |
|---|---|
| 401 | Header missing the `Bearer ` prefix, or secret mismatch |
| 500 `Webhook not configured` | `REVENUECAT_WEBHOOK_SECRET` unset in that environment (or set but not redeployed) |
| 404 | Wrong URL, or the deploy predates this route |

### 9b. Sandbox purchase (after the Phase 1 app exists)

1. App Store Connect → **Users and Access → Sandbox → Test Accounts** → create one.
2. Sign into that account on the device (Settings → App Store → Sandbox Account).
3. In the app: sign in with Apple, then purchase.

Expected result:

```sql
select user_id, entitlement_id, expires_at, environment, last_event_type
from entitlements order by updated_at desc limit 5;
```

- one row, `entitlement_id = 'eddy_premium'`, `environment = 'SANDBOX'`
- `user_id` equals the Supabase user id of the signed-in account
- `GET /api/me/profile` reports `isActive: true` — on **preview and production
  alike**, and in the app Premium unlocks

That last point used to read the other way: production was expected to report
`isActive: false`, and that was described as the interlock working. It was not.
It was the bug that would have failed App Review — see §8. If production reports
`false` after a successful sandbox purchase, something set
`DENY_SANDBOX_ENTITLEMENTS`.

### 9c. Hard-to-reproduce paths

Refunds, transfers, and out-of-order delivery are impractical to trigger by
hand in sandbox. They're covered by unit tests (`src/lib/revenuecat/events.test.ts`),
and can be exercised against a preview deploy with signed payloads:

```bash
curl -X POST "https://<preview-host>/api/webhooks/revenuecat" \
  -H "Authorization: Bearer $REVENUECAT_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":{"id":"evt_test_1","type":"INITIAL_PURCHASE",
       "app_user_id":"<a-real-supabase-user-uuid>",
       "product_id":"eddy_plus_annual","store":"APP_STORE",
       "environment":"SANDBOX","event_timestamp_ms":1784000000000,
       "expiration_at_ms":1815536000000,"entitlement_ids":["eddy_premium"]}}'
```

Re-sending the identical payload must leave the row unchanged (idempotency),
and a `CANCELLATION` with an *older* `event_timestamp_ms` must not revoke a
newer renewal (ordering guard).

---

## 10. What the app needs (Phase 1)

- **Public SDK key** — RevenueCat → Project Settings → **API Keys** → the
  Apple key beginning `appl_`. Safe to commit as a public key; it can only
  read offerings and start purchases.
- The app must call `Purchases.logIn(supabaseUserId)` **after** Sign in with
  Apple and **before** presenting the paywall. See gotcha #1.
- Persist the Supabase session refresh token in the **Keychain** so a reinstall
  restores the same user id, and the entitlement with it.

## 11. Ongoing operations

- **No Apple signing key to rotate — as long as sign-in stays native.** The
  often-cited "the Apple secret expires every 6 months" applies to the *web*
  OAuth flow, which needs a Services ID and a JWT client secret. The app uses
  `signInWithIdToken`, which Supabase validates against the bundle ID alone (see
  §2d). Nothing expires. If web sign-in is ever added (strategy: v2), that
  secret and its rotation come with it — calendar it *then*.
- Refunds revoke entitlement automatically via the webhook — no manual step.
- RevenueCat's dashboard is the source of truth for subscription analytics
  (trial→paid, churn, cohorts); `entitlements` is only the access-control
  mirror. Don't reconcile revenue numbers from Postgres.
