# Phase 7 phone test run (alerts + push) - iPhone

Runs on the ONE combined build after Phase 8 (D18), after
test-run-phase6.md and before test-run-phase8.md (same build, same
TestFlight install). Dev only (orbitworks-dev-ew). Keep "Require geofence"
OFF on the sites used here (see test-run-phase6.md).
Android is tested in Phase 10 (Android has no server push until then).

- App: OrbitsWorks Dev (com.orbitworks.app.dev), TestFlight, the combined
  post-Phase-8 build.
- Website: https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app
- Test companies: jc-test-pro-dev (Pro) and jc-test-core-dev (Core) only.
  Logins: test/dev-e2e/creds.json. Employee logins: jc-pro-emp (Pro) and the
  Core employee (Core).
- Before the run: dev functions, rules and indexes deployed from
  employee-app (Phase 7 commits). Apple push key set up for the dev app
  (see the Phase 7 report, "by-hand iOS steps").
- After each test send "done <#>". I check dev read-only (Firestore, logs,
  website) and answer OK or FAILED.
- Break reminders are notifications the phone schedules itself (they work
  with no signal). Shift ending, still clocked in, max hours and overtime
  come from the server's alert check, which runs every 15 minutes - wait
  up to 15 minutes for those.
- A push never slows a punch or a break: every punch still shows the green
  screen at once, whatever happens with notifications.

## Step 0. Settings (website, as jc-pro-owner, Settings > Alerts)

So the tests don't take all day. Put them back after the run.
- Max break time warning: ON, Warning after: 6 minutes.
- Missed clock out alert: ON, Alert after: 5 minutes.
- Business hours close: 20 minutes from when you start Group S (change it
  again before each S test if needed).
- Max hours warning: ON, Warning at: 1 hour (Group M).
- Overtime warning: ON, Warning at: 2 hours (Group M).

---

## Group N. Notification permission + push token

### N1. Asked once, after the first clock-in green screen
- Do: Delete the app, reinstall from TestFlight, sign in as jc-pro-emp.
  Clock in (PIN + photo). Let the green screen close (tap or 3 s).
- See: no notification question before or during the punch; the green
  screen shows at once as before. After it closes and Home shows: "Get
  break and shift reminders" with Not Now / Allow. Tap Allow, then the
  phone's own prompt -> Allow. Clock out and in again: no question again.
- I check: employeePushTokens/{jc-pro-emp} has this phone's token.
- [ ] OK  [ ] FAILED

