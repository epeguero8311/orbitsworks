# iOS phone tests - the one combined list

The single ordered list of phone and website tests still owed before the
prod release. It started as section 6 of the 2026-11-13 prod-readiness audit
and is kept current here. Last updated **2026-11-14** (prod-readiness fixes:
items 1-11).

**Build:** the next OrbitsWorks Dev build (after build 27) + the dev website
(orbitworks-dev-ew). Build 27 can run everything except the new app-side
items, which are marked **(new build)**.

Before Session 2 I run, on dev: `migrateEmployeePins.js --apply` (copy),
`backfillEmployeeAppConfig.js --apply` and `recheckBadFaceReferences.js`.
They've already been run once, so the reruns should change nothing.

No results are recorded yet. Log failures in `phase10-test-round.md` B.

## Steps that were out of date (fixed in place 2026-11-14)

- **T2** (phase4): Settings shows the 4 digits, not `****` (D1 revised,
  10-PIN1). The Sync tab keeps rows for this week, not 24 h.
- **N5** (phase3b): this week (Monday to today, company time), the same as
  5-N5 / 10-A2. It was "today + 2 days".
- **S2** (phase4): break events now carry the clock-in site (D19 a). Judge it
  by 10-F6.
- **B2** (phase3b): use Employees > Invite someone > role *Employee (app)*.
- Still true from the audit: **T5, T6, T14, N3** are replaced, so skip them.
  For **B1**, use a crew code with Site A, since codes can have "No job site".
- The **TESTING-NEXT-BUILD.md** sections are slotted in below.

## New tests for the prod-readiness fixes (PR-)

| # | Where | Do | Expect |
|---|---|---|---|
| PR-W1 | web | Time > open an event > Adjust time > pick a new time > Save | A yellow confirm panel shows the old and new time and the events before and after. **Back** returns with nothing saved. **Confirm** saves, and the event shows the new time and reason. (item 4) |
| PR-W2 | web | Adjust a clock-in to after that shift's break start (or a break end to before its break start) | Refused with "out of order", naming the neighbouring event. Nothing is saved. A future time (more than 2 min ahead) is refused too. (item 4) |
| PR-W3 | web | Overview > a "Clocked in outside geofence" alert > edit the clock-in time | The same confirm step as PR-W1 before saving. (item 4) |
| PR-W4 | web | Employees table, then open an employee | The PIN column and the Edit window show every PIN, and none show "-". Change a PIN in Edit and save: the table shows the new PIN within a few seconds. (item 7) |
| PR-W5 | web | Send a **supervisor** invite, then Copy invite link | The link has `&invite=`. Open it in a private window and sign up: it lands as that supervisor. (item 9) |
| PR-W6 | web | Send two supervisor invites to the same email (two companies, or revoke-free resend from another admin). Open an **old-style** link (delete the `&invite=…` part) | Refused with "You have more than one invite…". With `&invite=` it works. (item 9) |
| PR-W7 | web | Sign up a brand-new company on the dev site > Settings > App Settings | "Ask for job site each time" is ON. (item 6: saved at sign-up) |
| PR-P1 | phone | Employee App: Settings > PIN | Shows your 4 digits. Type the right PIN for a clock-in, online and in airplane mode: accepted at once. A wrong PIN is refused on the phone. (item 7: getMyPin / getMyPinVerifier now read employeePins) |
| PR-P2 | both | Website: change that employee's PIN. Phone: reopen the app | Settings shows the new PIN. The old PIN is refused, the new one works. (item 7) |
| PR-P3 | phone | Supervisor mode (jc-pro-sup): PIN clock-in for an employee, online then in airplane mode | Both work. The offline PIN table came from getPinSyncTable, which now reads employeePins. (item 7) |
| PR-P4 | phone | Supervisor mode: clock an employee in from a temp clock link (website Crew Access > Temp link) with their PIN | Accepted. A wrong PIN gives "PIN not recognized". (item 7: temp links look PINs up in employeePins) |
| PR-S1 | phone | (I remove `appSettings.askJobSiteEachTime` on jc-test-pro-dev.) Supervisor clock-in standing at Site A, picking Site B | The website shows Site A, marked as corrected (the old re-detect). After you save Settings with the toggle ON, the same punch keeps Site B. (item 6) |
| PR-A1 | phone | A dev company that was NOT in the old TEST_COMPANY_IDS list: a break past its limit | Alert row plus push, like 7-B1. (item 2) |
| PR-J1 | phone | **(new build)** Join with a crew code 3 times from the same Wi-Fi (reinstall between) | All 3 work. The rate limit never shows in normal use. The limit itself is unit-tested. (item 8) |

## iOS: Dev build + dev website

Do each phase's Step 0 first (test-run-phase7/8/9). Keep the geofence OFF
until Session 3.

**Session 1: website only**

