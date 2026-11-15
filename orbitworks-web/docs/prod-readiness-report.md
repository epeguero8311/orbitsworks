# OrbitsWorks production readiness audit

Audit date: 2026-11-13. Audit only: no code edits, merges, commits, pushes, deploys or EAS builds were made. Commands run against prod (`orbitworks-7ef59`) and dev (`orbitworks-dev-ew`) were read-only (list, describe, GET). The only things written locally were build output (`functions/lib`, `.next`) and this file.

## Verdict: NO-GO

There are 9 blockers. Three of them need fixing even if the release were cancelled tomorrow:

- **B1:** a cross-tenant takeover hole in the rules that are live on prod today.
- **B2:** a prod admin key that is still active.
- **B3:** prod auto-deploys the website from `main`, so pushing the merge first would ship the new site before its backend exists.

The ordered path to GO is in the last section.

---

## 0. What was checked, and where

- **One repo, two worktrees.** `epeguero8311/orbitsworks` holds both `orbitworks-web` and `orbitworks-app`.
  - `C:\Users\Epegu\orbitworks` → `main` @ `2bce77a`
  - `C:\Users\Epegu\orbitworks-employee-app` → `employee-app` @ `e110b9d` (this file is here, next to the other phase docs)
  - Both are clean and match `origin`.
- **The scratch key folder named in the brief doesn't exist.** `C:\Users\Epegu\orbitworks\service-account\` is not there. The key itself is at `C:\Users\Epegu\OneDrive\Desktop\service-account\service-account.json.json` (see item 7c).
- **The brief says "SDK 54 still pinned". It isn't.** The app has been on Expo SDK **57** since 2026-10-09 (`1a6b0be`). A move to 58 was reverted on 10-29 (`8ae12cc`). `orbitworks-app/AGENTS.md` also points at the v57 docs. This is not a problem, just a correction.
- **Prod today equals `main` exactly:**
  - Website: App Hosting `build-2026-11-13-003` = `2bce77a`.
  - Firestore and Storage rules: byte-identical to `main`.
  - Indexes: same 13 as `main`.
  - Functions: 45, last deployed 2026-11-03 02:00Z. No functions source changed on `main` after that.
- **Dev today equals `employee-app` exactly:**
  - Functions: 70 of 70; `joinCompany` was redeployed after `f4234a2`.
  - Rules: identical.
  - Indexes: 16 of 16.
  - TestFlight: OrbitsWorks Dev build **27** = `e110b9d` (HEAD).

---

## 1. Release scope

### Branches

| Branch | Commits not in `employee-app` | Commits not in `main` | Status |
|---|---|---|---|
| employee-app | 0 | **206** | The release |
| admin-section, approvals-bulk-week, email-invite, feat/sentry-app, feat/sentry-web, fix/missing-clock-events, fix/sync-queue-1.0.10, pro-plan, timesheet-approvals, mobile-bottom-nav, chatbox, refactor/time-tracking, Emilios-Branch | 0 | 0 | Fully merged into `main`. Safe to delete. |
| **test/1.0.9-preview-dev** (local only) | 1 (`e28d179`) | 1 | **Do NOT merge.** It adds the dev-pointed store profile (`previewStore`) that was removed on purpose, because it uploaded dev builds to the real app's TestFlight. Delete the branch. |
| stash@{0}, stash@{1} (on pro-plan) | — | — | Unmerged WIP. `stash@{1}` touches `lib/stripe/tiers.ts`, `functions/src/shared.ts` and `useBillingPage.ts`; `stash@{0}` touches `useSiteCosts`/`siteCosts`. Decide whether to keep or drop them. Neither is in the release. |

- `employee-app` is 0 behind `main`, so every `main` hotfix is already in it. That includes the auto clock-out hotfix (`64a7dfb`) and clock comments (`eb5468b` merge).
- Merging into `main` is a **fast-forward** with no conflicts.
- `pro-plan` (local) is "ahead 4" of `origin/pro-plan`, but all 4 commits are already in `main` and `employee-app`.

### What the merge changes in prod

The diff is 496 files, +48k/-4k lines. Backend surface:

