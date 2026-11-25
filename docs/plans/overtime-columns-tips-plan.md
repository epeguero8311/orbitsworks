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
- Task 2: built + dev-checked on feature/approve-columns (e7d41b3; rules deployed to dev Nov 25). Task 3 next on feature/tips.

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
D2. Regular Hours / Overtime with Overtime OFF: shown greyed out in the modal ("Turn on Overtime in Export Settings"), not drawn in the table; the saved choice comes back when Overtime turns on. Tips (Task 3) works the same way with its own toggle.
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

Dev check (Nov 25, localhost against orbitworks-dev-ew): a, b, c, d, e (OT Test Co B briefly on core2_tier1, back to pro_tier1), g, i OK; c/f/h/j partly (see the checklist below). Dev seed fix: devSeedOvertime.js wrote source "admin" (not a real source) - now "adminManual"; the 46 seeded dev events were changed to match (source field only). Reports totals unchanged after: A $255, C $920, D $892.50, E $213; B $570 (Overtime OFF + Fri Pending from testing).

---

## Final combined test checklist (after Task 4, before prod)
Things that could not be tested on dev for Task 2, and what each needs:
- Re-approve warning with custom columns: an approved shift WITH frozen OT (approved after Task 1, Overtime ON), then an edit to an earlier unapproved day of the same week that moves its OT. The seeded approvals have no frozen OT (seed writes them directly) - approve/re-approve one in the UI first.
- Clocked In badge with custom columns: an employee clocked in right now (open shift today) - needs a real open clock-in from the supervisor app or employee app on a dev test company (Add Timestamp entries always have a clock-out, so they can't show it).
- Second admin sees the same columns: a second admin login in the same test company (invite one to OT Test Co).
- Type labels Supervisor App / Quick Link / Employee App / Auto clock-out: punches from the supervisor app (pin / supervisorPin / supervisorOverride), a temp clock-in link, the employee app, and an auto clock-out in one test company. Dev today: only Shipmate (Pro-dev) has employeeApp + autoClockOut events (no login on hand); nobody on dev has supervisor-app or tempLink punches.
- Device names: supervisor-app punches from a NAMED device (Settings > Devices) and from an unnamed one ("Unnamed device"); employee-app punches show "Employee's phone".
