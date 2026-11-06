# Phase 10 dev test round (one build, phone + dev website)

One TestFlight build of OrbitsWorks Dev (com.orbitworks.app.dev, employeeDev
profile, iOS build 21 / v1.1.3) and the dev website (orbitworks-dev-ew, site
at 402fe14). Build only - no OTA updates in this round (OTA to the dev app is
broken, see C2).

- Every test keeps its original ID with its phase in front (6-L1 is L1 from
  test-run-phase6.md). The full steps, setup ("Step 0") and what I check are
  in that file - this list is the order to run them in and the one place to
  mark results.
- Logins: test/dev-e2e/creds.json. Companies: jc-test-pro-dev (Pro) and
  jc-test-core-dev (Core) only.
- Do each phase's Step 0 before its first test (test-run-phase7.md Step 0
  shortens alert times; test-run-phase8.md Step 0 sets Site A's geofence;
  test-run-phase9.md Step 0 needs a subcontractor). Keep "Require geofence"
  OFF until Session 3 (test-run-phase6.md note).
- After each test send "done <ID>". I check dev read-only and answer OK or
  FAILED. Anything FAILED goes in B.
- Result: OK / FAILED / SKIP (with why).

---

## A. MASTER TEST LIST

### Session 1 - website only (desk, no phone)

| ID | Where | What to do | Expected | Result |
|---|---|---|---|---|
| 8-Q1 | web | Crew Access > Create crew code: pick Site A, Site B, "+ New job site"; change Site A radius in the modal, save | No "Location" radio; site geofence switch with the site's own radius; change shows on Sites page; site with no pin / new site locked until an address is picked | |
| 8-Q2 | web | Open any crew code's Info | No "Location required" row | |
| 9-E1 | web | Employees > "Invite someone": one Employee (app) with a site, one Supervisor with 2 sites, one Admin | One form, fields change by role; each lands in its own list; seats left shown for every role | |
| 9-E2 | web | (I set 0 seats) open the invite form; Core company for app invites | Every role "(not available)" with "No seats left..."; Send disabled; Core: app invites greyed with the plan reason | |
| 9-E3 | web | Supervisor invite to an email with a pending Admin invite | "There's already a pending invite for that email." | |
| 9-E5 | web | Employees, company filter = Sub Co | Sub Co employees, Company column shows Sub Co | |
| 9-R1 | web | Reports, range with in-house + Sub Co hours; Company All / in-house / Sub Co | Every section and export follow the pick; site notes only under All; filter hidden with no subcontractors | |
| 9-C1 | web | Crew Access > Crew onboarding | Geofence column (On - radius / Off); Copy link on active codes only, same link as Info | |
| 9-C2 | web | Crew Access > Temp link, make 2 links | "Active temp links (2)" | |

### Session 2 - phone at the desk (Site A = your desk; geofence OFF)

