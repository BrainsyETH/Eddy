# Submitting Eddy — the version page, in order

The one-sitting checklist for App Store Connect's **version** page and the
things that gate it. It is deliberately an ORDER rather than a list: three of
these block the others, and two of them take days.

This file does not restate what is already written down. It says what to do and
where the answer lives:

| You need | It is in |
| --- | --- |
| Name, subtitle, description, keywords, What's New, categories, URLs | `marketing/app-store/LISTING.md` |
| App Privacy answers, with the code that makes each true | `docs/app-privacy-labels.md` |
| Reviewer notes, paste-ready | same file, "Reviewer notes" |
| Screenshots | `marketing/app-store/exports/iphone-6.9-native/` |
| How to produce a build at all | `docs/ios-release-runbook.md` |

---

## Before the version page will let you finish

### 1 · Paid Applications Agreement — start this first, it takes days

App Store Connect → **Business**. Accept the Paid Applications agreement, then
complete the bank account and tax forms. **You cannot create an in-app purchase
until this shows Active**, and bank verification plus tax review commonly take
several business days.

This is the only item here with a multi-day floor. Everything else is minutes.
Details: `missouri-float-planner/docs/REVENUECAT_SETUP.md` §1a.

### 2 · The subscription must exist, and be attached to THIS version

The version page's In-App Purchases and Subscriptions section is not optional
decoration for Eddy. If the subscription is not submitted **with** the build:

- `fetchOfferings()` returns empty
- the paywall renders "No subscription options are available right now"
- the reviewer sees an app whose only paid feature cannot be bought

That is a clean **Guideline 2.1** rejection, and App Store Connect warns about
it on the page itself: *"Your first in-app purchase and subscription must be
submitted with a new app version."*

- [ ] Subscription product created in App Store Connect, in a subscription group
- [ ] Localized display name and description filled in
- [ ] **Review screenshot** attached to the product — App Store Connect requires
      one per in-app purchase and will block submission without it
- [ ] Product attached to the RevenueCat offering marked **current**
- [ ] The subscription selected in this version's In-App Purchases section
- [ ] A sandbox purchase run end to end: purchase → RevenueCat webhook →
      `entitlements` row → `/api/me/profile` → `waitForEntitlement`

### 3 · The build has to be the right build

Check the upload date against what you expect to be in it. A build that predates
a fix ships without it, and one of them is not cosmetic:

- **The photo Report control** is the App Store's required reporting mechanism
  for user-generated content (Guideline 1.2). A build without it puts that gap
  back, and the reviewer notes below claim the control exists — which would make
  the notes wrong as well as the app short.
- `expo-blur` is a **native** module. It cannot arrive over the air; a build
  without it has no blur on the locked report at all.

---

## The version page, field by field

### Build

Attach the build. The app icon populates from the build's asset catalog once
processing finishes — a blank icon before that is expected and means nothing.

### App Review Information → Sign-In Information

**Leave "Sign-in required" UNCHECKED. Do not fill in a username and password.**

Eddy has no username/password login. Sign in with Apple is the only sign-in
method in the app, so there is no field a reviewer could type a demo credential
into — and handing them one they cannot use is how a review cycle gets spent on
a question. `docs/app-privacy-labels.md` explains this in full under
"Sign-In Information".

### App Review Information → Notes

Paste the block from `docs/app-privacy-labels.md` → "Reviewer notes". It covers
the five things that otherwise read as broken:

1. No demo account is possible or needed, and why
2. The paywall withholding purchase controls until sign-in is deliberate
3. Location is only ever requested on an explicit tap
4. Account deletion is in Profile
5. Community photos are moderated before publication **and reportable after it**

### App Review Information → Contact

Name, phone, email. Reachable during review.

### App Privacy

Transcribe from `docs/app-privacy-labels.md`. Do not re-derive them — the file
records each category, whether it is linked to identity, and the code that makes
the answer true. A label that disagrees with observed traffic is grounds for
rejection in either direction.

### Age rating

Two answers are not obvious and should be given the same way every time:

- **User-generated content: YES.** Eddy publishes community river photos. The
  follow-up asks whether it is moderated: it is, before publication, and the app
  carries an in-app reporting route on every published photo.
- **Unrestricted web access: NO.** External links open in Safari and the maps
  app; the app embeds no browser.

### Export compliance

Nothing to do. `ITSAppUsesNonExemptEncryption` is `false` in
`eddy-ios/app.json`, Expo writes it into `Info.plist`, and App Store Connect
stops asking. The declaration is accurate: every cryptographic thing the app
does is HTTPS/TLS or Keychain, both Apple's own implementation. No crypto
library reaches the bundle — `node-forge` is present in `node_modules` but only
via `@expo/cli` and `@expo/code-signing-certificates`, both build-time, and a
grep of the production bundle finds none of it.

**Revisit if you ever add a package that does crypto in JavaScript** — offline
encryption, a token signer, local hashing. That answer stops being true.

### Everything else on the page

- **App Clip / iMessage App / Game Center** — none. Leave them alone.
- Description, keywords, subtitle, promotional text, What's New, categories,
  support and marketing URLs: `marketing/app-store/LISTING.md`.

---

## Before hitting Submit

- [ ] `make check` green at the repo root
- [ ] `make check-eas-env` green — it compares variable NAMES across `preview`
      and `production`, which `eas env:list` cannot do
- [ ] The build attached is the one you think it is
- [ ] Subscription attached, with its review screenshot
- [ ] Sign-in required unchecked, notes pasted, contact filled
- [ ] Screenshots uploaded (6.9"; App Store Connect will tell you if it still
      wants another size — do not trust a doc over the form)
