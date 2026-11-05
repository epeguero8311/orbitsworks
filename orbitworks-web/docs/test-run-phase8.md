# Phase 8 phone test run (leaving the job site, Pro) - iPhone

Runs on the ONE combined build after Phase 8 (D18), after test-run-phase6.md
and test-run-phase7.md on the same install. Dev only (orbitworks-dev-ew).
Android is tested in Phase 10.

- App: OrbitsWorks Dev (com.orbitworks.app.dev), TestFlight, the combined
  post-Phase-8 build (expo-task-manager + background location in it).
- Website: https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app
- Test companies: jc-test-pro-dev (Pro) and jc-test-core-dev (Core) only.
  Logins: test/dev-e2e/creds.json. Employee: jc-pro-emp (Pro), the Core
  employee (Core). Supervisor app: jc-pro-sup on a second phone (Group S).
- Before the run: Phase 8 dev deploy done (indexes, rules, functions, dev
  site - see the Phase 8 report).
- After each test send "done <#>". I check dev read-only (Firestore
  siteExits / alerts / employeeAlerts / employeeConsents, logs, website) and
  answer OK or FAILED.

The hard rule, checked in every test: nothing here ever stops a clock-in,
a clock-out or a break, and nothing here ever clocks anyone out. Every punch
still shows its green screen at once.

How it works (so the times make sense):
- Only while clocked in from the employee's own phone, at a Pro company,
  at a job site with "Require geofence" on. Stops at clock-out.
- The phone uses an iPhone "region" (no continuous GPS). When the phone
  says you left, the app takes ONE fresh fix. "Left" counts after 2 minutes
  outside: the "You have left the job site" notification is scheduled for
  2 minutes after you left, and the record waits 2 minutes before it syncs.
  Coming back within the 2 minutes cancels both (F2 a).
- Back within 3 minutes of leaving = a gray "(short)" line (F1 b). On a
  break = gray "(on break)", no alert (E1). A gap the phone couldn't track =
  gray "Tracking off".
- The iPhone can be a few minutes late telling the app you left or came
  back. Walk well past the radius and wait.

## Step 0. Setup (website, as jc-pro-owner)

- Site A: an active site whose address is where you test, picked from the
  suggestions (map pin). Sites > Edit: Require geofence ON, radius 300 ft.
  Check the help text under the switch says it FLAGS and never blocks.
- jc-pro-emp: assigned to Site A only.
- Settings > Alerts: "Left the job site" ON (default).
- Phone: notifications allowed for OrbitsWorks Dev (Phase 7 N1).
- "Walk out" below = walk at least 200 m (650 ft) from Site A's pin and stay
  out the time given. "Walk back" = to the pin itself.

---

## Group P. Consent + Always (the walk-through)

### P1. Asked once, just in time, after the first Pro clock-in at Site A
- Do: Reinstall the app, sign in as jc-pro-emp. Clock in at Site A. Let the
  green screen close. Answer the notifications question (Allow).
- See: nothing about location before or during the punch. After the
  notifications question: the "Job site alerts" screen with the consent
  text and a box to tick. Agree stays grey until the box is ticked. Agree ->
  "Allow Always location" -> Allow Always -> the phone's "Allow While Using"
  prompt (if not given yet) -> then the phone's "Change to Always Allow"
  prompt -> Change to Always Allow. The screen closes. Clock out, clock in
  again: the screen does not come back.
- I check: employeeConsents/{jc-pro-emp} has locationConsentVersion
  employee-location-2026-11-04-v1 and locationPrivacyVersion 2026-11-04-r6.
- [ ] OK  [ ] FAILED

### P2. "Keep Only While Using", then the iPhone walk-through
- Do: Reinstall, sign in, clock in at Site A, Agree, Allow Always, then on
  the phone's prompt pick "Keep Only While Using".
- See: the "Turn on Always in Settings" steps (Open Settings, Location,
  Always, Precise Location on, come back). Tap Open Settings, do the steps,
  come back to the app.
