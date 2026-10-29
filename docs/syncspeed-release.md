# Sync speed release runbook (branch `syncspeed`)

Goal: clock events reach the server in about a second instead of minutes.
The phone writes the event first, then uploads the photo, and the server
runs the face check when the photo arrives.

Order of work: test on TestFlight first, merge to `main` only after the test passes.

All commands are for PowerShell, run from `C:\Users\Epegu\orbitworks`.
Each one prints OK or FAILED.

| Commit | What |
|---|---|
| `f4d4896` | Step 0: sync timing logs + `scripts/measure-sync-timing.mjs` |
| `eb46743` | Step 1: smaller clock photos (camera `pictureSize` 1280x720) |
| `19af378` | `testflight` EAS build/submit profile (channel `testflight`) |
| `ddc50f3` | Step 2: send immediately, per-event lock, 3 employees in parallel, retry backoff |
| `1eb7139` | Step 3: event doc first, photo after; face check on photo arrival; web "Uploading"/"Photo missing" |
| `30005f9`, `b4b0ea3` | Step 4: `lastEventType` only moves forward (effective time = `adjustedTimestamp ?? timestamp`) |

There are no `firestore.rules` or `storage.rules` changes, so nothing to deploy for rules.

---

## 0. Pre-checks (no changes made)

```powershell
cd C:\Users\Epegu\orbitworks
git switch syncspeed; git pull origin syncspeed
if ((git status --porcelain --untracked-files=no) -eq $null) { "Clean tree: OK" } else { "Clean tree: FAILED (commit or stash first)" }
git log --oneline -1    # expect b4b0ea3 or later

# Firebase login + current prod functions (read-only). Save the list for comparison afterwards.
firebase login:list
firebase functions:list --project prod | Tee-Object "$env:TEMP\prod-functions-before.txt"
if ($LASTEXITCODE -eq 0) { "Functions list: OK" } else { "Functions list: FAILED" }

# EAS account + plan + App Store Connect key
cd orbitworks-app
npx eas-cli whoami                     # expect epeguero
cd ..
```

Then check these in a browser or CLI:

- [ ] https://expo.dev/accounts/epeguero/settings/billing shows the paid plan, not Free.
- [ ] `npx eas-cli credentials -p ios` → App Store Connect API Key: the key assigned to `@epeguero/orbitworks` is the new one. If it isn't, assign it there.
- [ ] An iPhone with the **App Store** build (1.1.2) is available, for the old-app check in step 3.
- [ ] Write down the test start time in UTC ISO format, for example `2026-11-01T15:00:00Z`.

---

## 1. Deploy the 2 functions to prod (from `syncspeed`)

This must happen **before** the TestFlight test. A step-3 app paired with old functions gets
no face check on its events.

```powershell
cd C:\Users\Epegu\orbitworks\orbitworks-web
git branch --show-current              # must print: syncspeed
firebase deploy --only "functions:onClockEventCreated,functions:onClockEventPhotoAdded" --project prod
if ($LASTEXITCODE -eq 0) { "Functions deploy: OK" } else { "Functions deploy: FAILED" }

firebase functions:list --project prod | Select-String "onClockEvent"
# expect onClockEventCreated AND onClockEventPhotoAdded (new)
```

**Why this only affects those 2 functions:**

- `--only functions:A,functions:B` updates exactly those two. Every other prod function keeps
  its currently deployed code and config.
- The CLI only offers to delete functions that are missing from local source on a full
  `--only functions` deploy, never on a named one.
- The `predeploy` hook builds `functions/` from the checked-out branch. Only the two named
  functions are uploaded with that build.
- Other functions that import the changed `rekognition.ts` (`reassignClockEvent`,
  `onEmployeePhotoWrite`) keep their old deployed code. Their behavior is identical either way:
  `checkFaceMatch` without `claim` is unchanged.
- Params (`DEVICE_TRACKING_ENABLED`) come from `functions/.env.orbitworks-7ef59`, the same as
  every prod deploy.
- The Rekognition and Mapbox secrets are already in prod Secret Manager.
  `onClockEventPhotoAdded` binds the same two Rekognition secrets `onClockEventCreated` uses.

**Safe for App Store 1.1.2:**

- 1.1.2 writes `photoUrl` when it creates the event, so its face check still runs in
  `onClockEventCreated`. The claim only makes sure the check runs once.
- `onClockEventPhotoAdded` exits immediately unless `photoUrl` goes from absent to set.
  1.1.2 never does that.
- The ordering guard only stops an older event from overwriting a newer status.

### 1a. Check the old app right after deploying

- [ ] On the App Store 1.1.2 phone, clock in Lucas Mitchell on ShipMate.
- [ ] The web Time Tracking face badge shows **Match ~99–100** within about 30s.
- [ ] `firebase functions:log --only onClockEventCreated --project prod` shows no new errors.

If the face check is missing, **roll back now** (section 4) before building.

---

## 2. Build + submit to TestFlight

```powershell
cd C:\Users\Epegu\orbitworks\orbitworks-app
git branch --show-current              # syncspeed
npx eas-cli build --platform ios --profile testflight --auto-submit --non-interactive --no-wait
if ($LASTEXITCODE -eq 0) { "Build queued: OK" } else { "Build queued: FAILED" }
```

Watch the build output for these:

- [ ] "Fetching Apple provisioning profiles" succeeds. A 401 means the API key is still wrong;
  fix it in `eas credentials` and rebuild.
