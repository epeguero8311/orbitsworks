# Phase 5 phone test run (one pass)

Phase 4 leftovers (T2, T3, T16, S1-S6) + Phase 3B (B1-B11, N1, N2, N4-N6) +
Phase 5 (0, H1-H3, K1-K2, SE1-SE3, P1-P3, C1, LO1, D1), merged into one
ordered run on the Phase 5 build. Dev only (orbitworks-dev-ew).

- App: OrbitsWorks Dev (com.orbitworks.app.dev), TestFlight, Phase 5 build.
- Website: https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app
- Employee login: jc-pro-emp@orbitsworks-dev.com (jc-test-pro-dev). Other
  logins: test/dev-e2e/creds.json. Test companies jc-test-pro-dev and
  jc-test-core-dev only.
- After each test send "done <#>". I check dev read-only (Firestore,
  Storage, logs, website) and answer OK or FAILED.
- Keep the app open and the screen on while anything waits to sync.
- Not in this run (replaced): T5, T6, T14 (by N1, N2, P2) and N3 (by P1).
  The full details of each test are in phase4-, phase3b- and
  phase5-test-checklist.md.

---

## Step 0. Right after installing (signed in as jc-pro-emp)

### 0. Remove old Redo rows
- Do: Wifi on, app open, Sync tab. For each Failed row with the old text
  "Your PIN was changed. Type your new PIN...": Remove, then Remove in the
  confirm box. No Failed rows = nothing to do.
- See: no old Redo rows left, no "Sending is paused..." line, nothing stays
  Waiting while online.
- [ ] OK  [ ] FAILED

---

## Group A. Online (wifi on)

### T2. Online punch is instant
- Do: Clocked out, good wifi: Clock In (PIN + photo).
- See: camera right after the 4th digit (no "Checking PIN..."); green right
  after "Use photo", no "Will sync" line, no spinner; no banner; Sync badge
  never shows; Sync row Synced in seconds; Settings Last synced = now.
- [ ] OK  [ ] FAILED

### N4. No "Checking PIN..." (watch during the whole run)
- Do: nothing extra - watch every online Clock In / Clock Out.
- See: "Checking PIN..." and "Sending..." never show.
- [ ] OK  [ ] FAILED

### K1. Comments button and screen (you are clocked in from T2)
- Do: Home. Start a break, End it. Comments: type "test online", Add
  comment. Airplane on, type "test offline", Add comment. Back, open
  Comments again. Airplane off, wait for Synced on the Sync tab, open
  Comments. Clock Out.
- See: Comments card (not hours) while clocked in and on break; both
  comments at once, newest first; "test offline" has a blue "Will sync"
  pill until synced, then no pills; "Shift started <time>" on top; 0/1000
  counter; after Clock Out Home shows Today / This week hours again.
- [ ] OK  [ ] FAILED

### H1. History: this week
- Do: History tab.
- See: one row per day Monday to today, today on top; a day off shows 0m
  and "No activity"; today's and the week's hours match Home.
- [ ] OK  [ ] FAILED

### H2. History: one day
- Do: Clock In, Start Break, End Break. History > Today. Then tap a day
  with a clock-in and no clock-out (an admin can add one on the website).
  Leave yourself clocked in.
- See: Today: every punch and break in order, then green "In progress".
  The other day: its punches, then "Missing clock-out" in orange, 0m for
  that shift.
- [ ] OK  [ ] FAILED

### SE1. Settings rows, online then offline
- Do: Settings. Then airplane on, kill the app, reopen, Settings again.
  Airplane off.
- See (both times): photo and name; Logged in as = your email; PIN ****;
  Birthday "Not set" (or the date if one was added on the website);
  Company; Subcontractor (or "None"); Job site(s); Update "Built-in";
  Dark mode, Last synced, App version.
- [ ] OK  [ ] FAILED

### SE2. Notifications switch
- Do: Turn Notifications on -> Allow on both prompts. Turn it off. Then in
  the phone's Settings app turn this app's notifications off and come back.
- See: on after Allow; turning off opens the phone's Settings app; back in
  the app the switch is off.
- [ ] OK  [ ] FAILED

### SE3. Location switch
- Do: Same 3 steps with Location ("Share your location").
- See: on after Allow; off opens the phone's Settings app; the switch
  follows the phone's setting on return.
- [ ] OK  [ ] FAILED

---

## Group B. Airplane mode

Clock out online first if H2 left you clocked in.

### N1. Wrong PIN caught on the phone
- Do: Online: Clock In with a WRONG PIN. Airplane on: Clock In with a WRONG
  PIN. Still offline: the correct PIN, photo. Airplane off.
- See: wrong PIN: error at once on the pad ("Wrong PIN. 2 tries left..."),
  no camera, nothing on the Sync tab (online and offline). Correct PIN:
  camera right after the 4th digit, green + "Will sync when online"; row
  goes Synced once online.
- [ ] OK  [ ] FAILED