- See: the screen closes by itself when you come back with Always on.
  Settings tab > Location access shows "Always".
- [ ] OK  [ ] FAILED

### P3. Not now = the whole shift is gray "tracking off" (E2)
- Do: Reinstall, sign in, clock in at Site A, on the consent tap Not now.
  Stay clocked in 5 min, clock out.
- See: Home shows the orange "Job site alerts are off. Tap to turn on
  Always location." banner while clocked in. Punches normal.
- See (website, Time Tracking, that day): the clock-in row's Note shows a
  gray "Tracking off from <clock-in> - clock-out <time> (location
  permission off)". No red flag. No Overview alert.
- [ ] OK  [ ] FAILED

### P4. Fix it from the banner mid-shift
- Do: Clock in at Site A (still no consent from P3). Tap the orange banner,
  Agree, Allow Always. Then walk out (5 min) and back.
- See: the banner goes away. The gray "Tracking off" ends at the time you
  finished, then a normal red "Left the job site" line (Group W).
- [ ] OK  [ ] FAILED

### P5. Re-consent (consent version / privacy r6)
- Do (I do this on dev): set jc-pro-emp's employeeConsents
  locationConsentVersion to an old value. You: Settings tab > Location
  access.
- See: the consent screen again (not just Always). Agree -> closes (Always is
  already on).
- See (website, as jc-pro-owner, first visit after the deploy): the Terms
  re-accept prompt (terms/privacy version r6). Accept it.
- [ ] OK  [ ] FAILED

### P6. Sign-up copy
- Do: New sign-up through a crew code link up to "Share your location".
- See: the text mentions job site geofences and "only after you agree";
  the phone's prompt is the normal While Using one (no Always at sign-up).
- [ ] OK  [ ] FAILED

---

## Group W. The real walk out and back

### W1. Walk out and back (THE done-when test)
- Do: Clocked in at Site A (P1 done). Lock the phone, put it in a pocket.
  Walk out, stay out 10 min, walk back, stay 5 min. Then open the app.
- See: about 2 min after you crossed the edge (can be a few minutes later -
  iPhone), the notification "You have left the job site - You left Site A.
  It is noted on your shift - you are still clocked in." Still clocked in.
- See (website, Time Tracking > that day): the clock-in row's Note has a
  red "Left site" line "Left the job site from <left> - <back>". Event
  detail (Clock in side) shows the same. Overview shows "jc-pro-emp - Left
  Job Site" with "Left Site A at <time> (<distance> away)". The app's
  Alerts tab shows "You have left the job site".
- Write down the times you left and came back. They should match within a
  few minutes.
- [ ] OK  [ ] FAILED

### W2. Timesheet Approvals red flag
- Do: Clock out (after W1).
- See (website, Timesheet Approvals, that day): the session has a red
  warning; the modal shows "Left the job site" with the same line and "A
  flag only - the hours are not changed." Hours = clock-in to clock-out as
  usual.
- [ ] OK  [ ] FAILED

### W3. Back within 2 minutes = nothing (F2 a)
- Do: Clock in at Site A. Walk just past the edge, come straight back
  (under 1 min outside). Wait 5 min.
- See: no notification, nothing on the website, nothing in Alerts.
- [ ] OK  [ ] FAILED

### W4. Short exit = gray "(short)" (F1 b)
- Do: Walk out, wait for the notification (about 2 min), then walk back
  quickly so you are back inside under 3 min after you left.
- See: the notification still came. Website line is GRAY "Left the job
  site from <a> - <b> (short)"; no red Timesheet Approvals warning for it.
- [ ] OK  [ ] FAILED

### W4b. A short exit never stays an alert (G3 c)
- Do: Right after W4, with signal, open the website Overview and the
  supervisor app Alerts tab (second phone, jc-pro-sup). Wait 1 min after
  you are back inside with the app open.