| ID | Where | What to do | Expected | Result |
|---|---|---|---|---|
| 6-L1 | phone | Reinstall; new sign-up, "Turn on location", Allow While Using | Location step after Submit, before PIN; no Always choice; Phase 8 text; no banner | |
| 6-L2 | phone | Reinstall; sign-up, Skip; tap Home banner, Allow | Banner shows, prompt from banner, banner gone | |
| 6-L3 | phone | Reinstall; sign-up, Skip; Settings Location switch on | Prompt shows, switch on, banner gone | |
| 6-L4 | phone | Reinstall; sign-up, Don't Allow; banner -> iPhone Settings -> While Using -> back | Opens iPhone Settings, banner gone without restart | |
| 5d-1 | both | Core: Invite new person, open link on phone, sign up | Email locked, name empty, sign-up works | |
| 5d-2 | both | Core: existing row with DOB + sub, Invite to app, rename on phone | Prefilled; still ONE row, renamed; existing PIN | |
| 5d-3 | both | Pro: existing row, Invite to app, keep name, add DOB, clock in | Name kept; face check passes | |
| 5d-4 | phone | Invite link, name 1 letter / empty | "Enter your full name."; revoke after | |
| 5d-5 | phone | Tap used, revoked and edited invite links | "Invite no longer active", nothing leaked | |
| 6-P1 | both | At Site A, online: in, break, end break, out | Green screens instant; map + address on all 4 on the website | |
| 6-P2 | both | Airplane mode, clock in, 10 min, back online | Saved offline; original time + map after sync; Site A | |
| 6-P3 | both | Location Never; clock in + out | Punches as fast; banner; "No location recorded"; Site B | |
| 6-D1 | both | At Site A (assigned only Site B), clock in (needs a fix of 100 m or better - fix round 1 D18 b) | Site A + "Auto-detected" | |
| 6-D1b | both | D1 clock-in, then assign Site A, out, in again | Mismatch alert first time only; never on out/breaks | |
| 6-D3 | both | Precise Location off, clock in at Site A | Site B, no Auto-detected, rough location shown | |
| 6-D4 | both | Clock in at Site A, break, end, out (all at Site A) | All 4 events Site A, each with its own location (fix round 2: the clock-out is its own detection - out at Site B would say Site B + Auto-detected, see 10-S1) | |
| 6-D5 | both | Core employee at Core Site, in + out | Phase 3 site, never Core Site; map shows | |
| 5-N5 | phone | Open Sync tab | Synced rows from this week only (Monday to today, company time - fix round 1 A2); an old Failed (last week or older) still shows | |
| 7-N1 | phone | Reinstall, sign in, clock in, let green close | Notifications asked once after the green screen; token saved | |
| 7-N2 | phone | Reinstall, Don't Allow, break, then Settings switch on | Break normal; switch on after; token saved | |
| 7-N3 | phone | Reinstall, Not Now, break, out | Nothing blocked; no second question | |
| 7-N4 | both | Log out, sign in as Core employee; admin manual clock-in for jc-pro-emp 2 h ago | Phone gets nothing for jc-pro-emp; offline log out within ~3 s | |
| 7-B1 | phone | Break, lock phone 11+ min | 5 min left / time up / over limit, once each; Alerts rows | |
| 7-B2 | phone | Airplane, break, end after "5 minutes left" | Only "5 minutes left" | |
| 7-B3 | phone | Break 30 s, wait 12 min | No reminders | |
| 7-B4 | both | Max break warning OFF, break 12 min | No reminders | |
| 7-B5 | phone | Break, kill app, 7 min | 5 min left + time up still show; over limit never after End | |
| 7-S1 | both | Clock in before close (close ~20 min away), app closed | "Shift ending soon" push 15-0 min before close; opens Alerts | |
| 7-S2 | phone | Stay clocked in past close + 35 min | One "Still clocked in" push | |
| 7-S3 | both | Missed clock out alert OFF, repeat S1 + S2 | No pushes | |
| 7-S4 | phone | Clock in after close, 30 min | No shift ending / still clocked in | |
| 7-M1 | both | Clock in 1 h 15 min | "Max hours" push + Alerts row + website Max Hours alert | |
| 7-M2 | both | Admin: manual clock-in 11:00 PM yesterday, no out | Max hours push for that shift; alert dated yesterday | |
| 7-M3 | phone | Week over 2 h | One "Overtime" push this week | |
| 7-M4 | both | Max hours + Overtime OFF, clock in 1 h 15 | No push | |
| 7-A1 | phone | Alerts tab after the groups above | Own alerts + break reminders, newest first, read only | |
| 7-A2 | phone | Log out, Core employee, Alerts | None of jc-pro-emp's | |
| 7-A3 | phone | Airplane, kill + reopen, Alerts | Opens; break reminders still show | |
| 7-W1 | both | Offline, admin changes PIN, punch with old PIN, online; repeat | "Couldn't sync"; ONE Wrong PIN at Sync alert today | |
| 8-P1 | both | Turn Site A geofence ON (Step 0 Phase 8). Reinstall, clock in at Site A | After notifications: consent screen, Agree, Always prompts; not asked again | |
| 8-P2 | phone | Reinstall, Keep Only While Using | Walk-through steps; closes by itself when Always is on | |
| 8-P3 | both | Reinstall, consent Not now, 5 min, out | Orange banner; gray "Tracking off ... (location permission off)" | |
| 8-P5 | both | (I reset consent) clock in at Site A, tap the orange Home banner (Settings has no Location access row since fix round 1 D3 a); website as owner | Consent again; Terms re-accept prompt r6 on the website | |
| 8-P6 | phone | Crew code sign-up to "Share your location" | Geofence wording; While Using only | |
| 9-E4 | both | Sign up via crew code with same name + birthday as an existing employee; dismiss | Badge + Edit box + open link; dismiss clears, other untouched | |

