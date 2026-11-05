# Phase 9 website test run (website catch-up)

Website only, plus the employee app to make the data. Dev only
(orbitworks-dev-ew). No new phone build is needed: everything here uses the
combined post-Phase-8 build already on TestFlight.

- Website: https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app
- Test companies: jc-test-pro-dev (Pro) and jc-test-core-dev (Core) only.
  Logins: test/dev-e2e/creds.json. Website: jc-pro-owner. Employee:
  jc-pro-emp. Supervisor app: jc-pro-sup.
- Before the run: the Phase 9 dev deploy (rules + functions + dev site -
  see the Phase 9 report).
- After each test send "done <#>". I check dev read-only and answer OK or
  FAILED.
- Done when: Group W passes - one employee's full week reviewed and
  approved on the website without opening Firestore.

## Step 0. Setup (website, as jc-pro-owner)

- jc-pro-emp assigned to Site A (geofence ON, 300 ft - same as Phase 8).
- At least one subcontractor (Sub Co) with one active employee in it, for
  Group R.
- Settings > Alerts: "Left the job site" ON.

---

## Group W. The full week (THE done-when test)

Make one week of data for jc-pro-emp (Mon-Fri of one week). Real phone
punches where the step says "phone"; the website's Add timestamp
(Timesheet Approvals) is fine for plain hours on days that need nothing
special.

| Day | What to do | Makes |
|---|---|---|
| Mon | phone: clock in, write a shift comment, break 10 min, clock out | comment, break |
| Tue | phone: airplane mode ON, clock in, wait 10 min, airplane OFF; later clock out | Synced late |
| Wed | phone: clock in at Site A; walk out 10 min and back (red); take a break and walk out 5 min (gray, on break); step out and back in under 3 min after the notification (gray, short); clock out | left site red + gray |
| Thu | Add timestamp: clock in 10:00 PM, clock out 2:00 AM Fri (or phone, if you work it) | cross-midnight shift |
| Fri | Settings > Automations: auto clock-out ON, 1 h. phone: clock in, wait for the auto clock-out. Put it back after | auto clock-out |

### W1. Time Tracking, day by day (no Firestore)
- Do: Time Tracking > Day view, Mon to Fri, for jc-pro-emp's rows.
- See:
  - Every row: photo (or "Photo removed" / "No photo"), Source "Employee
    app" (Add timestamp rows: "Admin manual").
  - Mon: the comment in the clock-in row's Note.
  - Tue: "Synced late" tag on the late punch(es).
  - Wed: red "Left the job site from ... - ..." and gray "(on break)" and
    "(short)" lines on the clock-in row.
  - Thu: click the 10 PM clock-in -> the detail window shows the 2 AM
    clock-out (NOT "Still clocked in"). Fri day view: click the 2 AM
    clock-out -> it shows the 10 PM clock-in (NOT "No matching clock in").
  - Fri: the auto clock-out row; its detail window says Source "Auto
    clock-out" (before Phase 9 the detail window said "Unknown").
- [ ] OK  [ ] FAILED

### W2. Approve Hours, week view (no Firestore)
- Do: Timesheet Approvals > Week, the same week.
- See:
  - Mon: a gray comment icon on the row (not yellow/red); clicking it
    shows "Shift details" with the comment.
  - Tue: yellow warning; the window shows "Synced late" with "Clock in: N
    min late" (and/or clock out).
  - Wed: red warning; the window shows "Left the job site" (red line) and,
    below, "Other job site times (no warning)" with the on-break and short
    lines; the comment card if any.
  - Thu: one session 10 PM - 2 AM with 4 h, on Thursday.
  - Fri: the auto clock-out warning as before.
- [ ] OK  [ ] FAILED

### W3. Approve the whole week
- Do: Select all five sessions, Approve.
- See: all approved; nothing needed from Firestore to decide.
- [ ] OK  [ ] FAILED

