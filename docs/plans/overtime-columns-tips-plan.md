# OrbitsWorks - Overtime, Approve Hours Columns, Tips (Plan)

Planned: Nov 24, 2026.

## STATUS (Nov 25, 2026)
- Task 1 (Overtime): DONE and tested on dev. Frozen on feature/overtime (6e43c83). Not on prod.
- Rollout: stacked branches. Task 2 = feature/approve-columns (off feature/overtime), Task 3 off Task 2, Task 4 off Task 3.
- After Task 4: ONE combined test on dev, then all 4 tasks ship to prod together (Emilio's call).
- Separate follow-ups (not part of these 4 tasks):
  - docs/plans/reports-utc-day-grouping-fix.md (Reports UTC day grouping).
  - Employee app My Hours: Automatic Break once per day when Overtime is ON (needs an app release; see decision 31).
  - (a) Approve Hours column widths never apply in Chrome: the <col> widths are calc(% - px), which browsers treat as auto in a table, so every column is drawn equal width. Pre-existing since Phase 10 (same on feature/overtime); Task 2 kept the same values.
  - (b) Overview (lib/hooks/useDashboardStatus.ts): "Weekly attendance error: Missing or insufficient permissions" in the console on account switch (log out + log in as another company), likely a listener/query not closed on logout. Check whether it also happens on prod.
  - (c) Employee app: record the phone model on employee-app punches (Task 2 D4 follow-up, next app release).
  - (d) Supervisor app pin_cache: server sends salted hashes instead of plain PINs (Task 5 K13). AFTER the 1.1.6 release, ask Emilio first.
- Task 2: CODE COMPLETE on feature/approve-columns (last commit 0d08f0b; feature commit e7d41b3; rules deployed to dev Nov 25).
- Task 3 (Tips): CODE COMPLETE Nov 25 on feature/tips (off feature/approve-columns 0d08f0b): cb28495 (types/validators/rules/setShiftTip/toggle/column), 39a040f (Session review Tips + history, Tips column), f738d5b (Reports + every pay export). Decisions D1-D10 below. Rules + setShiftTip deployed to dev Nov 25. Dev seed: scripts/devSeedTips.js (existing OT Test Co) / devSeedOvertime.js (fresh seeds) - Tips ON + $45 on OT E's Foreman B shift Tue Nov 17. Read-only check on dev data through the report code: OT E Nov 17 Laborer $75 / Foreman B $183 / Day total $258 (Worked 10.00, OT 2.00, Tips $45.00); A $255, C $920, D $892.50 unchanged. Browser checks (modal, columns, downloads) go in the final combined sweep. Open shift (no clock-out) = tip not counted until clocked out (kept as built, Emilio Nov 25). DONE - last commit e29aeba, pushed to origin.
- Task 4 (Admin Permissions): BUILT Nov 25 on feature/admin-permissions (ea2f7eb rules, 564999a server checks, 4c88b51 getShiftData, ff6fec1/f11efd0 hooks, b458ecf UI). Emulator suites pass (functions 789 incl. adminPermissions + rules G1/G2; web 193). Dev deployed Nov 25: firestore rules + 43 functions (5 new: setAdminAccess, setSiteAdmins, onJobSiteCreated, adminClockAction, getShiftData) + dev website (scripts/dev-site-deploy.ps1). NOT YET: browser checks (final sweep). Gaps fixed (D23): re-approve OT-changed warning + all-sites weekly hours for restricted admins (getShiftData), billing links by permission - deployed to dev Nov 25 (getShiftData + dev site). Push rule: each task branch is pushed to origin when done (never main).
- Task 5 (Kiosk mode, PRO): BUILT Nov 25 on feature/kiosk (off feature/admin-permissions f331fec): 80c7b92 rules + functions, 5ec1dea website, 261fc57 Storage rule, 0c5f9b0 app (version 1.1.6, iPad). Decisions K1-K21 below. Tests: functions 816/816 (new kioskRules + kiosk suites), web 200/200, app 344/344, live-clients compat 12/14 (the 2 failures are pre-existing from Task 4, see note below). Dev deployed Nov 25: firestore + storage rules, 47 functions (5 new: getKioskPinTable, kioskPunch, checkKioskUnlock, renameKioskDevice, createKioskExitKey), dev website. Dev app: OrbitsWorks Dev 1.1.6 (32), EAS build a74f0123 (employeeDev, commit a888f39), IPA checked (com.orbitworks.app.dev, iPad device family, appVariant dev), submitted Nov 25 to the DEV TestFlight (ASC 6826363680, submission 895844cc). Prod app + 1.1.5/RC1 untouched. Dev data: scripts/devSeedKiosk.js on OT Test Co (kiosk login, Kiosk Ava/Ben/Cal, Kiosk Admin with Settings only); deployed-function smoke test OK (kiosk claims, PIN table without pay/PII, direct employee/company reads 403, active count 8 without the kiosk). NOT YET: the iPad run (docs/plans/kiosk-ipad-test-list.md) + browser checks (final sweep). Prod: KIOSK_ENABLED=false (functions) / NEXT_PUBLIC_KIOSK_ENABLED=false (web) until 1.1.6 is in the App Store.
  - Task 4 job-site compat FIXED Nov 25: createdByUid on a new job site is required only for a restricted admin; owner / Full access / all-sites admins may leave it out and the new fillJobSiteCreator trigger fills it from the write's auth context (verified on dev). Live-clients compat 14/14, functions 818/818. Rules + fillJobSiteCreator on dev.
  - Storage: a kiosk writes a clock photo only where no file exists (the REST media upload can't carry metadata, so no per-kiosk stamp); it never reads one.
- iPad test round 1 fixes (Nov 25) on feature/kiosk:
  - f584eca kiosk app: (1) Comment button on the kiosk photo screen, saved as employeeComment on the punch (kioskPunch accepts employeeComment: in/out only, trimmed, 1-500; Session review shows it like a supervisor-app comment); (2) PIN pad 1.4x on Home + the gear pad (lib/kioskLayout.js); (3) on a break, "Break started 12:05 PM - 18 min" (live) above [End break]; (4) Kiosk Settings, under Exit Kiosk: read-only "Waiting to sync" list (employee, action, punch time, Waiting / Sending / Failed + reason; failed shown 7 days) + Sync now + "All synced, last synced X ago"; (5) idle back-to-Home on the Action + Break screens 30 s -> 25 s (Emilio picked these two of the 5 timers; camera 60 s, gear pad 30 s, Kiosk Settings 2 min unchanged).
  - 7da934a website: permission refusals = a TOAST naming the permission ("You don't have permission to add employees. Ask the owner or a Full access admin."), one place: lib/permissionErrors.ts + components/PermissionToastHost.tsx (dashboard layout). requirePermission / requireSite now send details {reason:"permission", permission} / {reason:"notYourSite"}; Firestore-rules / Storage refusals are named from the action. Wired into every Task 4 action's catch (employees, invites, approvals + Session review, time edits, alerts, Quick Links, sites, jobs/pay, tips, subcontractors, settings, devices, kiosk exit keys, site admins, permissions modal, reports/exports). Network / other errors keep their retry text. Billing (Stripe routes) unchanged: a 403 there still goes to /403.
  - Tests: functions kiosk 17/17 + adminPermissions 12/12, app 351/351 (kioskLogic + tabletLayout), web permissionErrors 6/6 + adminAccess.
  - Dev deployed Nov 25: 81 functions (every function importing adminAccess.ts / kiosk.ts, computed from the import graph) + dev website.
- Task 7 (tablet landscape): pulled forward before Task 6. BUILT Nov 25 on feature/tablet-landscape (off feature/kiosk), 9a0c69b: app.json orientation "default" + expo-screen-orientation (phones locked PORTRAIT_UP at start, tablets/Split View rotate); supervisor Dashboard = 2x2 grid in tablet landscape (>= 900 x 600 pt, lib/tabletLayout.js); Kiosk Home = clock | PIN pad side by side; other supervisor + kiosk screens centered at max 760 pt (components/MaxWidth.js; cameras and the full-color confirmation screens stay full screen). Employee-mode screens unchanged. NOTE: the stack order is now feature/kiosk -> feature/tablet-landscape; Task 6 (update banner) not started.
- Dev app: OrbitsWorks Dev 1.1.6 (33), EAS build 4843acbd (employeeDev, commit 9a0c69b), IPA checked (com.orbitworks.app.dev, 1.1.6 / 33, iPhone + iPad, all orientations in the plist; phones locked by JS at start), submitted Nov 25 to the DEV TestFlight (submission 8f683de8). Next dev build number = 34. Retest list: docs/plans/kiosk-ipad-test-list.md "Round 2 retest".
- Branch rule (Emilio, Nov 25): stack = feature/kiosk -> feature/tablet-landscape -> feature/update-banner (TOP). Fixes from the iPad retest go on the TOP branch only (no re-stacking lower branches). Next dev TestFlight build only when Emilio says (after his retest), from the top branch, all fixes in one build.
- Task 6 (update banner): BUILT Nov 25 on feature/update-banner (off feature/tablet-landscape), 8309a09. U1-U3 as decided: banner in all 3 modes ("A new version is available (1.1.7) / You're on 1.1.6 [Update] [x]", [x] = hidden until the next day or a newer latest); optional per-platform min -> full-screen "Update to continue" drawn over the app (punch sync keeps running underneath), unset by default; nothing shows until appConfig/versions exists. appConfig/versions = {ios:{latest,min}, android:{latest,min}}: signed-in read, no client writes (rules). [Update] = App Store (id 6801155800) / Play Store; the dev app opens TestFlight. Version reporting: supervisor-app punches (appVersion/appPlatform on the event, rules check the shape, write-once) and kiosk punches (kioskPunch) -> onClockEventCreated copies it onto the named device doc; reportAppVersion callable on app open (owner/admin/supervisor/kiosk; employee logins = nothing written; only an existing named device doc). Website Devices list: new "App version" column + amber Outdated tag vs the platform's latest; no report = "Older than 1.1.6" (Outdated once a latest exists); unnamed devices take the version from their newest punch. Employees' phones stay out of Devices.
  - Tests: functions 826/826 (new appVersions + appVersionsRules suites), live-clients compat 14/14, app 357/357, web unit 210 incl. new appVersions; deviceRules 25/25 + deviceTracking 1/1 under emulators (its flag-on pass can't run: functions/.env.local pins DEVICE_TRACKING_ENABLED=false in the emulator - pre-existing; the flag-on path is covered by functions/test/appVersions.test.js).
  - Dev deployed Nov 25: firestore rules + 14 functions (new reportAppVersion; kioskPunch, onClockEventCreated and the rest of the import graph) + dev website. Dev seed: scripts/devSeedAppVersions.js wrote appConfig/versions = {ios:{latest:"1.1.7",min:null}, android:{latest:"1.1.7",min:null}} on orbitworks-dev-ew. Build 33 has no banner code - it shows with the next dev build.
  - PROD release notes: deploy rules + reportAppVersion with the rest; create appConfig/versions on prod BY HAND only after the 1.1.6 store approval (latest "1.1.6"; min unset). Until the doc exists nothing shows.
  - Not built: no admin UI to edit appConfig/versions (Firebase console, per U2).
- Automated double-check before the manual sweep (Nov 25, top branch feature/update-banner; dev only, no prod, no main):
  - Branches: all 7 pushed, local = origin, clean, each contains the one below (0 missing commits); the 2 pro-plan stashes untouched.
  - Tests (emulators, one suite at a time): functions 826/826, live-clients compat 14/14, web unit 208/208 (35 files - the "210" above was a miscount, no test file was removed), deviceRules 25/25, deviceTracking 1/1, app 357/357, web tsc clean, web `npm run build` OK, functions `npm run build` OK.
  - Dev deploy state: firestore + storage rules = the branch's files exactly; 16 Firestore indexes match; dev website source = `git archive HEAD` (487/487 files); all 88 dev functions = the 88 exported on the branch. Each function's deployed source zip was diffed against the branch build over its own import graph: 82 were current; 6 (syncEmployeeAppConfig, backfillEmployeeAppConfig, syncEmployeeSelfView, cleanupEmployeeAlerts, clearEmployeePushToken, registerEmployeePushToken) were from a pre-kiosk deploy (no KIOSK_ENABLED in their env, older flags.js; code they run unchanged) - redeployed to dev by explicit list, now current. Only remaining difference anywhere: the `test` script line in package.json.
  - Dev data (read-only, through lib/reportOvertime + reportComputations + the CSV/Excel builders): A $255, B $735, C $920, D $892.50, E $213 (wages); OT E Nov 17 Laborer $75 / Foreman B $183 / Day total $258 (Worked 10.00, OT 2.00, Tips $45). OT Test Co B had been left Overtime OFF with Nov 20 pending from earlier testing - put back to the seed state first (Overtime ON, Nov 20 approved the way devSeedOvertime.js approves). C and D also carry $32.21 / $67.67 tips from earlier tip testing (their wages are exact).
  - Overtime-OFF regression: main (85a96c1) vs top, same glue, each version's own lib/, all 4 Reports exports (CSV + Excel) - Shipmate (Pro-dev) Nov 2026 (only 4 events on dev), companyA Nov 2026, and OT Test Co + B with Overtime + Tips forced OFF in memory (23 shifts incl. 2-job days). 0 number differences over 1,600 lines/cells; only decided changes: decision 32 labels (Shift Hours / Break / Total Worked) and K8 (the kiosk login left out of the Employees export).
  - Live security (deployed dev rules + functions, real logins): 81/81 - functions/scripts/devLiveSecurityChecks.mjs on Security Test Co (functions/scripts/devSeedSecurity.js: sites A + C, Worker A / Worker C with pending shifts, owner, restricted admin Site A only with every permission but Billing, existing-style admin with no access fields and old claims, supervisor, Employee App login; logins in .dev-seed-logins.local) + the OT Test Co kiosk login. Restricted admin: no direct reads of shifts/approvals, getShiftData = Site A only, site C approve / tip / clock action refused (site A works), can't raise own access (callable or direct write), can't touch the owner or another admin, billing 403. Existing-style admin: every site + approve/tip/export/settings/jobs/job site without createdByUid, billing 403 (owner 200). Kiosk: users/self only (website sends it to /use-app); company doc, employees, self views, jobs, employeePins, pins, clock events, approvals, users all refused; PIN table has no pay / PII / plain PINs; 15 supervisor/admin/employee callables refused. Supervisor app 1.1.4 reads, punches (+ replay), queue backup, push token, device, shift note, getPinSyncTable work. Employee App reads, photo upload + employeeClockPunch in/out work; other employees / company doc refused.
  - Dev app: OrbitsWorks Dev 1.1.6 (34), EAS build 96545cfe (employeeDev, commit 6d7114c = Tasks 5-7 + round 1 fixes + Task 6), IPA checked (com.orbitworks.app.dev, 1.1.6 / 34, iPhone + iPad, appVariant dev, no prod project refs), submitted Nov 25 to the DEV TestFlight (ASC 6826363680, submission 5ab1db39). Emilio tests on 34 instead of 33. Next dev build number = 35.

## Ground rules (all 4 tasks)
- 4 tasks, each on its own branch, stacked on the one before (Task 1 -> Task 2 -> Task 3 -> Task 4). Build order: Task 1 -> Task 2 -> Task 3 (Task 3 needs Task 2's columns modal) -> Task 4 (built last).
- All plans (Free/Core/Pro) unless noted.
- Existing AND new companies: every new toggle defaults OFF, so nothing changes until the company turns it on.
- Feature order inside each task: types -> validator -> hook/API -> components -> page.
- Test on dev (orbitworks-dev-ew) with ShipMate before prod.
- Anything not covered here: ask Emilio before deciding.

---

## TASK 1 - Overtime

### Settings -> Export Settings
```
Overtime                     [toggle, default OFF]
  Weekly overtime after      [40] hrs
  Daily overtime after       [0] hrs   (0 = off)
  Week starts on             [Monday]

Overtime Pay (new section)
  Multiplier                 [1.5x]
  Note: paying OT at the job's rate requires the worker's agreement beforehand

Rounding
  Round daily worked hours   (existing, unchanged)
  Round total worked hours   (existing, unchanged)
  Round overtime hours       [0 = off]  (new)
```
- The Pay multiplier moves OUT of Alerts -> Overtime warning into Overtime Pay. Keep each company's existing value.
- Double time: DROPPED (not building it).

### Titles & Pay
- New optional column per job: "Overtime rate" ($/hr).
- If set, it REPLACES the multiplier for that job.
- If set below 1.5x the job's rate -> show a warning (still saves, never blocks).
```
Laborer  $15.00  OT [blank]  -> $15 x 1.5 = $22.50/hr OT
Foreman  $23.00  OT [$40.00] -> $40.00/hr OT (multiplier ignored)
Foreman  $23.00  OT [$30.00] -> warning: below 1.5x ($34.50)
```

### How OT is calculated (one shared function, unit-tested with the examples below)
1. A shift belongs to the day it STARTED (6pm-2am counts on the start day). Week boundaries use "Week starts on".
2. All shifts on the same day are added together, no matter the gap (no gap setting).
3. OT counts WORKED hours only (tracked breaks + Automatic Break excluded).
4. Daily OT only applies if "Daily overtime after" > 0.
5. No double counting: hours already counted as daily OT do not count again toward weekly OT.
   Weekly OT = max(0, regular hours this week - weekly threshold).
6. OT lands on the shift/day where the threshold is crossed (chronological).
7. OT pay uses the job worked during the OT hours: job's fixed Overtime rate if set, else job rate x multiplier.
8. Est. Pay = (regular hrs x job rate) + (OT hrs x OT rate).
9. OT hours use the "Round overtime hours" setting.
10. Missing clock-out: combine what exists, flag the incomplete shift. Never assume a clock-out time.
11. Approved shifts: OT is FROZEN (does not recalc if settings change). If an edit to an unapproved day would change OT on an already-approved day -> show a warning to re-approve.

Test examples:
```
A) Daily after 8, split shift
   8am-1pm  5h -> OT 0
   2pm-11pm 9h -> OT 6   (5 + 9 = 14, 14 - 8 = 6)

B) Daily 12 + weekly 40, no double count
   Mon 14h -> 12 regular + 2 daily OT
   Tue-Fri 8h x 4 = 32h
   Regular = 12 + 32 = 44 -> weekly OT = 44 - 40 = 4
   Total OT = 2 + 4 = 6

C) Weekly 40, two jobs, OT on Foreman day (Foreman OT rate $40)
   25h Laborer x $15 = $375
   15h Foreman x $23 = $345
    5h Foreman OT x $40 = $200
   Total = $920

D) Same as C but Foreman OT rate blank, multiplier 1.5
    5h x $23 x 1.5 = $172.50 -> total $892.50

E) 2 jobs same day, daily after 8
   7:00am-12:00pm  Laborer 5h x $15          = $75
   12:30pm-5:30pm  Foreman 3h x $23          = $69
                   Foreman OT 2h x $23 x 1.5 = $69
   Day total 10h, 2 OT                       = $213
```

### Export (Summary + Daily Breakdown)
- New "Overtime" column right after Worked Hours, in both tables.
- Overtime toggle OFF -> column blank. ON with no OT -> 0.00.
- Est. Pay includes OT pay.
- Summary Overtime = all daily OT + weekly OT for the period.
- A day with 2+ jobs splits into one row per job plus a day total row. Single-job days stay one row like today.
- The job per shift comes from the existing Job column on Approve Hours (already editable per shift).
```
Nov 12  Laborer  Worked 5.00   OT 0.00  $75.00
Nov 12  Foreman  Worked 5.00   OT 2.00  $138.00
Nov 12  Total    Worked 10.00  OT 2.00  $213.00
```

### Alerts
- Overtime warning: just on/off (numbers now live in Export Settings). WEBSITE ONLY (not the apps). Message: "{Name} has reached overtime ({X}h)".
- Max hours warning: keeps its own "Warning at" number, but counts the COMBINED day total.
```
8am-1pm 5h, clock in 2pm, Max hours 12 -> fires at 9pm (5 + 7 = 12)
```

### Automations
- Automatic Break: deducted ONCE per qualifying day, based on combined day hours.
- Auto clock-out: uses combined day worked hours, only closes the currently open shift, never touches closed pieces. (Update the Cloud Function on dev AND prod.)

### Analytics
- Reads the multiplier from Overtime Pay.
- Shows OT only when the Overtime toggle is on.
- Job Site Cost: OT split by each site's share of hours (5h Site A + 9h Site B, 6h OT -> A 2.14h, B 3.86h).

### Task 1 build steps
1. Settings fields + defaults (useCompanySettings.ts, settingsSearchIndex.ts)
2. Settings UI (Overtime, Overtime Pay, OT rounding) + move multiplier out of Alerts
3. Titles & Pay Overtime rate + warning
4. Shared OT calculation function + unit tests (examples A-E)
5. Export: Overtime column, Est. Pay with OT, split rows for 2-job days
6. Alerts changes
7. Automations (combined day) incl. auto clock-out Cloud Function
8. Approve Hours: frozen OT + re-approve warning
9. Analytics
10. Test on dev with ShipMate

---

## TASK 2 - Approve Hours Customizable Columns

- "Columns" button (gear icon) on the Approve Hours page opens a modal with on/off toggles.
- Saved per COMPANY (all admins see the same columns).
- Max 8 columns, counting Name and Status.
- Required (can't turn off): Name, Status.
- Default: Name, Company, Job, Time, Break, Worked, Status.
- Optional: Site, Overtime Hours, Regular Hours, Clock-in Type, Clock-out Type, Clock-in Device, Clock-out Device. (Tips gets added in Task 3.)
- Clock-in/out Type values: Admin Manual, Employee App, Supervisor App, Quick Link (Temp Clock-In Link).
- Type + Device columns are a PRO perk: shown with a lock on Core, can't be added.
- Show/hide only (no drag-to-reorder).
- All plans.
```
Approve Hours                              [Columns]
| Name | Company | Job | Time | Break | Worked | Status |

Example custom: | Name | Worked | Status |
```

---

## TASK 3 - Tips

- Export Settings toggle "Tips" [default OFF].
- Toggle OFF: Tips field hidden from the Approve Hours modal AND the export.
- Entry: ADMIN ONLY, in the Approve Hours shift modal, PER SHIFT, one dollar amount (no cash/card split).
- Editable before and after approval (editing tips does not change approval).
- Edit history: save EVERY change (amount, admin name, timestamp). Modal shows only "Last edited by {Name}" + an info icon that opens the full history.
- Tips column added to Task 2's Columns modal so tips are visible after approving.
- Export: Tips column in Summary + Daily Breakdown. $0.00 when none. Tips are ADDED INTO Est. Pay.
- 2-job days: the tip stays on that shift's job row.
- Website only (not shown in the employee or supervisor apps).
- All plans.
```
[Shift modal - Juan, Nov 12]
7:00am - 5:00pm   Worked 10.00
Tips  [$ 45.00]
Last edited by Ana Lopez (i)
   $45.00  Ana Lopez  Nov 12 5:42pm
   $40.00  Mark Diaz  Nov 12 5:10pm

Export: Worked 10.00 | OT 2.00 | Tips $45.00 | Est. Pay $258.00 ($213 wages + $45 tips)
```
- Data model (where tips + history are stored): Claude Code proposes, Emilio approves before building. Must follow the tenant (companyId) rules.

---

## TASK 4 - Admin Permissions (site access + what each admin can do) - BUILT LAST

Goal: the owner controls which job sites each admin can see and which actions they can take, e.g. sites A B C D -> Admin 1 gets A + B, Admin 2 gets C + D, and each can only approve their own sites.

### Roles
```
Owner        everything, can't be restricted, edited or removed by anyone
Full access  everything the owner can do (incl. billing + setting Admin permissions)
Admin        only the sites + permissions the owner / Full access gives them
```
- Owner is always on top. Nobody can touch the owner.
- ONLY the owner can give or remove Full access.
- ONLY the owner can edit or remove a Full access admin. Full access admins can't touch each other.
- Full access admins can set permissions for regular Admins.
- Billing IS included in Full access.
- Ownership transfer: NOT in scope for now (removed Nov 25).
- Supervisors are NOT part of this feature (admin-only). A supervisor promoted to admin keeps supervisor app access.
- All plans.

### Permissions modal (Team -> admin row -> Permissions)
```
[ ] Full access   (on = acts like the owner, everything below on + locked)

Job sites:   ( ) All sites (includes new ones automatically)
             (o) Only these: [x] A  [x] B  [ ] C  [ ] D  [ ] Unassigned

Can:         [x] Approve hours
             [x] Create / edit employees
             [ ] Edit pay rates & wages
             [ ] Export payroll
             [ ] Analytics
             [ ] Billing
             [ ] Settings
             [ ] Invite admins / supervisors
```
- Permission list is the current agreed list; Emilio may add more later.
- "Unassigned" = shifts with no job site.
- EXISTING admins when this ships: keep full access (All sites + all permissions), so nothing changes for current customers.

### Rules
1. Shift visibility goes by WHERE THE SHIFT HAPPENED (the shift's site), not the employee's assigned sites. The ADMIN's access is set by the admin's assigned sites.
```
Admin 1 = A + B
Juan  Mon  Site A  8am-1pm   -> Admin 1 sees + can approve
Juan  Mon  Site C  2pm-11pm  -> Admin 1 does NOT see
```
2. Day totals: Admin 1 still sees the employee's FULL day total (all sites combined) so OT makes sense, without the other site's shift details.
```
Admin 1 sees: Juan Mon, Site A 5h | Day total 14h | OT 6h (lands on another site's shift)
```
3. Export payroll is its own permission. When allowed, the export shows EVERYTHING, no matter the site.
4. Alerts: every admin gets all alerts (not filtered by site).
5. Analytics / Overview: NOT filtered by site. The Analytics permission controls who can open the Analytics tab.
6. Creating employees: admins can assign employees to ANY site.
7. Job site creation gets a picker for which admins can see the new site. "All sites" admins see new sites automatically.
8. Pay: every admin can SEE pay rates / Est. Pay / tips. The "Edit pay rates & wages" permission controls whether they can CHANGE them.

### Enforcement (important)
- Hiding things in the UI is not enough. Firestore rules and the server/Cloud Functions must enforce site access + permissions (project rules: real authorization lives in rules/server).
- Data model (where roles, site lists and permissions live; custom claims vs users doc) - Claude Code proposes, Emilio approves before building.

### Open (for Claude Code to propose, Emilio to approve)
- Data model for roles / site access / permissions.
- From Task 3 (D10): editing tips (setShiftTip) falls under "Edit pay rates & wages" AND the admin's site access (only shifts on their sites). Add the server-side check in setShiftTip when Task 4 is built.

---

## Task 1 decisions (Nov 24, 2026 - Emilio)
1. Multiplier/threshold storage: UI-only move. Keep top-level overtimeMultiplier + weeklyOvertimeThreshold, add new fields next to them. No migration.
2. Overtime warning keeps working off the threshold even when the Overtime toggle is OFF.
3. Overtime alert keeps today's supervisor-app push + employee-app alert. Only the message text changes to "{Name} has reached overtime ({X}h)". (Overrides "website only" in the plan.)
4. Combined-day behavior (Automatic Break once per day, Max hours on combined day total, auto clock-out on combined day hours) ONLY when Overtime is ON. OFF = per-shift exactly like today.
5. Auto clock-out combined total subtracts the earlier closed shifts' Automatic Break.
6. Approve Hours job = source of truth. Single-job days: Reports page + Excel Job dropdowns work like today. 2+ job days: those dropdowns are locked and the day splits into rows. Excel jobs lookup gets an OT rate column. Shift with no job -> employee's default job.
7. Job Site Cost splits OT proportionally by hours (plan example). Pay/export stay chronological (rule 6).
8. Analytics uses the Approve Hours job when there is one, else default job.
9. Job Overtime rate gets its own rate history, like rateHistory.
10. Subcontractors: keep no OT premium.
11. Time History Excel (ClockEventLookup): in scope, switch it to the shared OT function.
12. Round overtime hours: same 0/5/15/30-min options, round up, applied per day. Period total = sum of days.
13. Titles & Pay warning: literal 1.5x the job rate (legal floor), not the company multiplier. Warn only, never block.
14. Day/week boundaries: one time zone everywhere. Company time zone field if one exists, else America/Chicago.

Extras:
- Dev-only deploys (orbitworks-dev-ew). Prod is a separate, later decision.
- zod validator + Firestore rules type checks for the new fields.
- On approval, group the week lookup by employee+week (no per-row query in a bulk approve of up to 500).
- lib/overtime.ts applies Automatic Break once per day on combined day hours; the existing per-shift path stays untouched for Overtime OFF.
- Week starts on: any day of the week, default Monday.
- Dev vs prod functions: functions:list match is enough (no source-zip compare). Firebase CLI stays on dev for orbitworks-web.

OT calculation edge rules (Nov 24, 2026, after step 4):
15. Weekly overtime after = 0 means weekly OT is off (same as daily 0).
16. With Overtime ON, the day's Automatic Break comes off the day's last closed shift first (earlier shifts only if it is shorter than the break).
17. OT rounding moves minutes from regular to OT; total worked hours never change.
18. Missing clock-out = 0h + flagged incomplete. Only alerts and auto clock-out count an open shift up to "now".
19. Job title names are limited to 120 characters (zod validator).

Answers after steps 5-6 (Nov 24, 2026):
20. Overtime OFF = no Overtime column at all in any report/export (overrides "OFF -> column blank" in the plan).
21. Employee-app texts stay: Overtime = "You have worked X hours this week."; Max hours with Overtime ON = "... hours today" / "in one day".
22. With Overtime ON, the Overtime warning also fires when daily OT starts (daily overtime after > 0), max once per employee per day, plus the weekly one.
23. Approve Hours per-shift Max hours flag -> combined day with Overtime ON, fixed in step 8.
24. Daily worked rounding on a 2+ job day: the extra rounded minutes go to the last-worked job as regular time.
25. Reports' UTC day grouping (evening shifts on the next day, Overtime OFF paths): left alone on this branch; separate fix after Task 1 (docs/plans/reports-utc-day-grouping-fix.md).

Answers after steps 7-9 (Nov 25, 2026):
26. Analytics with Overtime OFF stays exactly as today (still shows weekly OT x multiplier).
27. Auto clock-out with Overtime ON when the day's earlier shifts already reached the cap: the open shift is closed at its own clock-in time (0h).
28. Frozen OT only exists on sessions approved after this ships with Overtime ON; older approvals stay live until re-approved.
29. (4B) Freeze the rates too: at approval (Overtime ON only), overtimeApplied also stores jobId, rate and the effective OT $/hr (fixed Overtime rate, else rate x multiplier; subcontractors the straight rate) - the job's CURRENT rates at that moment. Reports, CSV, Excel and Time History price approved shifts with these frozen values (Excel: the frozen value applies while the row still shows the approved job; picking another job uses that job's live rates). Analytics keeps its as-of-the-day rate history.
30. Analytics site split: each day's OT (daily + weekly landing that day) is split by that day's site hours.
31. Employee app My Hours still applies Automatic Break per shift - left as is. FOLLOW-UP (own task, needs an app release): employee app My Hours - Automatic Break once per day when Overtime is ON.

Seed fix (Nov 25): example B was seeded wrong (an extra Saturday 8h, 54h -> 14 OT / $915). The function was right: plan B hours give 6 OT with daily 8 (6 daily + 0 weekly) and with daily 12 (2 daily + 4 weekly). B now lives in its own dev company "OT Test Co B" (daily 12, weekly 40, 1.5x, Monday) and matches the plan exactly: 12 regular + 2 daily OT Mon, 4 weekly OT Fri, total 6, $735. Test added for B hours with daily 8.

After step 10 passed (Nov 25, 2026) - hours columns change + fixes:
32. Hours columns, everywhere hours show (Reports Summary + Daily Breakdown, Payroll CSV, Payroll Hours Excel incl. Full Report, Time History Excel; also the Timesheets/Full Report "Summary" sheet): Shift Hours | Break | Regular Hours | Overtime | Total Worked.
    Shift Hours = old Total Hours / Hours; Break = old Break / Total Break Hrs; Regular Hours = NEW = Total Worked - Overtime; Overtime unchanged; Total Worked = old Worked Hours / Total Hours Worked.
    (1A) Renames everywhere; Regular Hours + Overtime only with Overtime ON. Overtime OFF = same numbers and positions as before, only labels (the legacy OFF Time History Overtime column keeps its place: Shift Hours | Total Worked | Overtime).
    Excel: Regular Hours is a live formula (Total Worked - Overtime) on every row incl. Day total rows and summaries.
    (3A) Descriptions as Reports header hover tooltips and Excel header notes: Shift Hours "Total shift duration", Break "Unpaid break", Regular Hours "Hours up to the OT threshold", Overtime "Hours over the OT threshold", Total Worked "Regular + OT". Names/notes live in lib/hoursColumns.ts.
    With Overtime ON, the Summary's Shift Hours and Break come from the same day rows as the other hours columns (Shift - Break = Total Worked, Regular + Overtime = Total Worked).
33. (2A) Summary Hourly Rate = "Mixed" when the employee worked 2+ jobs in the period (Overtime ON: Payroll Hours Excel + Payroll CSV).
34. Excel: the "Estimated Pay (Excluding Break)" column is wide enough for the full header (Payroll Hours, ON and OFF).
35. Excel: Day total rows carry <ignoredErrors formula/formulaRange> so Excel shows no green "inconsistent formula" triangles (exceljs can't write it; lib/xlsxIgnoredErrors.ts adds it to the saved file; jszip added as a direct dependency - it was already installed via exceljs).

---

## Task 2 decisions (Nov 25, 2026 - Emilio, after step 0 recon)
D1. Default columns = today's 8: Name, Company, Site, Job, Time, Break, Worked, Status. (The plan left Site out by mistake - it is already on the table.) Max stays 8 counting Name + Status, so the default is full: adding Type / Device / OT / Tips means turning another column off first. The checkbox and the week-mode Date column don't count.
D2. Regular Hours / Overtime with Overtime OFF: shown greyed out in the modal ("Turn on Overtime in Export Settings"), not drawn in the table; still count toward the 8 while saved; the saved choice comes back when Overtime turns on. Tips (Task 3) works the same way with its own toggle.
D3. Clock-in/out Type values: Admin Manual (adminManual), Employee App (employeeApp), Supervisor App (pin, supervisorPin, supervisorOverride, faceMatch), Quick Link (tempLink), plus "Auto clock-out" (autoClockOut) and "Deactivated" (employeeDeactivated).
D4. Device: supervisor-app punches = device name at punch time (deviceNameSnapshot) or "Unnamed device"; employee-app punches = "Employee's phone"; Quick Link / Admin Manual / auto = "-"; old shifts with no data = "-". No app release. FOLLOW-UP (not this task): record the phone model on employee-app punches with the next app release.
D5. Free plan: Type + Device locked with the PRO pill, same as Core (one isPro check).
D6. Downgrade: Pro columns stay saved but are hidden while not Pro (back on upgrade). firestore.rules refuses saving Pro column keys on a non-Pro plan.
    How it actually works: right after a downgrade the Type/Device columns disappear from the table and show locked (PRO pill, unchecked, can't be added) in the modal, and don't count toward the 8. They stay in approvalsColumns only until someone saves the Columns modal again - that save drops them (the rule refuses them off Pro). Other company saves (Settings page) never touch the field. Upgrading back before a modal save brings them back.
D7. Job column can be turned off, with a modal note that approvals then use the employee's default job. Known risk: columns are per company, so hiding Job removes the job picker for every admin and 2-job days fall back to the default job (changes OT pay). Safer option if needed later: Job required while Overtime is ON.
D8. Storage: top-level company field approvalsColumns (string list of the OPTIONAL keys only; Name + Status implied). Missing field = default. zod validator + firestore.rules type/allowed-keys check. Task 4: changing columns will probably fall under the "Settings" permission - lock in during Task 4.
D9. Owner and any admin can change the columns (supervisors never reach the dashboard).
D10. Type shows the event's original source only (no "edited" marker; edit history stays in Session review).

All D1-D10 picks = option A (the starred recommendation), Nov 25, 2026.
Also fixed: the Approve Hours hours display could show "4h 60m" (minutes rounded separately); it now rounds total minutes first ("5h 0m"). Affects Break / Worked / Regular / Overtime cells.

Dev check (Nov 25, localhost against orbitworks-dev-ew): a, b, c, d, e (OT Test Co B briefly on core2_tier1, back to pro_tier1), g, i OK; c/f/h/j partly (see the checklist below). Dev seed fix: devSeedOvertime.js wrote source "admin" (not a real source) - now "adminManual"; the 46 seeded dev events were changed to match (source field only). Reports totals unchanged after: A $255, C $920, D $892.50, E $213; B $570 (Overtime OFF + Fri Pending from testing).

## Task 3 decisions (Nov 25, 2026 - Emilio, after recon docs/plans/tips-recon.md)
D1. Storage: tip on timesheetApprovals/{clockInEventId} (tipCents, tipUpdatedByUid, tipUpdatedByName, tipUpdatedAt) + full history in timesheetApprovals/{id}/tipEdits/{autoId} (companyId, amountCents, previousAmountCents, admin uid + name, server timestamp). Clients read only (admin/owner, companyId claim); no client writes anywhere.
D2. Write path: new setShiftTip Cloud Function (zod, one transaction, update-only, server-looked-up admin name). Never touches status / approvedBy / overtimeApplied / autoBreak*Applied / job. Creates the approval doc first if missing (same self-heal as approving).
D3. Validation: amount >= 0, max 2 decimals, stored in whole cents, cap $1,000.
D4. Pass check (dev seed, Juan Nov 12 = example E + $45 tip on the Foreman shift): Laborer row $75, Foreman row $183, Day total $258.
D5. Tips go into every pay output, Overtime ON and OFF, all plans: Reports tables, Payroll CSV, Payroll Hours Excel (incl. Full Report), Time History Excel.
D6. Tips follow hours: a pending shift's tip is included/excluded exactly like its hours.
D7. Toggle OFF = hidden in the modal + export, saved tips kept (they come back when turned on).
D8. Analytics site cost stays wages only (no tips).
D9. Deleted shift: approval doc goes, tipEdits history is KEPT for audit (not shown anywhere).
D10. Task 4: tip edits = "Edit pay rates & wages" + the admin's site access (noted under Task 4; not built now).

## Task 4 decisions (Nov 25, 2026 - Emilio, after recon)
D1 (1A). Storage: users/{uid}.adminAccess = { level: "full" | "admin", sites: "all" | [siteIds..., "unassigned"], permissions: { approveHours, employees, editPay, exportPayroll, analytics, billing, settings, invites } } - server-written only (setAdminAccess). Custom claims carry a small fixed-size mirror for the rules: { lvl, allSites, perms } (no site list). Changes reach the browser through the RC1 roleChangedAt refresh.
D2 (2A). Admins with every site (owner, Full access, Admin on "All sites") keep today's direct reads + live listeners. An Admin limited to some sites cannot read clockEvents / timesheetApprovals / tipEdits / siteExits / shiftNotes directly; their pages load through server calls filtered by the SHIFT's site (the clock-in's). Every write callable checks permission + shift site server-side. Rules enforce the permissions that are plain client writes: employees (employees), editPay (jobs + pay fields on employees), settings (company settings fields), invites (invites create). Billing: Stripe routes allow owner / Full access / Billing permission. Requirement: each page keeps ONE hook with the same output shape for both sources (live listeners vs server calls) - no duplicated components.
D3 (3A). Restricted admins get each employee-day's full total + OT from the same server call (plain numbers, no other sites' shift details), computed with the server's shared overtime code.
D4 (4A). getPayrollExportData(range), gated on Export payroll, returns the raw data the export uses today for ALL sites; the browser builds the files as now. Known limit: for an All-sites admin, Export payroll and Analytics are UI-only gates (they can already read every shift).
D5 (5A). setAdminAccess is the only way to change level / sites / permissions: nobody touches the owner; only the owner grants/edits/removes Full access; Full access sets regular Admins only; nobody edits their own access. Same hierarchy checks in setEmployeeRole, setEmployeeActive, deleteEmployee, deactivateEmployeesBulk, deleteEmployeesBulk.
D6 (6A). No migration: missing adminAccess = legacy admin = All sites + all permissions except Billing (D8). New job sites: picker after create adds the site to the chosen admins' lists (server); All-sites admins see it automatically.
D7 (7A). setShiftTip requires Edit pay rates & wages + access to the shift's site (approval doc siteId), for every admin.
D8 (8.1A). Existing admins get every permission EXCEPT Billing (billing stays owner-only for them, nothing changes at ship).
D9 (8.2A). New admins (invited later) start with no sites + no permissions until the owner / Full access sets them. Dashboard shows a clear "No access yet - ask the owner" state, not a broken page.
D10 (8.3A). Time edits (Adjust time, reassign session, Add timestamp, delete session, assign site) = Approve hours.
D11 (8.4A). Titles & Pay (title/rate create/edit) = Edit pay. Job site create/edit = Settings.
D12 (8.5A). Reports for a restricted admin: on-screen tables show only their sites (with full day totals); the export download shows everything (Export payroll).
D13 (8.6A). Overview stays unfiltered (rule 5): restricted admins get it from a server call too.
D14 (8.7). Option 2A confirmed (restricted admins load Approve Hours, Reports, Time pages, Overview, Analytics from the server).
D15 (G1 A). Rule changes only bite on an Admin limited to some sites; supervisor + employee rules and claims stay exactly as today (prod apps). Emulator tests prove the supervisor-app and employee-app reads/writes still pass. G1 sub A: a restricted admin who is ALSO a supervisor (employee isSupervisor) keeps supervisor-level reads (all sites, like any supervisor today); the server still limits their admin actions to their sites.
D16 (G2 A). Invites can't carry access: invites rule refuses access fields; acceptInvite always writes "no sites, no permissions" and never changes an existing owner / Full access account; Team "Make admin" (setEmployeeRole) also starts with no access and the website opens the Permissions modal right after, so the owner sets access straight away. Only setAdminAccess grants access (D5 hierarchy).
D17 (G3 A). A restricted admin with Settings who creates a job site gets it added to their own sites automatically (server trigger on jobSites create; createdByUid enforced by rules = creator). The "which admins can see this" picker is shown only to owner / Full access.
D18 (G4). Alerts: A - alerts stay readable by every admin; alert action buttons move to one server call for EVERY admin (checks Approve hours + shift site); other sites' alerts show "Not your site" on the buttons for a restricted admin. FINAL SWEEP: re-test alert actions for ALL admins (path changes for existing customers). Devices: B - hide the unnamed-devices section for restricted admins. Employee modal: no change.
D19. Team role toggles (Make admin / Supervisor access, setEmployeeRole) = "Invite admins / supervisors" (approved as built, Nov 25).
D20. Quick Links (temp clock links: generate / list / history / revoke) = "Approve hours" (approved as built).
D21. Every Reports download (Timesheets, Employees, Payroll, Attendance, Full Report) and the Time History Excel = "Export payroll" (approved as built).
D22. Job title assignment on an employee = "Create / edit employees"; only the employee's own pay rate field (hourlyRate) also needs "Edit pay rates & wages" (approved as built).
D23. Restricted-admin gaps fixed (Nov 25): (1) the re-approve "OT changed" warning comes from getShiftData (frozen vs live OT with the approval's own settings, computed from every site); (2) the Overtime warning's weekly hours use the all-sites total (getShiftData weekWorkedMinutesThrough, same window + Automatic Break as Approve Hours); (3) every upgrade / billing link (PRO pills, Upgrade to Pro, Fix billing, Crew Access / crew codes) shows to the owner, Full access and the Billing permission only (components/BillingLink.tsx) - everyone else sees "Ask your account owner to upgrade".

---

## TASK 5 - Kiosk mode (shared wall tablet) - PRO
Goal: a wall-mounted tablet employees walk up to and use themselves (clock in/out + breaks), with no supervisor powers. Replaces earlier ideas (company "individual breaks" toggle, per-device toggles, hiding quick actions), all DROPPED.
- One app, 3 modes: Supervisor (existing), Employee (existing), Kiosk (NEW). Same store app. Kiosk LOOKS like the supervisor app with things removed + a few added; reuse supervisor screens/components.
- Setup: a Kiosk is a company login (email + password) set to Kiosk with a website toggle, same as the Supervisor/Admin access toggles. Label: "Kiosk access - Shared tablet: employees clock in/out and take breaks with their own PIN." Technically also an employee record with its own PIN (OK). Signing in on the tablet opens Kiosk mode. The website shows a `Kiosk` tag + the device/account name. Remove = admin deactivates the account.
- Flows (PIN ALWAYS required for every action):
```
Clock in/out: PIN -> photo -> confirmation (same as today, incl. Pro face check)
Start break:  PIN -> [Start break] -> timer -> [End break] / [Back]
End break:    PIN -> [End break] -> back to Home
```
- Break = PIN only, no photo. Not clocked in + tries a break -> BLOCKED "Please clock in first". Wrong PIN -> 45s wait with an on-screen countdown. PINs saved on the device for speed (refreshed when needed), stored safely: salted hash in SecureStore like the employee app, never plain. Offline: queue + sync later like supervisor punches, never blocked.
- Job site: Pro, AUTO-DETECTED from location (same as Pro employee app).
- Exit Kiosk: in website Settings the admin creates an exit "key" = a unique PIN valid for 10 minutes. Enter it on the tablet to leave Kiosk mode. No normal Log out button.
- Kiosk Settings screen: opens with EITHER the 10-min temp key OR an admin's own PIN. Employees can't open it. Contains: Logged in as | Device name (editable) | Dark mode | Notifications | Location permission status | Last synced | App version.
- Kiosk does NOT have: employee list, Reports, create/update employee, supervisor override, Alerts tab, normal Log out.
- Plans: PRO only. Core sees Kiosk access LOCKED (upgrade label). Existing companies using a supervisor login on a wall tablet: leave as is.

---

## TASK 6 - Update banner (app version behind)
- When the device's app version is behind the latest: banner "A new version is available (1.1.5) / You're on 1.1.3 [Update] [x]". [Update] opens the App Store / Play Store.
- The website Devices list shows each device's app version (and the Kiosk/Supervisor tag).
- "Latest version" = a number in Firestore that Emilio updates AFTER the store approves the build.
- Open: which modes (lean: all 3)? Dismiss comes back next open or next day? Banner only, or a forced "Update to continue" below a minimum version? "Outdated" tag on the website Devices list?

---

## TASK 7 - Tablet landscape layout
- For the Kiosk + supervisor app on tablets/big screens. PHONES stay portrait-locked; only tablets rotate.
- Landscape uses the width: stacked cards become a 2x2 grid. Clock-in photo stays upright / best quality in both orientations. No rotation-lock setting. Needs a new store build (app.json orientation, not OTA).

---

## Task 5-7 decisions (Nov 25, 2026 - Emilio, after recon)
Release / branches
- K1. Tasks 5-7 ship in ONE app store build: 1.1.6. 1.1.5 (build 38) stays as is and goes to Apple when RC1 closes; Kiosk is not added to it.
- K2. Stacking: feature/kiosk (Task 5: web + functions + rules + app) -> feature/update-banner (Task 6) -> feature/tablet-landscape (Task 7). App code lives on the stack (identical to employee-app at fe8e6c6). Dev app builds from the stack tip. At release the stack merges into employee-app, then main.
- K3. KIOSK_ENABLED flag (functions param + NEXT_PUBLIC_KIOSK_ENABLED on the web), default OFF. On for dev; stays OFF on prod until 1.1.6 is in the store. Off = no Kiosk toggle, server refuses the kiosk role.
- K4. iPad-only for 1.1.6 (toggle text says iPad). Android later.
Role / data model
- K5. A kiosk = an employee record with server-only `kiosk: true` + a linked login: users.role 'kiosk', claims {role:'kiosk', companyId, employeeId}. loginRoleFor: kiosk wins over admin/supervisor. Linked record: the toggle flips the role; unlinked record: "Email for the kiosk login" sends an invite, accepting it makes a kiosk login.
- K6. Who can turn Kiosk access on/off: same as the Supervisor/Admin toggles (Invites permission, D5 hierarchy when the record is an admin) + Pro + flag. A kiosk login never gets the dashboard.
- K7. Exclusive: Kiosk ON clears Supervisor + Admin (and adminAccess). Refused for a record with an Employee App login (appAccess) or one that is clocked in.
- K8. Kiosk records are excluded everywhere: active/total employee counts + caps, Overview, Time, Approve Hours, Reports + every export, Analytics, alerts, Temp Link/crew pickers, supervisor PIN table, Employee App invites, duplicate checks. The Team list shows it with a `Kiosk` tag. Its own PIN stays reserved (unique) but never works for a punch.
Security
- K9 (3a). Deny by default. firestore.rules notEmployee() -> isStaff() (owner/admin/supervisor) everywhere it gates company-wide access; storage.rules !isEmployeeRole() -> isStaff(). A kiosk reads only employeeAppConfig directly; may CREATE (never read) clock photos in Storage; everything else through callables (getKioskPinTable, kioskPunch, kiosk unlock/exit, device rename). Source 'kiosk' is server-written only. Prod role check before the change (listRoles.js, Nov 25): only owner/admin/supervisor/employee on prod and dev.
- K10 (3b). The website treats a kiosk login like an employee login: redirected away from the dashboard, no company-doc listener.
- K11 (3c A). Old app builds get nothing (rules + callables refuse role 'kiosk'). Prevented in practice by K3 + toggle text "Needs the OrbitsWorks app 1.1.6 or newer on the iPad"; Task 6 covers later versions.
- K12 (3d). Kiosk PIN cache: per-kiosk salt from the server (new salt every sync), sha256(salt:pin) -> employee, stored in SecureStore (WHEN_UNLOCKED_THIS_DEVICE_ONLY). Refreshed on app open, PIN pad focus, every 20 min, reconnect, and after a server PIN rejection. No plain PINs ever leave the server for a kiosk.
- K13. FOLLOW-UP AFTER THIS RELEASE (not built now): supervisor pin_cache gets the same fix (server sends salted hashes, not plain PINs).
Behavior
- K14. Wrong PIN: 45 s wait after 3 wrong in a row, on-screen countdown, survives restart. Server limit per kiosk: 5 tries / 60 s.
- K15. Kiosk sees ALL active employees of the company (no site filter).
- K16. Exit key: 4 digits, reserved in pins/{pin} while valid (never collides with an employee PIN), single use, 10-minute expiry, salted hash in companies/{c}/kioskExitKeys (no client access), made for one chosen kiosk, checked online. Created by owner / Full access / Settings permission.
- K17. Kiosk Settings opens with the key OR a linked admin's own PIN (admin with Settings or Full access; hashes in the synced table flagged canUnlock, so it works offline). Owner uses a key. Supervisors can't. Exit Kiosk = a button inside Kiosk Settings; refused while punches are waiting ("Connect to send N punches first").
- K18. Kiosk Settings: Logged in as | Device name (editable) | Dark mode | Location permission status | Last synced | App version. NO Notifications.
- K19. New source 'kiosk': Clock-in/out Type "Kiosk", Device column = kiosk device name, Session review tag "Kiosk", same labels in exports; Devices list shows `Kiosk` / `Supervisor` tags.
- K20. Pro downgrade (A): toggle locks with an upgrade label; tablet shows "Kiosk needs Pro - ask your admin" once it sees Core; server refuses kiosk punches made after the downgrade (planTierChangedAt from the Stripe webhook), accepts queued punches made before it. Login stays; re-upgrade restores.
- K21 (REVISED Nov 25, Emilio): out of range at a required-geofence site = FLAG, don't block - same as every other punch (geofenceStatus "outside" + the alert), kiosk built that way. Replaces the earlier "blocked, Ask your supervisor or admin" answer, which came from a wrong recon claim (nothing blocks today).
Task 6 (update banner)
- U1. All 3 modes. Dismiss comes back the next day. Optional per-platform minimum version -> full-screen "Update to continue" (unset by default = never forced).
- U2. appConfig/versions = {ios:{latest,min}, android:{latest,min}}; signed-in users read, only Emilio edits.
- U3. Devices list: app version + `Outdated` tag; older builds show "Older than 1.1.6". Version sent with each punch + a small call on app open. Employees' own phones stay out of Devices.
Task 7 (tablet landscape)
- L1. orientation default + expo-screen-orientation locks phones to portrait at start; iPad allows all orientations (Split View). 2x2 grid on Kiosk Home + Supervisor Dashboard; other screens get a max width. Clock photo checked upright in both orientations on a real iPad (incl. server face check).

## Final combined test checklist (after Task 4, before prod)
Things that could not be tested on dev for Task 2, and what each needs:
- Re-approve warning with custom columns: an approved shift WITH frozen OT (approved after Task 1, Overtime ON), then an edit to an earlier unapproved day of the same week that moves its OT. The seeded approvals have no frozen OT (seed writes them directly) - approve/re-approve one in the UI first.
- Clocked In badge with custom columns: an employee clocked in right now (open shift today) - needs a real open clock-in from the supervisor app or employee app on a dev test company (Add Timestamp entries always have a clock-out, so they can't show it).
- Second admin sees the same columns: a second admin login in the same test company (invite one to OT Test Co).
- Type labels Supervisor App / Quick Link / Employee App / Auto clock-out: punches from the supervisor app (pin / supervisorPin / supervisorOverride), a temp clock-in link, the employee app, and an auto clock-out in one test company. Dev today: only Shipmate (Pro-dev) has employeeApp + autoClockOut events (no login on hand); nobody on dev has supervisor-app or tempLink punches.
- Test company for the restricted-admin checks below (Nov 25): Security Test Co (functions/scripts/devSeedSecurity.js) - Site A + Site C, Worker A (site A) / Worker C (site C) with pending shifts Nov 23-24, restricted admin "Ada Restricted" (Site A only, every permission but Billing), existing-style admin "Lee Legacy" (no access fields), supervisor, Employee App login; logins in functions/scripts/.dev-seed-logins.local. The live server-side checks already pass (functions/scripts/devLiveSecurityChecks.mjs, 81/81) - what's left is the browser view. Re-run that script + liveClientsCompat right before prod.
- Admin Permissions (Task 4) D23: restricted admin (site A) - approve a site-A shift with OT, then edit an earlier site-C shift of the same week so its OT moves -> the re-approve warning shows on the site-A row; Overtime warning fires on the week's all-sites hours (site C hours count); upgrade / billing links: owner + Full access + Billing permission see links, an admin without Billing sees "Ask your account owner to upgrade" (PRO pills not clickable) on Sites, Devices, Analytics, Job site report, Crew Access, past-due banner, upgrade toast.
- Admin Permissions (Task 4), browser checks on dev: ALERT ACTIONS + Time page clock in/out/break for ALL admins (path changed for existing customers - now the adminClockAction server call); a restricted admin (sites A only) on Approve Hours / Reports (screen = their sites + "All sites that day" line, downloads = every site with Export payroll) / Time / Overview (unfiltered) / Analytics; Permissions modal (owner vs Full access vs Admin; Full access read-only to a Full access admin); Make admin opens the modal; "No access yet" page; new job site picker + a restricted creator gets their new site; nav hides Analytics / Billing / Settings without the permission; billing for a Full access admin.
- Tips (Task 3), browser checks on dev (OT Test Co, Tips ON): Session review Tips field save/edit before AND after approval (status, job, frozen OT unchanged), "Last edited by" + (i) history order, $0 / 2 decimals / $1,000.01 refused; Columns modal Tips greyed while Tips OFF; Reports + Payroll CSV/Excel + Full Report + Time History show Tips before Est. Pay with OT ON and OFF; Tips OFF hides the field + every Tips column and Est. Pay drops back to wages (saved tips come back when ON); a pending shift's tip stays out of Reports until approved; supervisor never sees tips.
- Device names: supervisor-app punches from a NAMED device (Settings > Devices) and from an unnamed one ("Unnamed device"); employee-app punches show "Employee's phone".
- RESOLVED Nov 25 (was MUST EXPLAIN BEFORE PROD) - live-clients compat test: the 2 failures ("website admin/owner: jobs, job sites, subcontractors") came from Task 4 rule D17 requiring createdByUid on a new job site, which the live prod website never sends. Fix: required only for a restricted admin (they only exist after the new website ships); owner / Full access / all-sites admins may leave it out, and fillJobSiteCreator (new trigger, onDocumentCreatedWithAuthContext) fills it from the writer's uid - checked on dev with a real login (created without it -> filled with the creator). Compat 14/14. At prod release deploy fillJobSiteCreator together with the rules. Still re-run liveClientsCompat against the final rules right before prod.
- Kiosk (Task 5) on an iPad, dev build 32 (1.1.6): docs/plans/kiosk-ipad-test-list.md (seed: functions/scripts/devSeedKiosk.js, logins in functions/scripts/.dev-seed-logins.local). K21 decided: flag, don't block.