### Session 3 - phone walking outside (Site A geofence ON, 300 ft)

| ID | Where | What to do | Expected | Result |
|---|---|---|---|---|
| 6-D2 | both | 2+ km from every site, clock in (good fix, 100 m or better) | "Not specified" (fix round 1 F1), no Auto-detected; outside badge + alert if the company has a geofenced site (E3 b) | |
| 8-P4 | both | No consent; tap banner, Agree, Always; walk out 5 min, back | Gray tracking off ends; then red exit | |
| 8-W1 | both | Walk out 10 min, back 5 min (phone locked) | Notification ~2 min after leaving; red line on website; Overview alert; Alerts tab entry | |
| 8-W2 | web | Clock out after W1; Timesheet Approvals | Red warning, hours unchanged | |
| 8-W3 | both | Out and back under 1 min | Nothing at all | |
| 8-W4 | both | Out, wait for notification, back under 3 min | Notification; gray "(short)"; no red warning | |
| 8-W4b | both | After W4: Overview + supervisor Alerts | Feed entry gone once the return syncs; employee entry stays | |
| 8-W5 | phone | Supervisor app (jc-pro-sup), Alerts after W1 | "Left Job Site", no push | |
| 8-W6 | both | Alerts "Left the job site" OFF, repeat W1 (5 min) | Exit still red in Time Tracking; no feed / supervisor / Approvals warning | |
| 8-O1 | both | Airplane (location on), out 10, back 5, online | Notification offline; real times after sync | |
| 8-O2 | both | Airplane, clock in, out 10, back, online | Notification offline; clock-in then exit on website | |
| 8-O3 | both | Force-quit app, out 10, back, open | Write down: notification yes/no; never a wrong time | |
| 8-O4 | both | Restart phone, out 10, back, open | Write down: notification yes/no; else gray "phone stopped tracking" | |
| 8-O5 | both | Leave through bad GPS (garage), out 5, back | Gray "no good location fix" then red, or just red; never nothing | |
| 8-E1 | both | Out 5 min, clock out from outside | "Left ... - clock-out <time>"; tracking stops; the clock-out itself says "Not specified" (good fix inside no site, fix round 2) or the site you're standing in - hours still under Site A | |
| 8-E3 | both | Break, out 5, back, end break | Notification; gray "(on break)"; no alerts | |
| 8-C1 | both | Core employee, walk out 10 | Nothing | |
| 8-C2 | both | Toggle Site A geofence OFF mid-shift, open app, walk out | No exit recorded after the switch | |
| 8-C3 | both | Supervisor app clocks jc-pro-emp in; walk out with employee phone | Nothing | |
| 8-C4 | both | Log out mid-shift, sign in as another Pro employee, walk out | Gray "Tracking off ... (signed out)"; nothing for the other | |
| 8-C5 | both | iPhone Settings -> While Using, walk out, back to Always | Banner; gray "location permission off" | |
| 8-C6 | both | (I drop the plan to Core) open app, walk out | No new exit | |
| 9-O1 | both | Walk out and stay; open Overview; walk back | "Outside now" then today's list; red / gray | |

### Session 4 - multi-day and long waits

