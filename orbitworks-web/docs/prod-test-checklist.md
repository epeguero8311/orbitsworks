# Prod test checklist

The short version of `ios-test-list.md`. Setup, steps and exact pass
criteria are there; this file is for ticking off.

- **Tests:** 200 by hand. 186 on dev (Sessions 0-10), 9 on prod (P) and 5 on Android (AN).
  - **MUST PASS BEFORE PROD:** 178.
  - **CAN WAIT:** 22 (the prod smoke test, Android, and optional or after-launch checks).
  - X10-X14 aren't on this list: they're covered by unit tests and can't be done by hand.
- **Time:** about 17 h hands-on for Sessions 0-9, plus 15 min a day for a week (Session 10). Then 45 min for P after the prod deploy.
- **App and site:** OrbitsWorks Dev, build 29, plus the hosted dev site (`orbitworks-dev-ew`).
- **What you need ready:**
  - **Emails:** these Gmail aliases of your address (`you+…@gmail.com`), all landing in your normal inbox: owner (already exists), owner2, admin, sup, sup2, emp1, emp2, emp3, emp4, emp8, emp9, wrong, dup, del1, del2, del3, core1.
  - **A second face:** a friend, or a printed photo, for the mismatch tests (D1, N3, N5, R4). Also a photo with 2 faces, or none, for D4.
  - **Site A:** your desk address.
  - **Site B:** a second real address 0.5-2 km away that you can walk or drive to (Sessions 1, 3, 7).
  - **Stripe test cards:** 4242 4242 4242 4242, 5555 5555 5555 4444, 4000 0000 0000 0002, 4000 0000 0000 0341.
  - **Optional:** a dev promo code (A7); a second iPhone for the supervisor login; Network Link Conditioner turned on in Developer settings (H13, H17).

**MUST** = must pass before prod. **WAIT** = can wait until after launch.

## Session 0. Start (10 min)

- [ ] A1 - Owner sets password; Billing shows Pro tier 1 - web - **MUST**
- [ ] A2 - Legal pages: r7, spelling, photo and delete wording - web - **MUST**

## Session 1. Account, billing, settings, sites, employees (1 h 45)

- [ ] A3 - Website sign-up: Terms box, Free plan, defaults set - web - **MUST**
- [ ] A4 - Free plan: 8-employee cap, app invites and crew codes locked - web - **MUST**
- [ ] A5 - Upgrade to Core: declined card, then webhook-synced plan - web - **MUST**
- [ ] A6 - Update the payment method to the Mastercard - web - **MUST**
- [ ] A7 - Promo code applies a discount - web - WAIT (optional, needs a dev code)
- [ ] B1 - General settings: logo, business hours saved after reload - web - **MUST**
- [ ] B2 - Export rounding settings are kept - web - **MUST**
- [ ] B3 - Automations: auto break, minimum shift, auto clock-out kept - web - **MUST**
- [ ] B4 - Alert switch defaults; face sub-switches grey out - web - **MUST**
- [ ] B5 - Mobile App tab switches; empty Devices card - web - **MUST**
- [ ] B6 - Settings search jumps to the right field - web - WAIT (convenience)
- [ ] C1 - Add Site A; geofence help text says it flags only - web - **MUST**
- [ ] C2 - Add Site B with a map pin - web - **MUST**
- [ ] C3 - Site with no address: geofence locked - web - **MUST**
- [ ] C4 - 12 sites: list shows 10 + "Show 2 more" - web - WAIT (list paging)
- [ ] C5 - Titles & Pay: add, edit with effective date, deactivate, delete - web - **MUST**
- [ ] C6 - Core company sites; no geofence on Core - web - **MUST**
- [ ] D1 - Add employee: 4-digit PIN, photo, same PIN in Edit - web - **MUST**
- [ ] D2 - Employee with no photo gets the "No face check" tag - web - **MUST**
- [ ] D3 - Change a PIN; a duplicate PIN is refused - web - **MUST**
- [ ] D4 - Bad photo: "Photo needs update" + Bad Reference alert - web - **MUST**
- [ ] D6 - Subcontractor employee; company filter shows only them - web - **MUST**
- [ ] D7 - Deactivate/reactivate frees a seat; search filters - web - **MUST**