### N2. PIN lock offline survives a restart (you are clocked in from N1)
- Do: Airplane on. Clock Out with 3 wrong PINs. Kill and reopen the app
  (still offline), open Clock Out. After the countdown, the correct PIN.
  Airplane off.
- See: "1 try left", then "Too many wrong PINs. Try again in 60 seconds."
  with a countdown and the pad disabled; the countdown is still running
  after the restart; the correct PIN works after it ends.
- [ ] OK  [ ] FAILED

### T3 + H3. All offline, then sync (start clocked out)
- Do: Airplane on, wifi off. Clock In, Start Break, End Break, Clock Out.
  Write down the 4 overlay times. History > Today. Wait 6 min. Kill and
  reopen the app (still offline). Wifi on, stay on Home. History > Today
  again.
- See: each punch green at once + "Will sync when online"; Home follows
  each punch; Sync tab 4 Waiting, badge 4; after reopening offline "Done
  for the day" with hours (no spinner); History shows blue "Will sync"
  tags offline. Online: rows Syncing -> Synced, badge gone; History tags
  turn gray "Synced late"; website shows all 4 at your times with
  "Synced late".
- [ ] OK  [ ] FAILED

### T16. Breaks are instant (clock in online first)
- Do: Online: Start Break, End Break. Airplane on: Start Break, End Break.
  Airplane off.
- See: online green right after the confirm, no "Will sync" line; offline
  green + "Will sync when online"; offline rows go Synced once online.
- [ ] OK  [ ] FAILED

### C1. Everything offline, with a comment (start clocked out)
- Do: Airplane on. Clock In (PIN + photo). Comments: type a comment, save.
  Clock Out. Airplane off, app open until all 3 rows are Synced.
- See: offline Home: Clocked in, then the Comments button, then Clocked
  out. Sync tab: Clock in, Comment, Clock out rows Waiting, then all
  Synced.
- [ ] OK  [ ] FAILED

### LO1. Log out warning names punches and comments (start clocked out)
- Do: Airplane on. Clock In. Right away: Comments, add a comment. Right
  away: Settings > Log out. Read the box, tap Log out. Airplane off. Sign
  back in as jc-pro-emp. Then Clock Out online.
- See: the box says "1 punch and 1 comment are not synced yet" even within
  10 s of saving them, with "They stay on this phone and sync only when you
  sign back in on it." After signing back in, both rows go Synced.
- [ ] OK  [ ] FAILED

### S1-S6. Supervisor smoke tests (sign in as jc-pro-sup)
Sign out of jc-pro-emp, sign in as the jc-test-pro-dev supervisor. 2-3 test
employees with PINs.

- S1. Do: Airplane on, Clock In 3 employees (PIN + photo), airplane off,
  Sync Queue tab. See: all 3 rows leave Waiting within seconds; a photo
  step never blocks the next; Home shows all 3 working.
  [ ] OK  [ ] FAILED
- S2. Do: One of them: Start Break, End Break, Clock Out. See: break with
  no camera and no location prompt.
  [ ] OK  [ ] FAILED
- S3. Do: Online Home, note the active count and your name. Airplane on,
  kill and reopen. See: splash goes away in a few seconds; same count and
  name with "Offline - last updated".
  [ ] OK  [ ] FAILED
- S4. Do: Still offline: create employee "S4 Test" with an unused PIN,
  clock them in, Sync Queue, airplane off. See: both listed; employee syncs
  first, then the clock-in; Home shows them working.
  [ ] OK  [ ] FAILED
- S5. Do: Online, Edit "S4 Test", new unique PIN, save; clock them out with
  it. Edit again with a PIN another employee has. Airplane on, set
  "S4 Test" to 4321, save; on the website give another employee 4321;
  airplane off. See: new PIN works; a taken PIN is refused and nothing
  saves; "S4 Test's PIN changed to NNNN" notice on the Dashboard, nothing in
  Alerts.
  [ ] OK  [ ] FAILED
- S6. Do: Airplane on, edit "S4 Test"'s name, Sync Queue, airplane off.
  See: edit listed Waiting, then Synced; Home shows the new name.
  [ ] OK  [ ] FAILED

When S1-S6 pass: archive "S4 Test" on the website. Sign back in as
jc-pro-emp.

---

## Group C. PIN changes (website open on jc-pro-emp's edit modal)

Start each clocked out, online.

### P1. PIN changed while offline: the punch still syncs
- Do: Airplane on. Clock In with the CURRENT PIN, photo, write down the
  time. Website: change the PIN, save. Wait 5+ min. Airplane off, wait for
  Synced. Online: Clock Out with the OLD PIN, then the NEW PIN.
- See: row Waiting -> Synced, no Redo, no red text; History shows the
  clock-in at your time, gray "Synced late". Old PIN: "Wrong PIN" on the
  pad. New PIN: camera, clock-out goes through.
- [ ] OK  [ ] FAILED

