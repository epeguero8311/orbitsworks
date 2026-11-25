# OrbitsWorks - Overtime, Approve Hours Columns, Tips (Plan)

Planned: Nov 24, 2026. Status: planning done, no code yet.

## Ground rules (all 3 tasks)
- 3 separate tasks, each on its own branch off main. Build order: Task 1 -> Task 2 -> Task 3 (Task 3 needs Task 2's columns modal).
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