## Session 2. Invites, crew codes, sign-ups (2 h 15)

- [ ] E1 - One invite form; 3 invites sent and emailed - web - **MUST**
- [ ] E2 - A duplicate pending invite is refused - web - **MUST**
- [ ] E3 - Admin sign-up from the invite; can't change billing - web - **MUST**
- [ ] E4 - Copied invite link signs up a supervisor - web - **MUST**
- [ ] E5 - Two companies invite the same email; `&invite=` picks the right one - web - **MUST**
- [ ] E6 - Copy link and Resend: same link, 7-day expiry, 60 s lock - web - **MUST**
- [ ] E7 - Revoked invite: the phone says no longer active - both - **MUST**
- [ ] E8 - Crew code: sites, radius, QR, link, Info, list - web - **MUST**
- [ ] E9 - 3 crew-code sign-ups, buttons, consent, location, PIN - phone - **MUST**
- [ ] E10 - Wrong-email invite refused; the correct one joins - phone - **MUST**
- [ ] E11 - Used, revoked and edited links leak nothing - phone - **MUST**
- [ ] E12 - Name validation on invite sign-up - phone - **MUST**
- [ ] E13 - Invite an existing employee: keeps their PIN, one row - both - **MUST**
- [ ] E14 - Subcontractor joins; Settings shows the parent company - both - **MUST**
- [ ] E15 - Possible-duplicate flag on sign-up, dismissable - both - **MUST**
- [ ] E16 - /j/ and /i/ universal links; offline and revoked screens - phone - **MUST**
- [ ] E17 - Core invite sign-up; location denied then fixed - both - **MUST**
- [ ] E18 - The 15-seat cap blocks employees and invites - web - **MUST**
- [ ] E19 - Temp links: active count, "Load older links" paging - web - WAIT (history paging)

## Session 3. Supervisor app (1 h 30)

- [ ] F1 - Device shows on the website; rename, lock, unlock - both - **MUST**
- [ ] F2 - 3 offline clock-ins sync; photos never block - both - **MUST**
- [ ] F3 - Breaks and override clock-out keep the clock-in site - both - **MUST**
- [ ] F4 - Offline cold start shows cached Home - phone - **MUST**
- [ ] F5 - Offline new employee + clock-in sync in order - both - **MUST**
- [ ] F6 - Supervisor PIN change; duplicate refused; offline clash alert - both - **MUST**
- [ ] F7 - Offline name edit syncs - both - **MUST**
- [ ] F8 - Override requires a reason when set - both - **MUST**
- [ ] F9 - Punch comment shows on the website and in Approve Hours - both - **MUST**
- [ ] F10 - Supervisor + employee comments both show - both - **MUST**
- [ ] F11 - Offline comment syncs; cancelled comment doesn't - both - **MUST**
- [ ] F12 - Site pill counts and lists follow the clock-in site - both - **MUST**
- [ ] F13 - "Ask for job site each time" ON keeps the pick; OFF auto-detects - both - **MUST**
- [ ] F14 - Missing setting is treated as OFF until saved - both - **MUST**
- [ ] F15 - PIN clock-in online and offline - phone - **MUST**
- [ ] F16 - Temp link in Safari: right and wrong PIN - phone - **MUST**
- [ ] F17 - App photo update reaches the website; old photo kept - both - **MUST**
- [ ] N7 - Face out of frame gives a No Face Detected alert - both - **MUST**
- [ ] N8 - No reference photo: no face result, no alert - both - **MUST**
- [ ] N9 - Bad reference photo pauses checks; one alert only - both - **MUST**
- [ ] D5 - Remove photo: Cancel does nothing; Yes clears the tag and alert - web - **MUST**
- [ ] F18 - Supervisor Alerts tab shows only app alert types - phone - **MUST**

## Session 4. Employee App at the desk (3 h)