### P2 + K2. Old PIN after the change: refused, Remove only (with a comment)
- Do: Airplane on. Website: change the PIN, save. Phone: Clock In with the
  OLD PIN (green, "Will sync"). Comments: add a comment. Airplane off, wait
  for Failed. On the Comment row: Remove, confirm. On the Clock in row:
  Remove, confirm. Clock In with the NEW PIN.
- See: Clock in row Failed, red, "Couldn't sync, please speak to your
  supervisor.", Remove only; Comment row Failed, "Not synced, tell your
  admin.", note start in quotes, Remove; badge counts both; History tags
  the clock-in red "Not synced"; Home stays Clocked in until removed.
  Comment confirm: "Remove this comment?"; badge drops by 1. After the
  clock-in Remove: Home Clocked out. New PIN: green, row Synced.
- [ ] OK  [ ] FAILED

### P3. PIN changed twice while offline (clock out online first)
- Do: Airplane on. Clock In with the CURRENT PIN (A), write down the time.
  Website: change to B, save, then to C, save. Airplane off, wait for
  Synced. Clock Out with C.
- See: row Synced with no Redo; History shows the clock-in at your time;
  C works for the clock-out.
- [ ] OK  [ ] FAILED

---

## Group D. Website checks

### N6. Auto clock-out (start it first - it needs 1 h 10 min)
- Do: Website, jc-test-pro-dev: Settings > Automations > Auto clock-out,
  max hours 1, save. Phone (jc-pro-emp): Clock In. Do the B tests below
  while you wait. After 1 h 10 min check the website and the phone. Set
  max hours back to 12.
- See: website shows an automatic clock-out 1 h after the clock-in and the
  Auto clock-out alert; the phone's Home shows clocked out after it
  refreshes.
- [ ] OK  [ ] FAILED

### B1-B11. Sign-up and invites
Sign out of the app first. Gmail "+" addresses land in your normal inbox.

- B1. Do: Scan a jc-test-pro-dev crew code, sign up, clock in once. See:
  sign-up end to end, Home, clock-in works.
  [ ] OK  [ ] FAILED
- B2. Do: As jc-core-owner: Employees > Invite new person > your Gmail, no
  site > Send. See: row Pending, Email Sent; email arrives; link opens /i
  with "JC-Test Core (dev)".
  [ ] OK  [ ] FAILED
- B3. Do: Copy link, then Resend. See: same URL as the email; a second
  email with the same link; expiry 7 days from now; Resend locked 60 s.
  [ ] OK  [ ] FAILED
- B4. Do: Revoke + confirm; on the phone (signed out) tap the link; Remove
  the row. See: Revoked; "Invite no longer active"; row gone.
  [ ] OK  [ ] FAILED
- B5. Do: New invite to your Gmail with site "Core Site"; on the phone sign
  up with a DIFFERENT email. See: back to step 1 with "Use the email
  address this invite was sent to."; invite still Pending, no new employee.
  [ ] OK  [ ] FAILED
- B6. Do: Same invite, your Gmail, sign up. See: "Joining JC-Test Core
  (dev)", the email hint, "Who do you work for?" on the company; Welcome
  PIN, Done -> Home; website: Accepted, new employee with selfie and Core
  Site.
  [ ] OK  [ ] FAILED
- B7. Do: Clock in, break start/end, clock out with photos. See: Time
  Tracking shows the day with photos, no face check.
  [ ] OK  [ ] FAILED
- B8. Do: Sign out, tap the same link. See: "Invite no longer active".
  [ ] OK  [ ] FAILED
- B9. Do: Employees > JC Core Plain > Employee app > you+core2@gmail.com >
  Invite to app; sign up from that email. See: "App invite sent"; Welcome
  shows JC Core Plain's existing PIN; still ONE JC Core Plain row, now with
  selfie and grey Employee tag; history kept.
  [ ] OK  [ ] FAILED
- B10. Do: Signed in, tap any invite link. See: app opens, stays on Home.
  [ ] OK  [ ] FAILED
- B11. Do: As jc-pro-owner (face check on): Add employee with another face,
  Invite to app at you+pro@gmail.com, sign up, clock in. See: face check
  passes against your new selfie.
  [ ] OK  [ ] FAILED

### D1. Done when: offline comment on the website (LAST)
- Do: Sign in as jc-pro-emp. Online: Clock In. Airplane on: Comments, type
  a comment, save. Airplane off, wait for the comment row Synced. Website:
  Time Tracking day view, then Lookup for this employee, then click the
  clock-in row to open the detail.
- See: comment row Waiting -> Synced; on the website the comment (gray
  "Comment" pill, your text, the time you typed it) in the clock-in row's
  Note cell in the day view and the lookup, and under the Clock in side of
  the detail.
- [ ] OK  [ ] FAILED

---

## Later (3 days after this run, same phone, no reinstall)

### N5. Sync tab window
- Do: Open the Sync tab.
- See: Synced rows only from today and the 2 days before; an older Failed
  row (if any) still shows.
- [ ] OK  [ ] FAILED