- [ ] Note the **build number** (expect 32) and the **build URL** printed by EAS.
- [ ] After the build, the auto-submit uploads it to App Store Connect. Processing takes about
  10–30 min, then the build appears in TestFlight.
  - This is TestFlight only. Do **not** click "Submit for Review".
- [ ] Never run `eas update`. The `testflight` profile uses its own channel (`testflight`) and
  must not publish to `production`.

**iOS only.** There is **no Android build or release until the Android app has been tested on a
real Android device** (section 5).

---

## 3. Test plan (ShipMate, `qdLsh075T743sGEKyZs7`)

Install the TestFlight build. Log in as a ShipMate supervisor. In the Sync Queue tab, the
project line should read **PROD - orbitworks-7ef59**; this is visible in dev builds only.

After each block, measure:

```powershell
cd C:\Users\Epegu\orbitworks\orbitworks-app
node scripts/measure-sync-timing.mjs qdLsh075T743sGEKyZs7 --since <START-ISO>
```

| # | Test | Passes when |
|---|---|---|
| A | **12 fast clock-ins on a slow link** with the app open. Use weak signal, or iOS Settings → Developer → Network Link Conditioner "3G". Mix several employees. | Clock-in confirmation is still instant. `tapToServerS` median **≤ 3s**, max **≤ 10s**. Exactly **12** events, no duplicates. Every photo lands (`stillPhotoPending` = 0, `photoMissing` = 0). `KB` about **100–150**. |
| B | **Backgrounded**: clock in, then background the app within 1–2 s. Repeat 3 times. Reopen after 1 min. | Events sent before backgrounding are on the server. Anything unsent lands **within seconds of reopening**. Photos finish after reopening. (Sending in the background is step 5, not in this release.) |
| C | **Face check**: Lucas Mitchell and Adrian Morales (your face is their reference), plus 2 other employees. | Lucas and Adrian: **Match ≥ 90** (expect about 99–100). Others: **Mismatch**. No **No face** results. Exactly **one** face check per event, showing about 10s after the photo lands. The web shows "Pending" until then. |
| D | **Airplane mode**: turn it on, clock in/out 4 times across 2 employees, turn it off. | Clock-ins are instant while offline. All 4 events land within **about 10s** of reconnecting, then their photos. Each employee's status is right in the app and on the web (`lastEventType` = their latest action). The Sync Queue empties. Nothing shows Failed or Stuck. |
| E | **Old app** (App Store 1.1.2): 1 clock-in, if not already done in 1a. | Face check still runs (Match). |
| F | **Web** (optional; needs local `npm run dev` on syncspeed, because web isn't deployed yet) | A photo still on its way shows **Uploading**, then **View**. |

If the test fails, run section 4, then fix on `syncspeed`.

---

## 4. Rollback (if the test fails)

This puts both functions back to the `main` code and removes the new trigger. Also stop using
the TestFlight build: with the old functions, its events get no face check.

```powershell
cd C:\Users\Epegu\orbitworks
git switch main; git pull origin main
if ((git branch --show-current) -eq "main") { "On main: OK" } else { "On main: FAILED" }

cd orbitworks-web
firebase deploy --only "functions:onClockEventCreated" --project prod
if ($LASTEXITCODE -eq 0) { "Rollback onClockEventCreated: OK" } else { "Rollback onClockEventCreated: FAILED" }

firebase functions:delete onClockEventPhotoAdded --region us-central1 --project prod --force
if ($LASTEXITCODE -eq 0) { "Delete onClockEventPhotoAdded: OK" } else { "Delete onClockEventPhotoAdded: FAILED" }

firebase functions:list --project prod | Select-String "onClockEvent"   # expect only onClockEventCreated
cd ..; git switch syncspeed
```

Notes:

- **Why a delete:** `main` has no `onClockEventPhotoAdded` in its source, so deploying from
  `main` can't remove it. It has to be deleted.
- **Region:** `us-central1` is the default; no function sets a region. If
  `firebase functions:list` shows a different region for it, use that one.
- **Leftover data is harmless:** `faceCheckClaims/*` docs and `photoPending`/`photoMissing`
  fields on test events are ignored by the old code.
- **Events from the test stay valid:** any TestFlight events whose photo arrived after the
  rollback have no face check. Re-run it for one event with the web "Reassign" flow, or leave it.

---

## 5. After the test passes: merge + release order

1. **Merge** `syncspeed` → `main` through a PR.
2. **Functions:** already live from section 1. Re-deploy the same two from `main` so prod
   matches `main`:
   `firebase deploy --only "functions:onClockEventCreated,functions:onClockEventPhotoAdded" --project prod`
3. **Web:** normal App Hosting rollout from `main`. It only reads the new fields, so it's safe
   at any point after step 2.
4. **Rules:** nothing to deploy.
5. **iOS app:** production build + App Store submission from `main` (profile `production`).
6. **Android app:** **blocked until tested on a real Android device.** Repeat tests A–D on
   Android with a dev or preview build first, then build and submit.

**Order rule:** functions always go before any app build containing step 3.

- Old app + new functions = fine.
- New app + old functions = no face checks.

---

## Decisions already made

- An admin manual entry dated *older* than an employee's latest event no longer changes their
  in/out status (step 4).
- The web shows a photo as "Photo missing" if it is still pending after **6 h**. The phone stops
  auto-retrying a photo after **20** failed attempts; Retry in the Sync Queue still works.
- If a different supervisor logs in on the phone between an event and its photo upload, the
  rules (unchanged) deny the photo merge and the event ends up "Photo missing". Accepted; no
  rules loosening.
- Not in this release: sending in the background (step 5), and an admin alert for missing
  photos (badge only).