- [ ] H1 - Full shift online: instant camera, green screen, map - both - **MUST**
- [ ] H2 - 3 wrong PINs: 60 s lock, countdown, then works - phone - **MUST**
- [ ] H3 - Offline PIN check and punch, then sync - both - **MUST**
- [ ] H4 - PIN lock survives an app restart - phone - **MUST**
- [ ] H5 - Offline full shift: queue, Hours tags, "Synced late" - both - **MUST**
- [ ] H6 - Breaks online and offline - both - **MUST**
- [ ] H7 - Shift comments online and offline sync - both - **MUST**
- [ ] H8 - Log out warns about unsynced items; they sync after sign-in - both - **MUST**
- [ ] H9 - Settings rows, offline PIN, permission switches - both - **MUST**
- [ ] H10 - PIN changed on the website while offline: new PIN works - both - **MUST**
- [ ] H11 - Old-PIN punch fails clearly; Remove clears it - both - **MUST**
- [ ] H12 - Two PIN changes while offline: punch still syncs - both - **MUST**
- [ ] H13 - Weak signal: punches queue, no false "Synced late" - both - **MUST**
- [ ] H14 - Out-of-order punch fails; Remove lets the next sync - both - **MUST**
- [ ] H15 - Punch after deactivation fails; Remove clears it - both - **MUST**
- [ ] H16 - Late punch on an approved week gives an alert - both - **MUST**
- [ ] H17 - Sync Now syncs queued punches - both - **MUST**
- [ ] H18 - Wrong phone clock flagged; server time used online - both - **MUST**
- [ ] H19 - Punch timing under 1 s on Wi-Fi, cellular and offline - phone - WAIT (speed benchmark)
- [ ] H20 - Fresh install: PIN loads once online; notification prompt once - phone - **MUST**
- [ ] H21 - Notifications denied, then turned on in Settings - phone - **MUST**
- [ ] H22 - Notifications "Not Now" blocks nothing - phone - **MUST**
- [ ] H23 - Another employee's PIN and pushes never leak - both - **MUST**
- [ ] J1 - Offline clock-in keeps its time, map and site - both - **MUST**
- [ ] J2 - Location off: fast punch, banner, assigned site - both - **MUST**
- [ ] J3 - Unassigned site detected + alert, once - both - **MUST**
- [ ] J4 - Precise Location off uses the assigned site - both - **MUST**
- [ ] J5 - All 4 events at Site A with their own location - both - **MUST**
- [ ] J6 - Core: assigned site, photos, no face check - both - **MUST**
- [ ] M1 - Hours tab: missing clock-out, in progress, no empty days - both - **MUST**
- [ ] SN1 - Sync tab shows this week only, plus failed rows - phone - **MUST**

## Session 5. Alerts, push, face checks (2 h)

- [ ] K1 - Break reminders: 3 pushes, Alerts rows, website alert - phone - **MUST**
- [ ] K2 - Ending the break early stops the later reminders - phone - **MUST**
- [ ] K3 - A short break sends no reminders - phone - **MUST**
- [ ] K4 - Max break warning OFF sends no reminders - both - **MUST**
- [ ] K5 - Reminders arrive with the app killed - phone - **MUST**
- [ ] K6 - "Shift ending soon" push before close - both - **MUST**
- [ ] K7 - One "Still clocked in" push after close - phone - **MUST**
- [ ] K8 - Missed clock out OFF sends no pushes - both - **MUST**
- [ ] K9 - Clock-in after close: no closing pushes - phone - **MUST**
- [ ] K10 - Max hours push and website alert - both - **MUST**
- [ ] K11 - Max hours alert for a shift from yesterday - both - **MUST**
- [ ] K12 - One weekly overtime push - phone - **MUST**
- [ ] K13 - Max hours and overtime OFF: no push - both - **MUST**
- [ ] K14 - Employee Alerts tab: own alerts, newest first - phone - **MUST**
- [ ] K15 - Another employee sees none of these alerts - phone - **MUST**
- [ ] K16 - Alerts tab opens offline - phone - **MUST**
- [ ] K17 - Wrong PIN at sync: one alert per day - both - **MUST**
- [ ] K18 - Late clock-in and early clock-out alerts - both - **MUST**
- [ ] N1 - Face Match of 90% or more, including in poor light - both - **MUST**
- [ ] N2 - No face: alert, warning, push - both - **MUST**
- [ ] N3 - Another face gives a Face Mismatch alert - both - **MUST**
- [ ] N4 - "No face detected" alerts OFF - both - **MUST**
- [ ] N5 - "Face didn't match" OFF; main face switch OFF - both - **MUST**
- [ ] N6 - Offline no-face message arrives after sync - both - **MUST**