- See: the "Left Job Site" entry for the W4 exit may show for a moment (it
  is made when the exit syncs, before the return is known), then is GONE
  from the Overview and from the supervisor Alerts tab once the return
  syncs. The employee's own Alerts tab entry ("You have left the job
  site") and the phone notification stay as they were.
- I check: alerts has no left-<exitId>-* doc for the W4 exit;
  employeeAlerts/leftSite-<exitId> still there.
- [ ] OK  [ ] FAILED

### W5. Supervisor app shows it (D5)
- Do: Second phone, supervisor app as jc-pro-sup, Alerts tab, after W1.
- See: "Left Job Site" alert for jc-pro-emp, no push on the supervisor
  phone. It is in the Alerts filter list too.
- [ ] OK  [ ] FAILED

### W6. Alerts toggle off
- Do: Website Settings > Alerts > "Left the job site" OFF. Repeat W1 (5 min
  out). Turn it back ON after.
- See: website line still red in Time Tracking (the exit itself is always
  saved); no Overview alert; no supervisor app alert; no red Timesheet
  Approvals warning. The employee's own Alerts tab entry still shows.
- [ ] OK  [ ] FAILED

---

## Group O. Offline, killed, restart

### O1. Offline while outside
- Do: Clocked in at Site A. Airplane mode ON (keep Location on). Walk out
  10 min, back 5 min. Open the app (still offline) - the Sync tab badge does
  not count these. Airplane mode OFF, wait 1 min with the app open.
- See: the notification still came while offline. After signal, the
  website shows the line with the REAL times (not the sync time).
- I check: siteExits doc queued: true, startMs = when you left.
- [ ] OK  [ ] FAILED

### O2. Offline clock-in, then walk out (D8)
- Do: Airplane mode ON, clock in at Site A (queued punch). Walk out 10 min
  and back. Airplane mode OFF, open the app.
- See: notification while offline (the phone used Site A's saved fence).
  After sync: the clock-in, then the exit, both on the website.
- [ ] OK  [ ] FAILED

### O3. App killed mid-shift
- Do: Clocked in. Swipe the app away (force quit). Walk out 10 min, back.
  Open the app.
- See / note for the Phase 10 list: did the notification come with the app
  force-quit? (iPhone may not wake a force-quit app for regions.) Either way:
  write down what you saw. If it did not come, the website must show the
  exit once you open the app outside, or nothing - never a wrong time.
- [ ] OK  [ ] FAILED  Notification with app force-quit: [ ] yes [ ] no

### O4. Phone restart mid-shift
- Do: Clocked in. Restart the phone. Don't open the app. Walk out 10 min
  and back. Then open the app.
- See / note: notification after restart? (iPhone keeps regions across a
  restart.) If tracking was lost, the website shows a gray "Tracking off
  ... (phone stopped tracking)" ending when you opened the app.
- [ ] OK  [ ] FAILED  Notification after restart: [ ] yes [ ] no

### O5. No good fix (E4)
- Do: Clocked in. Leave through a place with bad GPS (parking garage,
  underground, inside a big building) and stay there 5 min, then come out
  outside the radius for 5 min, then walk back.
- See: if the phone couldn't get a good fix when it noticed you left, a
  gray "Tracking off ... (no good location fix)" line, ending when a good
  fix came, then a red "Left the job site" from then. If it did get a good
  fix, just the red line. Never nothing at all.
- [ ] OK  [ ] FAILED

---

## Group E. End of shift

### E1. Clock out while outside
- Do: Clocked in. Walk out, wait 5 min, clock out from outside. Walk back.
- See: clock-out works as normal. Website: "Left the job site from <a> -
  clock-out <time>". Tracking stopped (Settings > Privacy > Location
  Services: OrbitsWorks Dev is not "used recently" a few minutes later).
- [ ] OK  [ ] FAILED

