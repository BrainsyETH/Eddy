# Eddy+ subscriptions via RevenueCat

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

3. **The entitlement identifier is not free-form.** It must be `eddy_plus` —
   that string is the default in the `entitlements` table and in
   `DEFAULT_ENTITLEMENT_ID`. A different identifier writes rows nothing reads,
   and the paywall never unlocks.

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
$29.99 annual sub goes from ~$21 to ~$25 — the strategy's margin model assumes
this. Enrollment takes effect the *month after* approval, so enrolling early
costs nothing and forgetting is expensive.

### 1c. App record and bundle ID

1. Apple Developer portal → **Certificates, Identifiers & Profiles → Identifiers**
   → register an App ID, e.g. `guide.eddy.ios`.
2. App Store Connect → **Apps → +** → New App. Pick the bundle ID from 1c.1.

You do **not** need a built binary for this. Doing it now also **reserves the
App Store name**, which the strategy flags as a Phase 0 task. Because coverage
is national (raw gauges) and multi-state (the Buffalo is in Arkansas), avoid a
state in the name — e.g. *"Eddy: Ozark River Conditions"*, not *"Missouri…"*.

---

## 2. Keys Apple issues to RevenueCat

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

## 3. Create the subscription products

App Store Connect → your app → **Monetization → Subscriptions**.

1. **Create a Subscription Group** — name it `Eddy Plus`. Both products go in
   this one group (see gotcha #4).

2. **Add the annual product:**
   - Product ID: `eddy_plus_annual`
   - Duration: 1 year
   - Price: **$29.99**
   - Localized display name + description (required before submission)

3. **Add the monthly product:**
   - Product ID: `eddy_plus_monthly`
   - Duration: 1 month
   - Price: **$5.99**
   - Deliberately worse value than annual — this is intentional pricing
     strategy, not an oversight.

4. **Add the free trial** — on `eddy_plus_annual` → **Introductory Offers** →
   **Free** → **7 days** → all territories.

   Put the trial on annual only. The trial is the conversion mechanism for the
   product we actually want people on.

Product IDs are yours to choose — the backend records whatever arrives and
never branches on them. Only the *entitlement* identifier is load-bearing.

---

## 4. RevenueCat project

1. Create an account at revenuecat.com and create a **Project** named `Eddy`.

2. **Project Settings → Apps → + New → App Store**:
   - App name: `Eddy`
   - Bundle ID: the one from step 1c
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

- Identifier: **`eddy_plus`** ← must match exactly; see gotcha #3
- Description: `Eddy+ — push alerts, offline rivers, sync`
- **Attach both products** to it.

If you want a different identifier, say so before the app ships — it's a
one-line change in `src/lib/entitlement.ts` plus the `entitlements.entitlement_id`
column default, but the two must never diverge.

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
| `ALLOW_SANDBOX_ENTITLEMENTS` | `true` | **Preview only — never Production** |

`REVENUECAT_WEBHOOK_SECRET` is mandatory: without it the route returns 500 by
design (fail-closed) rather than accepting unverified events.

`ALLOW_SANDBOX_ENTITLEMENTS` is the safety interlock for running one Supabase
project across web and iOS. Sandbox/TestFlight purchases write rows tagged
`environment='SANDBOX'`; those rows are ignored at read time unless this flag is
set. **Setting it in Production would let anyone with a sandbox Apple ID unlock
Eddy+ for free.** Redeploy after changing it — env vars are read at build time.

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

- one row, `entitlement_id = 'eddy_plus'`, `environment = 'SANDBOX'`
- `user_id` equals the Supabase user id of the signed-in account
- `GET /api/me/profile` on a **preview** deploy reports `isActive: true`
- the same call in **production** reports `isActive: false` ← this is correct
  and is the interlock working

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
       "expiration_at_ms":1815536000000,"entitlement_ids":["eddy_plus"]}}'
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

- **Apple's signing key for Sign in with Apple expires roughly every 6 months.**
  Calendar the rotation now; an expired key silently breaks all new sign-ins.
- Refunds revoke entitlement automatically via the webhook — no manual step.
- RevenueCat's dashboard is the source of truth for subscription analytics
  (trial→paid, churn, cohorts); `entitlements` is only the access-control
  mirror. Don't reconcile revenue numbers from Postgres.