### N2. Deny, then fix in Settings
- Do: Reinstall, sign in, clock in, on the question tap Allow then the
  phone's "Don't Allow". Start and end a break. Then Settings tab >
  Notifications switch on -> the iPhone Settings page opens -> allow
  notifications -> back to the app (don't close it).
- See: the break works normally while denied (no reminders). The switch is
  on when you come back.
- I check: no token while denied; token saved within a few seconds of
  coming back.
- [ ] OK  [ ] FAILED

### N3. Not Now never blocks anything
- Do: Reinstall, sign in, clock in, tap Not Now. Start break, end break,
  clock out.
- See: every punch and break as normal; no second question on later
  clock-ins (Settings switch is the way to turn it on).
- [ ] OK  [ ] FAILED

### N4. Shared phone: sign-out clears, next employee only
- Do: Signed in as jc-pro-emp with notifications allowed: Settings > Log
  out. Sign in as the Core employee on the same phone, allow
  notifications (clock in once). Then website (admin, Pro): add a manual
  clock-in for jc-pro-emp 2 hours ago (Max hours is 1 h from Step 0) and
  wait up to 15 minutes.
- See: this phone gets nothing for jc-pro-emp. Log out of the Core
  employee in Airplane Mode: log out still finishes within about 3 s.
- I check: after the first log out jc-pro-emp has no token; after the
  Core sign-in the token is only on the Core employee.
- [ ] OK  [ ] FAILED

---

## Group B. Break reminders (6 minute limit from Step 0)

### B1. Online break, all three reminders
- Do: Clocked in, Start break, lock the phone. Wait 11+ minutes.
- See: at +1 min "5 minutes left", at +6 "Break time is up", at +11
  "Break over limit" (one each, never repeated). End break.
- See after: Alerts tab shows those 3 rows, newest first, each with its
  "why" line (break limit 6 minutes).
- [ ] OK  [ ] FAILED

### B2. Offline break start and end
- Do: Airplane Mode ON. Start break (shows "Will sync when online"). Lock
  the phone. After "5 minutes left" shows, unlock and End break (still
  offline). Wait 10 more minutes. Airplane Mode OFF.
- See: "5 minutes left" shows while offline; "Break time is up" and
  "Break over limit" never show. Alerts tab: only "5 minutes left" for
  this break.
- [ ] OK  [ ] FAILED

### B3. Break ended early: nothing more
- Do: Start break, End break after 30 seconds. Wait 12 minutes.
- See: no reminders at all for that break.
- [ ] OK  [ ] FAILED

### B4. Toggle off = no reminders
- Do: Website: Max break time warning OFF. App: Start break, wait 12
  minutes, End break. Turn it back ON.
- See: no break reminders.
- [ ] OK  [ ] FAILED

### B5. App killed during a break
- Do: Start break, swipe the app away (kill it). Wait 7 minutes.
- See: "5 minutes left" and "Break time is up" still show. Open the app,
  End break: "Break over limit" never shows.
- [ ] OK  [ ] FAILED

---

## Group S. Shift ending + still clocked in (Missed clock out alert ON)

### S1. Shift ending
- Do: Clock in before close (Step 0: close ~20 min from now). Keep the app
  closed. Wait until close.
- See: between 15 and 0 minutes before close, push "Shift ending soon" -
  "Your company closes at <time>. Remember to clock out when you finish."
  Tap it: the app opens on the Alerts tab, the row shows the "why" line.
- [ ] OK  [ ] FAILED

### S2. Still clocked in, once
- Do: Stay clocked in past close + 5 minutes, then 30 more minutes.
- See: one push "Still clocked in" about 5-20 minutes after close, never a
  second one for this shift. Clock out after.
- [ ] OK  [ ] FAILED

### S3. Toggle off = neither
- Do: Website: Missed clock out alert OFF. Repeat S1 + S2 on a new shift.
  Turn it back ON.
- See: no shift ending, no still clocked in push, nothing new in the
  Alerts tab.
- [ ] OK  [ ] FAILED

### S4. Shift started after close
- Do: With close already past, clock in. Wait 30 minutes.
- See: no shift ending and no still clocked in for that shift.
- [ ] OK  [ ] FAILED

---

## Group M. Max hours + overtime (1 h / 2 h from Step 0)

### M1. Max hours (day shift), employee + admin
- Do: Clock in, wait 1 h 15 min.
- See: push "Max hours" - "You have worked 1.x hours this shift." Alerts
  tab row with the why line. Website Overview: the usual Max Hours alert
  for jc-pro-emp (once).
- [ ] OK  [ ] FAILED

### M2. Max hours on an overnight shift
- Do: Website (admin): with jc-pro-emp clocked out, add a manual clock-in
  for them at 11:00 PM yesterday (no clock-out). Wait up to 15 min.
- See: phone push "Max hours" for that shift; website shows a Max Hours
  alert dated yesterday. Before Phase 7 neither happened. Clock them out
  on the website after.
- [ ] OK  [ ] FAILED

### M3. Overtime
- Do: Total this week over 2 h (M1/M2 shifts count). Wait up to 15 min.
- See: one push "Overtime" - "You have worked N hours this week."; one
  Alerts row; no second one this week.
- [ ] OK  [ ] FAILED

### M4. Toggles off = no push
- Do: Website: Max hours warning OFF and Overtime warning OFF. Clock in for
  1 h 15 min. Turn both back ON.
- See: no max hours or overtime push; no new Alerts rows.
- [ ] OK  [ ] FAILED

---

## Group A. Alerts tab

### A1. Own alerts only, merged, newest first
- Do: Signed in as jc-pro-emp after the groups above. Open Alerts.
- See: server alerts (shift ending, still clocked in, max hours, overtime)
  and this phone's break reminders in one list, newest first, each with
  title, time, message and why. Nothing from other employees. No mock rows
  ("Clock In Reminder", "Break Ending Soon") anywhere. Pull nothing, edit
  nothing - read only.
- [ ] OK  [ ] FAILED

### A2. Other employee on the same phone
- Do: Log out, sign in as the Core employee, open Alerts.
- See: none of jc-pro-emp's alerts or break reminders.
- [ ] OK  [ ] FAILED

### A3. Offline
- Do: Airplane Mode ON, kill and reopen the app, open Alerts.
- See: the tab opens (no endless spinner); break reminders from this phone
  still show.
- [ ] OK  [ ] FAILED

---

## Group W. Wrong PIN at sync (admin alert)

### W1. First lost punch alerts the admin once
- Do: jc-pro-emp clocked out, app open online. Airplane Mode ON. Website
  (admin): change jc-pro-emp's PIN. On the phone (still offline) clock in
  with the OLD PIN - the phone accepts it, it doesn't know about the change
  yet. Airplane Mode OFF.
- See: the punch shows "Couldn't sync, please speak to your supervisor."
  on the Sync tab. Website Overview: one "Wrong PIN at Sync" alert for
  jc-pro-emp right away (the 1st, not the 3rd) - "A punch saved offline
  had a wrong PIN when it synced and was not recorded."
- Then: same steps once more the same day (change the PIN again while
  offline, punch with the previous one). Still ONE alert for today.
- Remove the refused punches on the Sync tab after.
- [ ] OK  [ ] FAILED