- **Functions:** 25 new: `joinCompany`, `getJoinInfo`, `createEmployeeInvite`, `onEmployeeInviteCreated`, `resendEmployeeInvite`, `revokeEmployeeInvite`, `removeEmployeeInvite`, `getInviteInfo`, `acceptEmployeeInvite`, `syncEmployeeAppConfig`, `backfillEmployeeAppConfig`, `syncEmployeeSelfView`, `employeeClockPunch`, `getEmployeeHomeSite`, `getMyPin`, `getMyPinVerifier`, `registerEmployeePushToken`, `clearEmployeePushToken`, `cleanupEmployeeAlerts`, `recordSiteExit`, `getShiftFence`, `cleanupSiteExitLocations`, `getLocationConsent`, `acceptLocationConsent`, `dismissDuplicateFlag`.
  - About 20 existing functions change behaviour (`onClockEventCreated`, `onClockEventPhotoAdded`, `reassignClockEvent`, `checkPeriodicAlerts`, the rekognition and pins code, `employees`, `tempClockLinks`, `invites`, `biometricRetention`, `createEmployee`, `pushSend`).
  - No new secrets: every secret the new functions bind (`RESEND_API_KEY`, `REKOGNITION_*`, `MAPBOX_TOKEN`) is already bound on prod.
- **Firestore rules:** +317 lines. Adds the employee role, `notEmployee()` on existing reads, `employeeSelfViews`, `employeeAlerts`, `siteExits`, `employeePushTokens`, `queueBackups` for employees, and the server-only duplicate-flag fields.
- **Storage rules:** employee self paths (own clock photos and own selfie).
- **Indexes:** 3 new composites and 2 field overrides (see 4b).
- **Website:** Phases 3B–10. Email invites, one invite form, crew codes, the "Left the job site" UI, Reports company filter and job-site exits, Excel sheets, paging, and legal text **r6**.
  - Every prod owner will see the Terms re-accept prompt (`TERMS_VERSION`/`PRIVACY_POLICY_VERSION` 2026-11-04-r6).
- **Behaviour changes for existing prod customers:**
  - "Ask for job site each time" now defaults to **ON**. The server treats a missing value as ON (`functions/src/clockEvents.ts:212-217`; web default `lib/hooks/useCompanySettings.ts:121`). Pro companies that never saved this setting lose supervisor-app site auto-detection. On prod that is 1 company (`pro_tier1`, setting unset). ShipMate has it explicitly `false`.
  - Supervisor breaks and override clock-outs now copy the shift's clock-in site (D19 a).
  - The clock-out is now its own site detection.
  - maxHours counts from clock-in, so overnight shifts now fire.
  - The no-face vs mismatch split (`faceNoFaceAlert`/`faceMismatchAlert` sub-toggles, default on).
- **App:** v1.1.5 adds background location ("Always"), `expo-task-manager`, the `expo-notifications` plugin and the Employee login.
  - This needs App Review notes and a Play background-location declaration (already listed in `phase10-test-round.md` C3).

---

## BLOCKERS (can't go live)

### B1. Cross-tenant admin takeover through `invites` updates (live on prod now)

- **The rule.** `orbitworks-web/firestore.rules:921-925` (deployed prod ruleset `0f2dc843…` lines 634-638, identical). The `invites` update rule checks only the **existing** doc's `companyId` and blocks only the 4 email fields. `companyId`, `role`, `email` and `linkExistingEmployeeId` can all be changed.
- **The function.** `acceptInvite` (`functions/src/company.ts:144-232`) finds the pending invite by email and trusts `invite.companyId`. It writes `users/{uid}` and the custom claims `{role, companyId}` from it (lines 202, 229-230).
- **The attack:**
  1. Anyone signs up, which makes them owner of their own new company.
  2. They create an invite for a second email of theirs.
  3. They update that invite's `companyId` to a victim company.
  4. They accept it and get `admin` claims in the victim company: employees, PINs, timesheets and photos.
  - This needs the victim's companyId, which is a 20-char auto ID. Company IDs are not treated as secrets anywhere in the app.
- **Fix:** no client code updates `invites` (checked: only `addDoc` / `deleteDoc` in `useStaffInviteSend.ts`, `useEmployeeModal.ts` and `useInvites.ts`).
  - Change the rule to `allow update: if false;`.
  - Also have `acceptInvite` refuse an invite whose `companyId` doesn't match a server-stamped value (for example, record `invitedByUid` and check that user's company), as defence in depth.
  - Add a rules test.
  - **Hotfix this on `main` and deploy the rules now**, independent of the release.

### B2. Scratch prod admin key is still active

- **Where.** `C:\Users\Epegu\OneDrive\Desktop\service-account\service-account.json.json` is `firebase-adminsdk-fbsvc@orbitworks-7ef59`, `private_key_id ddeb95a37d…`.
- **Evidence:**

  ```
  gcloud iam service-accounts keys list --iam-account=firebase-adminsdk-fbsvc@orbitworks-7ef59.iam.gserviceaccount.com --managed-by=user
  → ae11711f6f… (2026-08-10), 5b91be230f… (2026-08-11), ddeb95a37d… (2026-08-30): all active, no expiry
  ```