### E2. Auto clock-out while outside
- Do (website): Settings > Automations: auto clock-out ON, 1 hour (put it
  back after). Clock in, walk out after 50 min, stay out.
- See: the auto clock-out happens at 1 hour as usual. Website: "Left the job
  site from <a> - auto clock-out <time>". The app's Home shows clocked out
  next time it opens; no more notifications after that.
- [ ] OK  [ ] FAILED

### E3. Leaving on a break (E1)
- Do: Clock in, start a break, walk out 5 min and back, end the break.
- See: the notification still comes (the phone can't tell). Website line is
  GRAY "... (on break)". No Overview alert, no supervisor alert, no Alerts
  tab entry, no red Timesheet warning.
- [ ] OK  [ ] FAILED

---

## Group C. Things that must NOT track

### C1. Core company
- Do: Core employee, Core site with geofence (if the toggle is locked on
  Core, use a site with a pin). Clock in, walk out 10 min, back.
- See: no consent screen, no notification, nothing on the website.
- [ ] OK  [ ] FAILED

### C2. Toggle off mid-shift (D12)
- Do: Clock in at Site A (tracked). Website: Site A > Require geofence OFF.
  Open the app (to the front). Walk out 10 min, back. Turn it back ON.
- See: no exit recorded after the switch went off (a notification may still
  come if the app hadn't been opened since - the server drops that exit).
- [ ] OK  [ ] FAILED

### C3. Supervisor-made punch is not tracked (D11)
- Do: Supervisor app clocks jc-pro-emp in at Site A (PIN). jc-pro-emp's
  phone shows Clocked in. Walk out with jc-pro-emp's phone 10 min, back.
- See: no notification, nothing on the website.
- [ ] OK  [ ] FAILED

### C4. Shared phone: sign out mid-shift
- Do: jc-pro-emp clocked in at Site A (tracked). Settings > Log out (accept
  the warning if it shows "job site record"). Sign in as another Pro
  employee on the same phone. Walk out 10 min with the phone.
- See: no notification. Website (jc-pro-emp's shift): gray "Tracking off
  from <logout> - ... (signed out of the app)". Nothing for the other
  employee.
- [ ] OK  [ ] FAILED

### C5. Always lowered to While using
- Do: Clocked in, tracked. iPhone Settings > OrbitsWorks Dev > Location >
  While Using. Back to the app. Walk out 10 min, back. Then set Always again
  and open the app.
- See: the orange banner while it is on While Using; no notification. Website:
  gray "Tracking off from <when you opened the app> - <when you set Always
  and opened it> (location permission off)".
- [ ] OK  [ ] FAILED

### C6. Plan drops to Core mid-shift
- Do (I do it on dev): set jc-test-pro-dev to a Core plan while jc-pro-emp is
  clocked in and tracked. You: open the app, walk out 10 min. I put Pro back.
- See: no new exit after the change.
- [ ] OK  [ ] FAILED

---

## Group Q. Website settings

### Q1. Crew code modal geofence (D2) and no "Location" radio (D3)
- Do: Sites > Crew codes > Create crew code. Pick Site A; then Site B; then
  "+ New job site".
- See: no "Location: Required / Optional". Under the site: the Require
  geofence switch with Site A's saved radius (300 ft, on). Change it to 400
  ft, save the code; Sites page shows Site A at 400 ft (same setting). A
  site with no address pin: the switch is locked with "Add one on the Sites
  page". New site: switch locked until an address is picked from the
  suggestions. Put Site A back to 300 ft.
- [ ] OK  [ ] FAILED

### Q2. Crew code info has no "Location required" row
- Do: Open any crew code's info.
- See: no "Location required" row; the rest as before.
- [ ] OK  [ ] FAILED

---

## Not tested on the phone (covered by tests)

- Locations cleared after 90 days, times kept (functions test).
- Server dropping exits that don't hold up against the real site, per-shift
  cap, wrong account (functions tests).
- Exits under 3 min gray / on break gray / tracking off gray (web test).