## Session 6. Website review (1 h 15)

- [ ] R1 - Time Tracking events show photo, map, badges, comments - web - **MUST**
- [ ] R2 - Adjust time: confirm step; out-of-order and future refused - web - **MUST**
- [ ] R3 - Editing from an alert uses the same confirm step - web - **MUST**
- [ ] R4 - Reassign a punch re-runs the face check - web - **MUST**
- [ ] R5 - Timesheet Approvals layout, warnings, approve all - web - **MUST**
- [ ] R6 - Overview resolve/ignore, cards; old alerts hidden - web - **MUST**
- [ ] R7 - Reports company filter, rounding, Excel export - web - **MUST**
- [ ] R8 - Analytics totals match Reports - web - **MUST**
- [ ] U2 - Automatic break deducted only past the minimum shift - web - **MUST**

## Session 7. Walking outside (2 h 30)

- [ ] J7 - Geofence consent and Always prompts, asked once - both - **MUST**
- [ ] J8 - "Keep Only While Using" walk-through steps - phone - **MUST**
- [ ] J9 - Consent "Not now": banner, "tracking off" on the website - both - **MUST**
- [ ] J10 - Consent and Terms re-accept after a version bump - both - **MUST**
- [ ] J11 - Crew sign-up location step wording - phone - **MUST**
- [ ] J12 - Clock-in far away: outside badge + alert with distance - both - **MUST**
- [ ] J13 - Consent from the banner starts tracking - both - **MUST**
- [ ] J14 - Leaving the site: push, Alerts row, red line, Overview alert - both - **MUST**
- [ ] J15 - Approvals warning on exits; hours unchanged - web - **MUST**
- [ ] J16 - Out and back under 1 minute: nothing - both - **MUST**
- [ ] J17 - A short exit shows gray "(short)" and clears the alerts - both - **MUST**
- [ ] J18 - Supervisor sees "Left Job Site" with no push - phone - **MUST**
- [ ] J19 - "Left the job site" alerts OFF - both - **MUST**
- [ ] J20 - Exit while offline: real times after sync - both - **MUST**
- [ ] J21 - Offline clock-in then exit, in order - both - **MUST**
- [ ] J22 - Force-quit: write down if a push came (decides C3) - both - **MUST**
- [ ] J23 - Phone restart: push or gray "stopped tracking" - both - **MUST**
- [ ] J24 - Bad GPS exit is never silent - both - **MUST**
- [ ] J25 - Clock out outside closes the exit; hours stay at Site A - both - **MUST**
- [ ] J26 - Exit on a break: gray, no alerts - both - **MUST**
- [ ] J27 - Core: no leave tracking - both - **MUST**
- [ ] J28 - Geofence turned off mid-shift stops tracking - both - **MUST**
- [ ] J29 - Supervisor-app clock-in: no tracking - both - **MUST**
- [ ] J30 - Log out mid-shift: "tracking off (signed out)" - both - **MUST**
- [ ] J31 - While Using only: banner, "permission off" - both - **MUST**
- [ ] J32 - Overview "Outside now", then today's list - both - **MUST**
- [ ] J33 - Clock in at A, out at B: hours stay at A - both - **MUST**
- [ ] J34 - Precise Location off: clock-out at the clock-in site - both - **MUST**
- [ ] J35 - Rough fix at Site B falls back to the assigned site - both - WAIT (only if you can get a rough fix)
- [ ] J36 - Site B geofence checks against Site B - both - **MUST**
- [ ] J37 - Supervisor app clock-out site with "Ask" OFF and ON - both - **MUST**
- [ ] J38 - Breaks and auto clock-out stay at Site A - both - **MUST**
- [ ] J39 - Exits measured from the clock-in site's fence - both - **MUST**
- [ ] J40 - Core: clock-out at Core Site 2 stays at the assigned site - both - **MUST**

## Session 8. Remove photo, delete employee, Delete account (1 h)