### W4. Reports + Excel for the week
- Do: Reports, Mon-Fri, Refresh. Export > Excel (full report). Open it.
- See:
  - Reports page: "Job site exits" table at the bottom with Wednesday's 3
    stretches (red one red, two gray).
  - Excel Detail: "Left site (min)" for Wednesday = the red minutes and
    "(1x)"; "Tracking off (min)" 0; "Synced late" = Yes on Tuesday; other
    days blank in the left-site cells.
  - Excel "Job site exits" sheet: one row per stretch with What / From /
    To / Minutes / Flag (Red / Gray).
  - Excel Photos: thumbnails; any removed photo says "Photo removed".
  - Thursday's session counted once, on Thursday.
- [ ] OK  [ ] FAILED

---

## Group E. Employees page

### E1. One invite form, each role
- Do: Employees > "Invite someone". Send one of each: Employee (app) with
  a job site, Supervisor with two job sites, Admin.
- See: one form; the fields change with the role (one site / many sites /
  none). Each invite appears in its own list below (App invites,
  Supervisors, Admins) exactly as before, with resend / cancel working.
  "N of M seats left" shows for every role (an admin takes a seat too).
- [ ] OK  [ ] FAILED

### E2. A role that can't be used is greyed with the reason
- Do (I do it on dev): set jc-test-pro-dev to 0 seats left (or use a
  company at its cap). You: open the invite form.
- See: Employee (app), Supervisor AND Admin all show "(not available)";
  picking one shows "No seats left on your plan..." and Send is disabled
  (J1 a). I put the seats back.
- Do (Core company jc-test-core-dev, if its plan has no app invites):
  Employee (app) greyed with "Employee app invites need a Core or Pro plan."
- [ ] OK  [ ] FAILED

### E3. Pending invite for the same email (either role)
- Do: Send a Supervisor invite to an email that already has a pending
  Admin invite.
- See: "There's already a pending invite for that email." Nothing new.
- [ ] OK  [ ] FAILED

### E4. Possible duplicate flag
- Do: With the app, sign up through a crew code as a NEW person with the
  same name and birthday as an existing jc-test-pro-dev employee.
- See (Employees page): the new row has an amber "Possible duplicate"
  badge. Edit window: "Possible duplicate" box naming the other employee
  with an "open" link (opens their record). Sign-up worked normally.
- Do: Back on the new one, "Not a duplicate - dismiss".
- See: badge and box gone. I check: dismissedDuplicateOf + who/when saved,
  the other employee untouched.
- [ ] OK  [ ] FAILED

### E5. Subcontractor shown
- Do: Employees page, company filter = Sub Co.
- See: Sub Co's employees, Company column says Sub Co (no change - check
  only).
- [ ] OK  [ ] FAILED

---

## Group R. Reports company filter

### R1. One filter for everything
- Do: Reports, a range with both in-house and Sub Co hours. Company: All,
  then in-house, then Sub Co.
- See: every section (cards, charts, payroll, daily, notes, job site
  exits) and every export follow the pick. In-house / Sub Co hide the
  supervisor site notes (those show only under All companies). The filter
  only shows when the company has subcontractors.
- [ ] OK  [ ] FAILED

---

## Group O. Overview

### O1. "Left the job site" card
- Do: jc-pro-emp clocked in at Site A, walk out (stay out). Open Overview.
- See: the card with "Outside now - jc-pro-emp - left Site A at <time>".
  Walk back: the person moves out of "Outside now" and stays in today's
  list with the red line. Breaks / short show gray. No card on a day with
  no exits.
- [ ] OK  [ ] FAILED

### O2. Outside since yesterday (night shift, J3 a)
- Do: jc-pro-emp clocked in before midnight, walk out before midnight and
  stay out past it (or I set one open exit's startMs to yesterday on dev).
  Open Overview after midnight.
- See: "Outside now" still lists them ("left Site A at <yesterday's
  time>"). Today's list below does not show yesterday's stretch.
- [ ] OK  [ ] FAILED

---

## Group C. Crew Access

### C1. Crew code list
- Do: Crew Access > Crew onboarding.
- See: a Geofence column ("On - 300 ft" / "Off", from the code's site);
  active codes have "Copy link" (says Copied, pastes the same link as the
  Info window); dead codes have no Copy link.
- [ ] OK  [ ] FAILED

### C2. Temp links
- Do: Crew Access > Temporary clock-in link, make two links.
- See: "Active temp links (2)".
- [ ] OK  [ ] FAILED