- **Why it matters.** It's a full Admin SDK key to prod in a **OneDrive-synced** folder, so it is also in the cloud. Copies of all 3 prod keys (plus dev and `orbitworks-sales`) are in `C:\Users\Epegu\Downloads\`, and another `orbitworks-sales` key is in `OneDrive\Desktop\keys\`.
- **Fix:**
  1. Find which key the website's `FIREBASE_ADMIN_PRIVATE_KEY` secret uses. Policy Analyzer is disabled on prod, so check "key last used" in the Console (IAM > Service accounts > Keys), or compare the secret's key with each JSON yourself.
  2. Delete every other prod key: certainly `ddeb95a37d…`.
  3. Delete the local JSON files from Downloads, the OneDrive Desktop and OneDrive's recycle bin.
  4. Consider rotating the one that stays, since its file has been sitting in Downloads.

### B3. Pushing to `main` deploys the prod website immediately

- **Evidence.** The prod App Hosting backend `orbitsworks-backend` has `rolloutPolicy.codebaseBranch: "main"`. The current build `build-2026-11-13-003` was auto-built from `2bce77a`.
- **Why it matters.** If the merge is pushed before the backend is deployed, the new site calls callables that don't exist on prod (`createEmployeeInvite`, `dismissDuplicateFlag`, …), runs queries without indexes, and shows r6 terms against old rules.
- **Fix.** Deploy in this order: indexes (wait until built) → rules → functions → push `main`, which rolls out the site. Or turn auto-rollout off for the release and roll out by hand.

### B4. The real app (production profile) can't sign up any employee

- **Evidence:**
  - `orbitworks-app/config/envRules.js:28` gives prod `joinLinks: null`.
  - So `components/JoinCodeButton.js:7` hides "Join with crew code".
  - The resolved production config (`EAS_BUILD=true EXPO_PUBLIC_FIREBASE_ENV=prod expo config`) has no `scheme`, no `associatedDomains` and no intent filters.
  - Prod `apphosting.yaml` has no `APP_LINKS_IOS_APP_IDS`, `APP_LINKS_ANDROID_*` or `JOIN_APP_*`.
  - Live: `https://orbitsworks.com/.well-known/apple-app-site-association` → **404**, and `assetlinks.json` → **404**.
  - Invite emails on prod link to `https://orbitsworks.com/i/{token}` (`functions/src/lib/appUrls.ts:27`), which won't open the app and shows no "Open in the app" button.
  - The sign-up consent links (`screens/join/JoinAccountStep.js:20-25`) and the Always-location privacy link (`AlwaysLocationScreen.js:44`) do nothing without `joinLinks.appUrl`.
- **Why it matters.** This is the feature being released. It is already logged as "MUST ship" in `dev-functions-pending.md`.
- **Fix:**
  1. Add prod `joinLinks: { appUrl: "https://orbitsworks.com", scheme: "orbitsworks" }` to `VARIANTS.prod`.
  2. Add a prod branch in `app.config.js` for `associatedDomains` (`applinks:orbitsworks.com`, plus www if used) and Android intent filters.
  3. Add `APP_LINKS_IOS_APP_IDS=6ZU7MHT284.com.orbitworks.app`, `APP_LINKS_ANDROID_PACKAGE`, `APP_LINKS_ANDROID_SHA256` (Play signing cert) and `JOIN_APP_SCHEME/NAME/INSTALL_FROM` to `apphosting.yaml`.
  4. Fix the `/j` "Open in the app" dead-end when the app isn't installed (also listed).
  5. Extend `test/envRules.test.js` to cover them.

### B5. Prod functions params file only exists in the `main` worktree