| ID | Where | What to do | Expected | Result |
|---|---|---|---|---|
| 8-E2 | both | Auto clock-out 1 h ON; clock in, walk out after 50 min | Auto clock-out at 1 h; "... - auto clock-out <time>" | |
| 9-O2 | both | Walk out before midnight, stay out past it; Overview after midnight | Still in "Outside now"; not in today's list | |
| 9-W1 | web | Full week made (Mon-Fri table in test-run-phase9.md); Time Tracking day by day | Photos, source, comments, Synced late, left-site lines; Thu 10 PM pairs with Fri 2 AM both ways; Fri detail Source "Auto clock-out" | |
| 9-W2 | web | Approve Hours, Week | Comment icon; Synced late yellow; Wed red + gray list; Thu one 4 h session | |
| 9-W3 | web | Select all, Approve | All approved without Firestore | |
| 9-W4 | web | Reports Mon-Fri + Excel full report | Job site exits table; Detail left site / tracking off / synced late; Job site exits sheet; Photo removed text | |
| 90d-1 | - | Site exit locations cleared after 90 days | Can't test in round (functions test covers it) | SKIP |
| 90d-2 | - | Employee alerts deleted after 90 days | Can't test in round (functions test covers it) | SKIP |
| 90d-3 | - | Clock photos deleted after 90 days -> "Photo removed" (website + Excel) | Can't test in round unless I set photoRemovedAt on one dev event | SKIP |
| 4d-1 | - | Synced queue rows dropped after 8 days (Sync tab, fix round 1 A2 - was 4) | Can't test in round (app tests cover it) | SKIP |

Not in this round, still open (see C): Phase 4 smoke tests T4, T6, T7, T8,
T9, T10, T11, T12, T13, T15 (phase4-test-checklist.md); Android.

---

## B. FAIL LOG

| ID | What happened | Screenshot (y/n) | Severity (blocks release / fix before prod / later) |
|---|---|---|---|
| | | | |

---

## C. OPEN TO-DO LIST

Source: dev-functions-pending.md (Phase 10 list and the other open sections)
and earlier phase notes. The Build Phases doc itself is not in this repo -
add any Phase 10 item from it that is missing here.

### C1. Blocks this build
- Re-authenticate Apple credentials in EAS (build 20 got "Apple 401" / failed to fetch provisioning profiles).
- Confirm the APNs push key is on the Expo project for com.orbitworks.app.dev and Push Notifications is enabled on that App ID (needed for every Phase 7 push test).