- [ ] X1 - Remove photo: Storage empty, old events kept - web - **MUST**
- [ ] X2 - No face check until a new photo is added - both - **MUST**
- [ ] X3 - Deleting an employee keeps their clock photos - web - **MUST**
- [ ] X4 - Delete account refused while clocked in or on a break - phone - **MUST**
- [ ] X5 - Delete account offline: clear error, nothing deleted - phone - **MUST**
- [ ] X6 - Unsynced punches sync before the account is deleted - both - **MUST**
- [ ] X7 - Delete account: signed out, tag, seat freed, alert - both - **MUST**
- [ ] X8 - Core Delete account removes the selfie and PIN - both - **MUST**
- [ ] X9 - Reactivating a deleted-account employee - web - **MUST**

## Session 9. Billing changes (1 h)

- [ ] A8 - Core to Pro: prorated, Pro features unlock - web - **MUST**
- [ ] A9 - Failing card: plan stays, clear error - web - **MUST**
- [ ] A10 - Pro to Core mid-shift: Pro features stop, nothing wiped - both - **MUST**
- [ ] A11 - Cancel to Free: 8 active, open shifts closed - web - **MUST**

## Session 10. Multi-day (15 min a day for a week)

- [ ] W1 - Auto clock-out at the limit, with alert and exit text - both - **MUST**
- [ ] W2 - A week of data correct day by day; overnight pairs - both - **MUST**
- [ ] W3 - Approve Hours week view and approve all - web - **MUST**
- [ ] W4 - Weekly report + Excel job site exits - web - **MUST**
- [ ] W5 - Write down when "Missed clock out" fires overnight - both - WAIT (known open item, record only)
- [ ] W6 - Outside past midnight stays in "Outside now" - both - WAIT (overnight edge case)
- [ ] W7 - Hours tab skips days off; matches Approve Hours - phone - **MUST**
- [ ] W8 - Monday before any punch: "No hours worked yet" - phone - **MUST**
- [ ] W9 - Last week's synced rows gone on Monday - phone - **MUST**

## P. Prod smoke test (45 min, after the prod deploy)

- [ ] P1 - Owner sees and accepts the r7 Terms box - web - WAIT (after deploy)
- [ ] P2 - Apple app-site-association lists /j/ and /i/ - web - WAIT (after deploy)
- [ ] P3 - Crew code and app invite on prod - web - WAIT (after deploy)
- [ ] P4 - Real app: crew sign-up, invite links, App Store fallback - phone - WAIT (after deploy)
- [ ] P5 - Online and offline punches with photo, face, site - both - WAIT (after deploy)
- [ ] P6 - Alerts and pushes for two companies - both - WAIT (after deploy)
- [ ] P7 - Live 1.1.4 and the new supervisor app: PIN punches - phone - WAIT (after deploy)
- [ ] P8 - Password reset email arrives and works - web - WAIT (after deploy)
- [ ] P9 - Delete account on a throwaway prod employee - phone - WAIT (after deploy)

## AN. Android (once an Android build exists)

- [ ] AN1 - Push token registration - phone - WAIT (Android)
- [ ] AN2 - Break reminders under Doze - phone - WAIT (Android)
- [ ] AN3 - Leave tracking after reboot and force-stop - phone - WAIT (Android)
- [ ] AN4 - /j/ and /i/ App Links - phone - WAIT (Android)
- [ ] AN5 - Delete account flow - phone - WAIT (Android)

---

## Ready for prod when

1. **Every MUST test passes** (178), recorded in the `ios-test-list.md` Results log. A skip counts as not passed, unless the test is rerun later or you write down that you accept it.
2. **No open fails.** Every fail is fixed, then retested on the build or site that carries the fix, and the retest is recorded as a pass. The "Open fails" list says "None".
3. **If a fix needs a new build or deploy,** the tests in the areas it touched are run again on that build.
4. **AWS opt-out is done** (biometric audit gap a, in the AWS console).
5. **J22 and J23 are written down,** and the C3 decision based on them is made.
6. **The unit tests are green** (the functions and app suites). They cover X10-X14, which can't be done by hand.
7. **After the prod deploy,** P1-P9 are run. They aren't needed to start the deploy, but launch isn't finished until they pass.