- **Evidence.**
  - `functions/.env.orbitworks-7ef59` is gitignored. It exists only at `C:\Users\Epegu\orbitworks\orbitworks-web\functions\` with `DEVICE_TRACKING_ENABLED=true`, `ALERTS_FEED_ENABLED=true`, `PUSH_NOTIFICATIONS_ENABLED=true`, `TEST_COMPANY_IDS=qdLsh075T743sGEKyZs7` and `AUTO_CLOCK_OUT_ENABLED=true`.
  - The `employee-app` worktree has no such file.
  - The defaults in `functions/src/flags.ts` are `false` for alerts and push, and `clockEvents.ts:29` defaults device tracking to `false`.
- **Why it matters.** Deploying prod functions from any other checkout silently turns off alerts, push and device tracking for every customer.
- **Fix.** Deploy prod only from `C:\Users\Epegu\orbitworks` after the fast-forward, and check the file is there before running the command. Better: add a predeploy check that fails if `.env.<project>` is missing.

### B6. `TEST_COMPANY_IDS` = ShipMate still gates every alert and push on prod

- **Evidence.**
  - The prod params file contains `TEST_COMPANY_IDS=qdLsh075T743sGEKyZs7`.
  - `isCompanyInTestScope` is called 11 times in `functions/src/alerts.ts`, including the periodic sweep that makes the Employee App's shift-ending, still-clocked-in, max-hours and overtime alerts.
  - Auto clock-out is not gated (fixed 11-02).
- **Why it matters.** Paying customers get no alerts or pushes at all, and Employee App employees get none of the Phase 7 notifications.
- **Fix (your decision).** Clear the value; every alert type defaults ON (`ALERT_SETTINGS_DEFAULTS`), so all 7 prod companies start getting alerts at once. Or gate only the supervisor feed. Tell customers either way.

### B7. Missing prod indexes for the new queries

- **Evidence.** `firebase firestore:indexes --project orbitworks-7ef59` against `firestore.indexes.json` on `employee-app` (normalised for `__name__`):
  - Prod is missing `employeeInvites(companyId ↑, createdAt ↑)`, `employeeAlerts(employeeId ↑, createdAt ↓)` and `siteExits(hasLocation ↑, createdAt ↑)`.
  - Prod is also missing the field overrides `employeePushTokens.token` and `pushTokens.token` (collection-group).
  - The other 13 match.
- **Why it matters.** The Employees invite list, the app's Alerts tab, the 90-day exit cleanup and `registerEmployeePushToken` fail with FAILED_PRECONDITION until these are built.
- **Fix.** Run `firebase deploy --only firestore:indexes --project prod` first, and wait until every index shows READY. Don't use `--force`.

### B8. `correctClockEvent` has no chronological check and no confirm step (open item 1, not done)

- **Evidence.**
  - Server (`functions/src/clockEvents.ts:849-919`): no zod, no check against the neighbouring events, no future bound, no reason length cap. Any finite epoch ms is accepted.
  - Web: `lib/hooks/useClockEventDetail.ts:72-97` and `lib/hooks/useAlertActions.ts:257-265` save straight away, with no "confirm before save" step.
- **Why it matters.** An admin can move a clock-in after its clock-out, or into the future. That breaks pairing, reports, Excel and approvals for that employee. It is on your list as an open item.
- **Fix.**
  - Server: a zod schema (`eventId`, `newTimestamp` within ±N days of the original and ≤ now + 2 min, reason ≤ 500). Load the employee's previous and next events and refuse if the new time would cross either.
  - Web: a confirm dialog that shows old → new and the neighbouring events, and the same client-side check.

### B9. Release-critical data and deploy steps that nobody has run or built

- **`employeeAppConfig` doesn't exist on prod for any company.** `syncEmployeeAppConfig` only runs on a company write, and nothing calls `backfillEmployeeAppConfig` (no UI, no script).
  - The app falls back to defaults (`orbitworks-app/lib/hooks/useEmployeeAppConfig.js`: `isPro` false, no name or timezone).
  - Pro employees therefore get Core behaviour in the app, including no leave tracking, until an admin saves Settings.
  - Fix: call `backfillEmployeeAppConfig` for each of the 7 prod companies right after the functions deploy, or write a one-off script.
- **Selfie recheck for wrongly-flagged "no usable face" isn't built** (`dev-functions-pending.md` "Release to-do"). It affects at most the 2 prod Pro companies (ShipMate and the `pro_tier1` company). Build it, or run the query by hand after deploy.

---

## SHOULD FIX (before launch if possible)

### 2. Environments and config

| # | Finding | Evidence | Fix |
|---|---|---|---|
| E1 | Firebase password-reset custom domain is still half-set (open item 2) | Identity Toolkit config for prod: `dnsInfo.customDomain: "orbitsworks.com", useCustomDomain: true, customDomainState: "NOT_STARTED"`. Dev has none. `callbackUri` is still the default `…firebaseapp.com/__/auth/action`. | Either finish domain verification (add the DNS records Firebase shows and wait for VERIFIED), or set `useCustomDomain: false`. Then send yourself a real reset from prod and check it arrives and works. As it stands, reset emails may be sent from an unverified domain and land in spam or not at all. |
| E2 | `production` EAS profile relies on the implicit EAS environment | `orbitworks-app/eas.json:31-34` has no `"environment"`. EAS env `production` is correct (`EXPO_PUBLIC_FIREBASE_ENV=prod`, `EXPO_PUBLIC_BUILD_PROFILE=production`), and the build guard fails closed if it doesn't load (checked: "ENVIRONMENT GUARD FAILED … must use orbitworks-7ef59"). | Add `"environment": "production"` explicitly. |
| E3 | Old profiles `development`/`dev`/`preview` still build the real bundle ID against dev | `eas.json:7-30`. The guard **fails** them on EAS, so they can't reach prod, but they're dead weight. | Move them to `APP_VARIANT=dev`, or delete them (already in C3). |
| E4 | OTA updates never reach the dev app (C2) | `phase10-test-round.md` C2; not investigated further here. | Find out before relying on OTA for prod hotfixes. Until then, every fix needs a store build. |
| E5 | `.firebaserc` default = dev, and the gcloud default project = **prod** | `gcloud config list` → `project = orbitworks-7ef59` | Pass `--project` explicitly on every gcloud command, or set the gcloud default to dev. |
| E6 | Local `next build` fails in the `employee-app` worktree | `.env.local` has no `NEXT_PUBLIC_FIREBASE_*`; they're only in `.env.development.local`, which `next build` doesn't load → prerender error on `/_not-found`. It builds fine with prod public env (see 5). | Local only: add the dev public Firebase vars to `.env.local`. |

**Dev vs prod isolation (your hard rule): PASSES.**

- Build time: `config/envRules.js` + `app.config.js`. A dev-variant build with prod Firebase throws (tested). `employeeDev` → `com.orbitworks.app.dev`, channel `employee-dev`, ascAppId `6826363680`, `EXPO_PUBLIC_FIREBASE_ENV=dev`.
- Launch time: `lib/envGuard.js` + `lib/firebase.js:72-124`. The dev app on a prod project, or on the production channel, refuses to start Firebase. A release bundle with no build profile throws.
- Website: `scripts/check-apphosting-dev.mjs` guards the dev deploy. The prod backend has no environment name, so it uses `apphosting.yaml` with prod values only.
- Functions: `appUrls.ts` maps a project to its own site, and an unknown project sends no link.
- Bundle IDs: `com.orbitworks.app` "OrbitsWorks" (ASC 6801155800) and `com.orbitworks.app.dev` "OrbitsWorks Dev" (ASC 6826363680).

**Stripe:**

- Price IDs: prod and dev use different sets (`apphosting.yaml:35-109` vs `apphosting.orbitworks_dev.yaml`).
- Legacy Core `tier1-5` are kept with `hidden: true` and `totalCap: null` (`lib/stripe/tiers.ts:39-105`). Functions treat `tier1-5` as Core (`functions/src/lib/signupShared.ts:54-56`).
- **Prod has 2 paying legacy `tier2` companies, not 1** (`5e5FoW…`, `niLpwN…`), plus ShipMate on `pro_tier2`. Both legacy companies stay uncapped on total and can use email invites. Crew codes are Pro-only by design (`joinCompany.ts:112`).
- Secrets come from Secret Manager (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). The webhook verifies its signature (`app/api/stripe/webhook/route.ts:150-163`). API version is pinned to `2024-06-20` (`lib/stripe/server.ts:24`).
- **Not verifiable read-only without secret values:** whether the prod secret is `sk_live` and whether the live webhook endpoint's API version is pre-2025 (the code reads `invoice.subscription`, which was removed in newer versions). **Check both in the Stripe dashboard.**

**Other config checks:**

- `APPROVALS_CUTOVER_DATE` = `"2026-09-06"` (`lib/reportUtils.ts:10`). It is the same on `main` and `employee-app` and has been live since September. Keep it; changing it would change historic reports.
- Leftover test items:
  - No ShipMate, `jc-test` or hardcoded company or user IDs in code.
  - The only test scoping is `TEST_COMPANY_IDS` (B6).
  - Still open: the 4 `TODO(Phase 10): RATE LIMIT` markers (S2 below), `components/dashboard/employees/EmployeesTable.tsx:48` (TODO per-tier cap) and `lib/stripe/server.ts:22` (Stripe API migration).
  - Logging: no PINs, passwords or tokens are logged. `functions/src/alerts.ts:287` logs a malformed alert `input` (may contain names). `orbitworks-app/lib/firebase.js:113` logs env and project on every boot, which is intentional and not sensitive.

### 3. Cloud Functions

| # | Finding | Evidence | Fix |
|---|---|---|---|
| F1 | Code 70 / dev 70 / prod 45 | `firebase functions:list` on both. Nothing extra on either side. Every prod function is on dev with the same trigger and region (us-central1, nodejs22). | — (the 25 new ones ship with the deploy) |
| F2 | Auth and tenant scoping: OK | Every callable goes through a guard (`requireAdmin`, `requireCreatorAuth`, `linkedEmployee`, `employeeClaims`, or inline `request.auth`), and `companyId` always comes from claims. The 6 public ones (`joinCompany`, `getJoinInfo`, `acceptEmployeeInvite`, `getInviteInfo`, `getTempClockLinkInfo`, `redeemTempClockLink`) are keyed by 32-byte random tokens. | — |
| F3 | Input validation is inconsistent | The new employee-app callables use zod. About 30 older callables (`correctClockEvent`, `addManualTimestamp`, `setApprovalStatus*`, `setEmployeePin`, …) use hand-written `typeof` checks. | Move these to zod as they're touched. `correctClockEvent` first (B8). |
| F4 | Idempotency on retries: OK where it matters | Face checks are claimed through `faceCheckClaims/{eventId}`. Auto clock-out uses deterministic `auto-<id>` doc IDs. Punches use `localId` and replay rules. Joins and invites run in transactions. Stripe webhook handlers are state syncs, but `autoRevertToFree` uses a random `shuffle` when deactivating, so a retry may pick different employees. | Make the downgrade choice deterministic, or record the event ID. |
| F5 | No Sentry in Cloud Functions | Nothing imports Sentry under `functions/` (one comment mention). Errors only reach Cloud Logging. The app (`@sentry/react-native`) and website have Sentry. | Add an Error Reporting alert policy at minimum, or `@sentry/node` in functions. |
| F6 | Prod `maxInstances: 20` left over on 45 functions, none on dev | `functions:list` on prod | Decide on one cap in code (`setGlobalOptions`). Otherwise new functions deploy with no cap. |
| F7 | `npm run build` in functions: **clean** (tsc exit 0) | — | — |
| F8 | Functions tests: 594/594 pass (local emulators, `demo-` project) | `firebase emulators:exec … "cd functions && npm test"` | — |

### 4. Security

| # | Finding | Evidence | Fix |
|---|---|---|---|
| S1 | The plain-text PIN is still on the employee doc, readable by every admin, owner **and supervisor** | `firestore.rules:426-429` (read = any non-employee in the company). `phase10-test-round.md` C2 says "must fix before prod (D2 a)". **Not done**: no `employeePins` anywhere. | Move it to a server-only `companies/{c}/employeePins/{id}` doc and read it through functions, as planned. |
| S2 | No rate limit or App Check on the 4 public sign-up callables | `joinCompany.ts:1`, `getJoinInfo.ts:1`, `acceptEmployeeInvite.ts:1`, `getInviteInfo.ts:1` (TODO). No `enforceAppCheck` anywhere. | Tokens can't be guessed, but anyone who photographs a posted crew-code QR can script sign-ups (Auth users plus employee docs) until the seat cap is full. Add a per-IP/per-token limit (Firestore counter like `inviteRateLimit.ts`) and App Check. |
| S3 | An admin client can **create** an employee doc with any `pin` | `firestore.rules:446` (`pin` is not in the create denylist; it is on update, line 466). No client creates employee docs directly (`employeeQueue.js:58` only generates an ID; the web uses the `addEmployee` callable). | Add `'pin'` to the create denylist. |
| S4 | Storage: every supervisor can overwrite or delete any company file, including `employees/*/reference.jpg` (the face reference) | `storage.rules:23-27` (pre-existing on prod). There is also no size or type limit for non-employees. | Limit reference/selfie writes to admin/owner (or server only), and keep supervisor writes to `clockEvents/` with `isImageUnder10Mb()`. |
| S5 | An employee can overwrite their own clock photo after the face check | `storage.rules:33` (`create, update`) | Allow `create` only (or check the object doesn't exist). |
| S6 | `shiftNotes` write rule lets any supervisor, active or not, edit or delete any note | `firestore.rules:785-787` (pre-existing) | Add `isActiveEmployee` and limit edits to the note's own author. |

**What passes:**

- Default-deny catch-all (`firestore.rules:928`, `storage.rules:46`). Every collection has a match block.
- Tenant check from `request.auth.token.companyId` everywhere. Roles only from claims; `users/*` can't be client-written.
- Employees go through `isSelfEmployee` + `isLinkedSelf`. PIN, lock, history, consents, push tokens, join codes and siteExits writes are all server-only.
- `.get(field, default)` is used on fields that may be missing.
- Server-only rule: no `firebase-admin`, AWS, Stripe secret or non-public env var in any `"use client"` file, `components/` or `lib/hooks/` (196 files scanned). No `NEXT_PUBLIC_` name for a secret. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is publishable by design.
- **Rekognition:** server-only (triggers plus admin callables), Pro-gated, and it uses only `CompareFaces`/`DetectFaces`. No collection or `IndexFaces`, so **nothing biometric is stored at AWS**, not even a FaceId.
  - Each event is checked once (`faceCheckClaims`). Consent is recorded in server-only `employeeConsents`.
  - Deletion exists: `deleteEmployee` plus 3 retention sweeps.
  - There is no separate audit log of Rekognition calls (results go on the event as `faceCheck`). Consider adding one if your biometric notice promises it.
- **PIN end to end:**
  - Employee punches are checked on the server with a timing-safe compare; 3 wrong → 60 s lock kept in `employeePinLocks` in a transaction (`employeeClock.ts:146-334`).
  - The supervisor `verifyPin` checks the role and has a per-uid attempt window (`pins.ts:250-290`).
  - The phone stores a salted SHA-256 verifier, **and since D1-revised the PIN itself** in SecureStore. This is an accepted risk (C4).
  - `AddEmployeeForm` does not make PINs client-side; it calls `addEmployee` (`AddEmployeeForm.tsx:72`). The offline supervisor app proposes one, and `createEmployee` reserves it with a uniqueness and junk check, or swaps it (`createEmployee.ts:57-72`).
- **Committed secrets:** none. All 547 commits on all refs were scanned for private keys, `sk_live`/`rk_live`/`whsec`/`AKIA`/`sk-ant`/Resend/Sentry tokens and key/credential filenames. The scan was proven to work with a positive control. The 4 hits are false positives (guard marker lists and an `.env.example` comment). The only tracked env file is `functions/.env.orbitworks-dev-ew`, which holds flags only. `test/dev-e2e/creds.json` is gitignored.

### 5. Builds and code health

| Check | Result |
|---|---|
| Web `tsc --noEmit` | **Clean** (exit 0) |
| Web `npm run build` (prod public Firebase env, as App Hosting injects it) | **Passes**: 53 pages, 0 warnings |
| Web `eslint` | **Fails**: 84 errors, 18 warnings. 33 `no-unescaped-entities`, 31 `no-explicit-any` (mostly `app/api/stripe/*`), 10 `no-require-imports` (`scripts/*.js`), 8 react-hooks. Next 16 doesn't lint during build, so this doesn't block deploy. |
| Functions `npm run build` | **Clean** |
| App `npm test` | **304/304 pass** |
| App `eslint` | **Fails**: 34 errors, 21 warnings (react-hooks refs/set-state-in-effect in the files already listed in the C2 lint pass, plus `scripts/generate-icons.mjs` can't resolve `sharp`). EAS doesn't lint. |
| App `check:imports` | OK (233 files) |
| expo-doctor | 20/21 pass. 11 packages one patch behind SDK 57 (`expo` 57.0.27→57.0.33, `expo-updates`, `expo-notifications`, `expo-location`, …). Run `npx expo install --check` before the production build. |
| Resolved production config | `OrbitsWorks`, `com.orbitworks.app`, v1.1.5, runtimeVersion `appVersion`, prod Firebase. But no scheme or links (B4). |
| Branding | OK. Icons replaced in `8355aa3` (web `favicon.ico`, `apple-icon.png`, `icon.svg`, OG image, PWA icons; app `icon.png`, `splash-icon.png`, adaptive foreground and monochrome). The Android adaptive background is brand blue `#3b6fe0` (`app.config.js:72`). I looked at the images: none is a default React, Next or Expo icon. |
| Android | **Not ready.** No Android `employeeDev` build has ever been made, and there is no `google-services.json` or FCM V1 key, so `getExpoPushTokenAsync` fails on Android. No `assetlinks.json` on either site. An Android launch is blocked until C3's Android items are done. iOS can go first. |

---

## LATER

- Web lint 84 and app lint 34 errors (the Phase 10 lint pass).
- Supervisor/admin invite seat check is not atomic (`acceptInvite`).
- Email-invite duplicate check has no lock.
- `missedClockOut` fires at midnight for overnight shifts. It's listed as "must fix" in C2; I'd keep it there if overnight crews are expected.
- Website day edges use the browser timezone, not the company's (H10 b). Same note as above: listed as must-fix in C2.
- W7 uncapped website fetches (`useEmployeeInvites`, `useInvites`, `listJoinCodes`, …).
- Stripe API migration off `2024-06-20`.
- `phoneClockOff` only catches a clock set back; the PIN lock resets on reinstall; the stored PIN check value can be cracked off the phone (C4, accepted).
- Remove the leftover `ios.buildNumber` from `app.json`.
- Temp-link API tests. Note: `tempClockLinks.test.js` now exists, so this item is partly done.
- The supervisor app on prod today (1.1.4, TestFlight profile build 36) will run against the new backend. It can't be tested on dev because that binary points at prod. The S1–S6 and 10-A3/10-F5/F6/CC tests on build 27 are the closest stand-in.

---

## 6. Phone tests still owed

Moved 2026-11-14 to the tracked **docs/ios-test-list.md** (the one combined list, kept current there, with the PR- tests for the prod-readiness fixes and the updated T2, N5, S2 and B2).

---

## 7. Known open items: status

| Item | Status | Evidence |
|---|---|---|
| a. `correctClockEvent` confirm-before-save + chronological validation | **NOT DONE** (B8) | `functions/src/clockEvents.ts:849-919`; `lib/hooks/useClockEventDetail.ts:72-97`; `lib/hooks/useAlertActions.ts:257-265` |
| b. Password-reset custom domain | **Still half-set** (E1) | prod `dnsInfo {customDomain: "orbitsworks.com", useCustomDomain: true, customDomainState: "NOT_STARTED"}` |
| c. Scratch `service-account.json` | **Not deleted, key NOT revoked** (B2) | The file is at `OneDrive\Desktop\service-account\service-account.json.json` (not `orbitworks\service-account\`). Key `ddeb95a37d…` is still active on prod, alongside `ae11711f6f…` and `5b91be230f…`. |

---

## Ordered steps to GO

**1. Hotfix now on `main`, independent of the release.**

1. B1: set the `invites` update rule to `allow update: if false;` and add a rules test.
2. Deploy rules to dev, check, then to prod. Remember that pushing `main` also redeploys the prod site (same code, so harmless).
3. B2: find the live key, delete the others, and delete every local copy.

**2. Fixes on `employee-app`.**

1. B4: prod `joinLinks`, associated domains and intent filters, prod `apphosting.yaml` app-link vars, the `/j` fallback, and tests.
2. B8: `correctClockEvent` zod + chronological check + confirm dialog.
3. B9: backfill plan for `employeeAppConfig`; build the selfie recheck.
4. S1: move the PIN to a server-only doc (D2 a).
5. S2: rate limit + App Check on the 4 public callables.
6. S3–S5: rules hardening.
7. E1: finish or turn off the custom domain.
8. E2: explicit production environment in `eas.json`.
9. `npx expo install --check`.
10. Decide B6 (`TEST_COMPANY_IDS`) and the "Ask for job site" default (§1) for the prod `pro_tier1` company.
11. Check `sk_live` and the webhook API version in Stripe.

**3. Builds.**

1. Deploy the fixes to dev (functions, rules, indexes, dev site via `scripts\dev-site-deploy.ps1`).
2. Make an `employeeDev` iOS build.
3. Once Android setup is done, make an `employeeDev` Android build.
4. Re-run `cd functions && npm run build`, the functions tests, web `tsc` and build, and app `npm test` until clean.

**4. Phone tests.** Run the full iOS list (§6) on the new dev build. Log failures in `phase10-test-round.md` B and fix them. Then Android.

**5. Production deploy, in this order** (from `C:\Users\Epegu\orbitworks`, `--project orbitworks-7ef59`, after confirming `functions/.env.orbitworks-7ef59` is present and set to the B6 decision):

1. Fast-forward local `main` to `employee-app`. **Don't push yet** (B3).
2. `firebase deploy --only firestore:indexes`, then wait until all indexes are READY.
3. `firebase deploy --only firestore:rules,storage`.
4. `firebase deploy --only functions` (set `FUNCTIONS_DISCOVERY_TIMEOUT=60`). Say **no** to deleting anything.
5. Call `backfillEmployeeAppConfig` for each prod company; run the selfie recheck (counts only).
6. `git push origin main`. App Hosting auto-builds the site; watch the rollout reach 100 %.
7. Re-auth Apple in EAS, then make a `production` EAS build (iOS; Android once it's ready). Submit with App Review notes for "Always" location and a demo login.

**6. Prod smoke test (§6 P).** Then release the app in App Store Connect. Tell customers about the Terms r6 re-accept and the new alerts.

**7. Cleanup.** Delete the merged branches and `test/1.0.9-preview-dev`, and resolve the 2 pro-plan stashes.

---

## Test runs referenced

- Web: `tsc` clean; build passes with prod public env; eslint 84 errors.
- App: 304/304 tests; eslint 34 errors; expo-doctor 20/21.
- Functions: `npm run build` clean. `npm test` under local emulators (`demo-` project): **594/594 pass**, 0 fail. No current test covers B1 (the invites update hole).