### C2. Must fix before prod
- Find why EAS Updates never reach the dev app (update 01a1833d, builds 10/11); prod hotfixes depend on OTA.
- Prod TEST_COMPANY_IDS=ShipMate still limits alerts and Employee App pushes to ShipMate - decide (clear it or gate only the supervisor feed).
- missedClockOut fires at midnight for overnight workers.
- Company-time day edges on every website page (H10 b).
- Supervisor/admin invite seat check is not atomic (acceptInvite).
- Email invite duplicate check has no lock (two admins, same email, same instant).
- Rate limit + App Check on joinCompany, getJoinInfo, acceptEmployeeInvite, getInviteInfo.
- "Join with crew code" in the real app: prod joinLinks, associated domains / intent filters, apphosting.yaml vars.
- "Open in the app" on /j dead-ends when the app isn't installed - fall back to store buttons.
- Android assetlinks.json for /j/ and /i/ links (dev + prod package + signing fingerprints).
- Move the current PIN off the employee doc to a server-only doc (decided fix round 1, D2 a - not hashed: the website PIN field, the supervisor PIN table and Settings "Show PIN" all need it; dev-functions-pending.md).
- Unify the employee break site with main - built in fix round 1 (D19 a: supervisor breaks + override clock-outs copy the shift's clock-in site on the server); ships with the functions deploy, test 10-F6.
- Run the Phase 4 smoke tests never run: T4, T6, T7, T8, T9, T10, T11, T12, T13, T15.
- Write temp link API tests (generate, list, history, revoke, public clock-in).
- Face check missing on one clock-out (dev event e43e4076-..., before a229a46) - include in the recheck.
- Duplicate "Emilio Peguero" on dev (GZ3DKAhivqjkAw04Md9T) - find how it was created before deleting.
- Phase 10 lint pass: useAlertsFeed.js, OfflineBanner.js, LoadingScreen.js, AuthContext.js, useHomeSnapshot.js, useLocalStatusOverlay.js, useSyncQueue.js, useTodayShift.js, SyncQueueScreen.js, AddEmployeeForm.tsx.

### C3. Release tasks
- App Store review note for "Always" location (clocked in at a Pro geofenced site only, region monitoring, demo login).
- Google Play background location declaration + video (clock in, consent, Always prompt, walk out, notification).
- Lawyer review: sign-up privacy + biometric consent, location consent (consentVersions.ts), privacy policy and employee notice r6 - any wording change bumps a version.
- Android: Firebase Android app + google-services.json per variant, FCM V1 key in EAS, Doze check for break reminders, Android build and full Android test run (incl. leave tracking re-arm after reboot / force stop).
- iOS force-quit behavior for leave tracking (result of 8-O3) - decide whether the app needs a hint.
- Re-auth Apple credentials in EAS again before the release builds.
- Move the development / dev / preview EAS profiles to the dev app ID with their own channels (they still build com.orbitworks.app against dev Firebase).
- Prod release: merge employee-app into main, prod deploy (indexes, rules, functions, site), the ClockCamera siteId fix ships with it.
- One-time prod recheck of selfies wrongly flagged "no usable face" (faceReference bad + same photo -> DetectFaces), report counts only.
- Owners will see the Terms re-accept prompt (r6) on prod after the site deploy - expected, tell customers.
- Prod instance cap left from old deploys (about 40 prod functions at maxInstances 20) - decide on one cap in code.

### C5. Phase 10 fix round 1 - tests once deployed (new app build + dev functions + dev website)

Same rules as A: send "done <ID>", Result OK / FAILED / SKIP.

| ID | Where | What to do | Expected | Result |
|---|---|---|---|---|
| 10-A1a | phone | Employee Settings | Rows: Email (the sign-in email), PIN ****, Birthday, Company; switches; no Subcontractor, Job site or Location access | |
| 10-A1b | phone | Tap Show on PIN; wait 30 s; Show again, switch tab | Your PIN shows; hides after 30 s; hides when leaving the tab | |
| 10-A1c | both | Website: change the PIN; phone: Show | The new PIN | |
| 10-A1d | phone | Airplane mode, tap Show | "Connect to the internet to see your PIN" | |
| 10-A1e | phone | Sub Co employee (9-E5), Settings | Company = the parent company, never Sub Co | |
| 10-A2 | phone | Sync tab on any day after Monday, with a synced punch from last week and an old Failed one | Last week's synced row gone; this week's rows and the old Failed row show | |
| 10-A3a | phone | Supervisor app (jc-pro-sup): employee assigned only Site B clocks in at Site A; pill = Site A, then Site B | Counted under Site A (Active card), not under Site B | |
| 10-A3b | phone | Same, Breaks list and Override "Clock out" list with pill = Site A / Site B | Listed under Site A only; Override "Clock in" list still by assigned sites | |
| 10-A3c | phone | Supervisor app offline: clock someone in at Site A, pill = Site A | Counted at Site A at once | |
| 10-A3d | phone | Pill = No Site | Only people clocked in with no site | |
| 10-W1 | web | (I make 12 temp links) Crew Access > Temp link | History shows 10, "Load older links" adds 2 then goes away; Active list only unexpired links | |
| 10-W2 | web | Overview: close Alerts, Employees clocked in, On break; reload | Each closes with its count; all open again after reload | |
| 10-W3 | web | Employees: search a name, an email, a word that matches nobody; 25+ employees: Show 20 more; Show inactive | Search filters both lists; 20 then the rest; inactive in their own list, 20 at a time | |
| 10-W4 | web | Jobs > Sites with 11+ sites | 10, then Show 1 more | |
| 10-W5 | web | Jobs > Titles & Pay: Edit a title, change the rate (effective date), Deactivate, Delete a test title | Edit opens a window; rate asks for the date; row has only Edit; 10 at a time | |
| 10-W6 | web | Timesheet Approvals, Day + Week, laptop width (1280-1366 px) | No Shift column; no sideways scrolling; Status select + icons fit | |
| 10-W8a | web | (I add an alert dated 31+ days ago) Overview | It doesn't show; newer ones do | |
| 10-W8b | web | Reports for last week: approved hours vs Timesheet Approvals | Same totals as before the deploy (only approvals from the range are read now) | |
| 10-F1 | both | Pro employee app, good fix at Site A, assigned only Site B | Site A + Auto-detected + site mismatch alert (= 6-D1) | |
| 10-F2 | both | Pro employee app, good fix 2+ km from every site, crew-code employee | "Not specified" (= 6-D2); outside badge + alert with the distance to the nearest geofenced site (E3 b) | |
| 10-F3 | both | Pro employee app, Precise Location off (rough fix) or location Never | Crew code / single assigned site (= 6-D3, 6-P3) | |
| 10-F4 | both | Core employee app at Site A | Phase 3 site, never detected (= 6-D5) | |
| 10-F5 | both | Supervisor app, Pro: Ask for job site each time ON, pick Site B at Site A; then OFF and clock in at Site A with pill Site B | ON: Site B kept; OFF: Site A + Auto-detected | |
| 10-F6 | both | Supervisor app: clock in at Site A, break start/end, Override clock-out with pill = Site B | Break events and the clock-out show Site A on the website | |

### C6. Phase 10 fix round 2 - clock-out site detection (dev functions + dev website, no new app build)

| ID | Where | What to do | Expected | Result |
|---|---|---|---|---|
| 10-S1 | both | Pro employee app: clock in at Site A, walk to Site B, clock out (good fix) | In: Site A + Auto-detected; Out: Site B + Auto-detected; the phone's green screen still says Site A (J a), History and Sync say Site B after sync | |
| 10-S2 | web | Timesheet Approvals + Reports for 10-S1 | Row and hours under Site A; under the site "Clocked out at Site B"; event detail of the clock-out says "Clocked in at Site A - the shift's hours count there"; no new alert | |
| 10-S3 | both | Clock out 2+ km from every site (good fix) | Out "Not specified", no tag; outside badge if the company has a geofenced site | |
| 10-S4 | both | Clock out with Precise Location off (or location Never) | Out = the clock-in site, no Auto-detected tag | |
| 10-S5 | both | Assigned only Site A: clock out at Site B with a rough 100-500 m fix (if you can get one) | Out = Site A (an unassigned site needs 100 m or better) | |
| 10-S6 | both | Site B geofenced: clock out inside Site B | Geofence "At site" (checked against Site B, not the clock-in site) | |
| 10-S7 | both | Supervisor app (Ask for job site each time OFF): clock in at Site A, clock out at Site B | Out: Site B + Auto-detected; ON: out = Site A, no tag | |
| 10-S8 | both | Breaks during 10-S1; auto clock-out (8-E2 setup) | Breaks Site A; auto clock-out Site A | |
| 10-S9 | both | Leave tracking during 10-S1 | Exits measured from Site A's fence; the clock-out closes them | |
| 10-S10 | both | Core employee: clock in at Site A, out at Site B | Both the Phase 3 site, never detected | |

### C4. Can wait until after launch
- phoneClockOff only catches a clock set back (needs a native sleep-proof clock + boot id).
- Stored PIN check value can be cracked off an unlocked phone (accepted risk, same as supervisor pin_cache).
- Phone PIN lock resets on reinstall.
- appStopped gap start is a best guess (uptime pauses in sleep).
- Remove the leftover ios.buildNumber from app.json (ignored with remote versions).