1. 8-Q1, 8-Q2
2. 9-E1, 9-E2, 9-E3, 9-E5, 9-R1, 9-C1, 9-C2
3. 10-W1, 10-W2, 10-W3, 10-W4, 10-W5, 10-W6, 10-W8a, 10-W8b
4. PR-W1, PR-W2, PR-W3, PR-W4, PR-W5, PR-W6, PR-W7

**Session 2: phone at the desk**

1. Fresh install and sign-up (reinstall as each test says):
   - TESTING-NEXT-BUILD "Join flow top-bar buttons" (all 8) and "App sign-up Back / Cancel" (4)
   - B1, PR-J1
   - 6-L1, 6-L2, 6-L3, 6-L4
   - 7-N1, 7-N2, 7-N3
   - 10-PIN3
   - TESTING-NEXT-BUILD "Settings PIN row": fresh joiner
2. Email invites: B2, B3, B4, B5, B6, B7, B8, B9, B10, B11, then 5d-1, 5d-2, 5d-3, 5d-4, 5d-5
3. Employee punches and PIN:
   - T2
   - N1, N2, N4
   - TESTING-NEXT-BUILD "Employee PIN check" sections 1-4
   - 10-PIN1, 10-PIN2, 10-PIN4, then the rest of "Settings PIN row" (airplane, website change, log out)
   - PR-P1, PR-P2
   - 10-A1a, 10-A1e
   - T3, T16
   - 6-P1, 6-P2, 6-P3
   - 6-D1, 6-D1b, 6-D3, 6-D4, 6-D5
   - 10-F1, 10-F3, 10-F4
   - 10-FN1, 10-FN2, 10-FN3, 10-FN4, 10-FN6
   - 5-N5 / N5, 10-A2, 10-H3
4. Queue edge cases: T7, T8, T9, T10, T11, T12, T15, T4
5. Alerts and push:
   - 7-N4
   - 7-B1, 7-B2, 7-B3, 7-B4, 7-B5, PR-A1
   - 7-S1, 7-S2, 7-S3, 7-S4
   - 7-M1, 7-M2, 7-M3, 7-M4
   - 7-A1, 7-A2, 7-A3
   - 7-W1
6. Supervisor app (jc-pro-sup):
   - S1, S2 (judge it by 10-F6), S3, S4, S5, S6
   - PR-P3, PR-P4, PR-S1
   - 10-A3a, 10-A3b, 10-A3c, 10-A3d
   - 10-F5, 10-F6
   - 10-FN5
   - CC-1, CC-2, CC-3
7. Geofence consent (turn the Site A geofence ON): 8-P1, 8-P2, 8-P3, 8-P5, 8-P6, 9-E4

**Session 3: walking outside**

1. 6-D2 / 10-F2
2. 8-P4
3. 8-W1, 8-W2, 8-W3, 8-W4, 8-W4b, 8-W5, 8-W6
4. 8-O1, 8-O2, 8-O3 (write down the force-quit result: it's the C3 decision), 8-O4, 8-O5
5. 8-E1, 8-E3
6. 8-C1, 8-C2, 8-C3, 8-C4, 8-C5, 8-C6
7. 9-O1
8. 10-S1 through 10-S10

**Session 4: multi-day and long waits**

1. N6 (auto clock-out 1 h) together with 8-E2
2. T13 (compare against the build 16 timings)
3. 9-O2
4. 10-H1 (Mon + Wed), 10-H2 (Monday morning)
5. 9-W1, 9-W2, 9-W3, 9-W4
6. Can't be tested in the round (unit tests cover them): 90d-1, 90d-2, 90d-3, 4d-1

## Android (after an Android build exists)

You'll need these first: the Firebase Android app, `google-services.json`,
the FCM V1 key and an `employeeDev` Android build. Then run Sessions 2-4
again, minus the iOS-only steps (6-L4's Settings path, 8-P2's iOS
walk-through). Add:

- push token registration
- break reminders under Doze
- re-arming geofences after a reboot and after force-stop (8-O4)
- `/j/` and `/i/` App Links (needs `assetlinks.json`)

## P. Prod smoke test (after the prod deploy, ShipMate only, real app from the production profile)

1. The owner signs in on orbitsworks.com and accepts Terms r6.
2. `https://orbitsworks.com/.well-known/apple-app-site-association` loads and lists `6ZU7MHT284.com.orbitworks.app` for `/j/` and `/i/` (item 1).
3. Crew Access: create a crew code. Employees: send an Employee (app) invite to a + address.
4. Real app: "Join with crew code" shows. Scan, sign up, see your PIN. The email invite link and a `/j/` link open the app (universal link). On a phone without the app, `/j/` shows an App Store link (item 1).
5. Clock in, break, clock out online. Then one offline punch, then sync. The website shows photos, face check and site.
6. The Alerts tab and push arrive for ShipMate AND for a second company (item 2).
7. Supervisor app (live 1.1.4 and the new build) clocks someone in and out with a PIN, online and offline. The website Employees table shows PINs (item 7).
8. A password reset email arrives from the firebaseapp.com sender (item 12 B).
