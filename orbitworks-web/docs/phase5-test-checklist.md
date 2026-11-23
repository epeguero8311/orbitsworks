# Employee App Phase 5 - test checklist (Hours, Comments, Settings)

Dev only: orbitworks-dev-ew. Prod is not touched. Work in progress: more
tests are added as each layer lands.

## Build

- Profile `employeeDev`, from `employee-app` HEAD after Phase 5 is code-complete:
  `$env:APP_VARIANT="dev"; $env:EXPO_PUBLIC_FIREBASE_ENV="dev"; $env:ORBITS_STRICT_ENV="1"; npx eas-cli build -p ios --profile employeeDev`
- Before submit the build must show `com.orbitworks.app.dev` and ASC 6826363680, else STOP.
- The same build also runs the deferred tests: T2, T3, T16, S1-S6 (`phase4-test-checklist.md`) and B1-B11 + N1-N6 (`phase3b-test-checklist.md`).
- Test logins: jc-test-pro-dev and jc-test-core-dev only.
- P1-P3 need the Phase 5 rules and functions on dev first (old PIN history,
  employeeClock.ts / pins.ts / employees.ts) - deploy only with an OK.
- No Redo since Phase 5 (decided 2026-11-03): a punch saved offline with the
  PIN that was right at that moment syncs even if an admin changed the PIN
  before it reached the server. Any other refused punch: "Couldn't sync,
  please speak to your supervisor." with Remove only.

## Step 0. Right after installing the Phase 5 build: remove old Redo rows

Decided 2026-11-03: nothing is done on the old build. The Phase 5 build
shows Remove on every Failed row, including rows an older build left
waiting for Redo (they still show the old text "Your PIN was changed. Type
your new PIN to send this punch."). Sign in as the jc-test-pro-dev employee
(jc-pro-emp@orbitsworks-dev.com).

1. Wifi on, app open. Sync tab.
2. No Failed rows: step 0 is OK, send "done 0".
3. For each Failed row with the old Redo text: tap Remove, then Remove in
   the confirm box ("This punch will NOT be recorded...").
4. After the last one: "Sending is paused until the failed punch below is
   removed." is gone, and any Waiting rows behind them go Syncing ->
   Synced (or show their own result).
- **OK when:** no old Redo rows are left, no "Sending is paused" line, and
  nothing stays Waiting while online.
- **I check:** none of the removed punches is on dev (they are never
  recorded); the punches that were waiting behind them landed.

## How to run it

- One test at a time, in order. After each test, send "done C#". I check dev read-only and answer OK or FAILED.
- "I check" = what I look at on dev (Firestore, the dev website). I write nothing.
- Keep the app open and the screen on while something is waiting to sync.

## Results

| # | Test | OK / FAILED | Notes |
|---|---|---|---|
| D1 | Done when: a comment typed offline shows next to the right shift on the dev website after sync | | |
| C1 | Offline clock-in, offline comment, offline clock-out, then online: all three sync, comment next to that shift | | |
| H1 | History: this week Monday to today, hours match Home, day off shows 0m / No activity | | |
| H2 | History day: every punch and break; In progress today; Missing clock-out in orange | | |
| H3 | History tags: Will sync (offline punch), Synced late (synced 5+ min late) | | |
| 0 | After install: every old Redo row removed, the queue continues | | |
| P1 | PIN changed on the website while offline: the punch syncs by itself at its own time, no Redo | | |
| P2 | Old PIN used AFTER the change: Couldn't sync, Remove only; Remove lets the queue go on | | |
| P3 | PIN changed twice while offline: the punch from before both changes still syncs | | |
| K1 | Home: Comments button while clocked in / on break, hours otherwise; Comments screen lists this shift's comments, works offline | | |
| K2 | Sync tab: Comment rows mixed with punches; a Not synced comment has Remove; badge counts it | | |
| SE1 | Settings: photo, name, email, birthday (Not set), company, subcontractor (None), job site, Update line; also offline | | |
| SE2 | Settings: Notifications switch follows the phone's permission (no push token) | | |
| SE3 | Settings: Location switch follows the phone's permission | | |

---

## D1. Done when: offline comment shows on the dev website

- **Tap:**
  1. Online: Clock In.
  2. Airplane mode on. Home shows the Comments button. Type a comment and save it.
  3. Airplane mode off. Wait for the Sync tab to show the comment Synced.
- **You should see:** the comment row goes Waiting -> Synced on the Sync tab.
- **I check:**
  - One `shiftNotes` doc with `source: "employeeApp"`, `clockEventId` = that clock-in's id, `madeAtMs` = when you typed it.
  - The dev website shows the comment in the Note cell of that clock-in row (day view, lookup and event detail).

## C1. Everything offline, then sync

- **Tap:**
  1. Airplane mode on. Clock In (PIN + photo).
  2. Still offline: Comments, type a comment, save.
  3. Still offline: Clock Out.
  4. Airplane mode off. Keep the app open until the Sync tab shows all three Synced.
- **You should see:**
  - Home shows Clocked in, then the Comments button, then Clocked out, all while offline.
  - The Sync tab shows Clock in, Comment and Clock out rows, Waiting, then all Synced.
- **I check:**
  - The clock-in and clock-out events exist (`queued: true`), in that order.
  - Exactly one `shiftNotes` doc for the comment (doc id = the comment's id), `clockEventId` = the clock-in's id, `madeAtMs` between the clock-in and clock-out times.
  - The comment shows next to that shift on the dev website.

## H1. History: this week

- **Tap:** History tab, any day this week after a few shifts.
- **You should see:**
  - One row per day from Monday to today, today on top. A day off shows 0m and "No activity".
  - Today's hours and the week's total match Home's hours (closed shifts only, auto break included).
- **I check:** the clock events for this week add up to the hours shown.

## H2. History: one day

- **Tap:**
  1. Clock in today, start and end a break. Open History, tap Today.
  2. On a test day with a clock-in and no clock-out (an admin can set one up on the dev website), tap that day.
- **You should see:**
  - Today: every punch and break in order, then "In progress".
  - The other day: its punches, then "Missing clock-out" in orange, and 0m for that shift.

## H3. History: sync tags

- **Tap:**
  1. Airplane mode on. Start a break. Open History, Today.
  2. Wait 5+ minutes, airplane mode off, let it sync. Open History, Today again.
- **You should see:** the break start is tagged "Will sync" while offline, then "Synced late" after it syncs.
- **I check:** that event has `queued: true` and `syncedLate: true`.

## K1. Comments button and screen

- **Tap:**
  1. Clocked out: Home shows Today / This week hours.
  2. Clock In. Home shows the Comments card instead of the hours.
  3. Start a break: still the Comments card. End the break.
  4. Comments: type "test online", Add comment. Airplane mode on, type
     "test offline", Add comment. Back, open Comments again.
  5. Airplane mode off, wait for Synced on the Sync tab, open Comments.
  6. Clock Out: Home shows the hours again.
- **You should see:**
  - Step 4: both comments at once, newest first, "test offline" with a blue
    "Will sync" pill; "Shift started <time>" at the top; a 0/1000 counter.
  - Step 5: no pills (both on the server).
- **I check:** 2 shiftNotes for this clock-in (`clockEventId`), each
  `madeAtMs` = when typed; the dev website shows both next to the clock-in.

## K2. Sync tab comment rows and Remove

- **Tap:** same setup as P2 (a clock-in made offline with the OLD PIN after
  a PIN change), but before going online also add a comment on that shift.
  Go online.
- **You should see:**
  - Sync tab: the clock-in row Failed (Couldn't sync) and a "Comment" row
    Failed, red pill, "Not synced, tell your admin.", with Remove; the
    comment row's detail is the start of the note in quotes.
  - The Sync tab badge counts both.
  - Remove on the comment row: "Remove this comment?" / "This comment will
    NOT be saved...". After Remove the row is gone and the badge drops by 1.
- **I check:** no shiftNotes doc for that comment.

## SE1. Settings: view-only rows, online and offline

- **Tap:** Settings tab. Then airplane mode on, kill the app, reopen it,
  Settings again.
- **You should see** (both times, the same):
  - Photo and name at the top.
  - Logged in as: the employee's email. Birthday: "Not set" until a birthday
    is added on the dev website edit modal (then e.g. "January 31, 1990").
  - Company: the company name. Subcontractor: its name, or "None".
  - Job site: the assigned site(s), comma-separated (a closed site isn't
    shown), or "None".
  - Update: "Built-in" on a fresh build, or the first 8 characters of the
    update id after an OTA update.
  - PIN ****, Dark mode, Last synced and App version as before.
- **I check:** the self view has the same email and dob; the assigned
  jobSites names match.

## SE2. Settings: Notifications switch

- **Tap:**
  1. Fresh install: turn Notifications on -> "Allow notifications" -> Allow
     -> the phone's own prompt -> Allow.
  2. Turn it off.
  3. In the phone's Settings app, turn this app's notifications off, come
     back to the app.
- **You should see:** step 1 the switch on; step 2 the phone's Settings app
  opens (only it can turn a permission off); step 3 the switch is off.
- **I check:** no pushTokens doc for this phone (nothing is registered).

## SE3. Settings: Location switch

- **Tap:** same 3 steps as SE2 with Location (prompt text "Share your
  location").
- **You should see:** the same: on after Allow, off opens the phone's
  Settings app, and the switch follows the phone's setting on return.

## P1. PIN changed while offline: the punch still syncs (replaces 3B N3)

Start clocked out. A second device (computer) with the dev website open on
this employee's edit modal.

- **Tap:**
  1. Airplane mode on. Clock In with the CURRENT PIN, take the photo. Write
     down the time.
  2. On the website, change this employee's PIN and save.
  3. Wait 5+ minutes. Airplane mode off. Keep the app open until the Sync
     tab shows the row Synced.
  4. Online: Clock Out with the OLD PIN, then with the NEW PIN.
- **You should see:**
  - Step 3: the row goes Waiting -> Synced with no Redo and no red text.
    History shows the clock-in at the time you wrote down, tagged "Synced
    late" (gray).
  - Step 4: the old PIN gets "Wrong PIN" on the PIN pad; the new PIN opens
    the camera and the clock-out goes through.
- **I check:**
  - The clock-in has the original phone time, `queued: true`,
    `syncedLate: true` and `oldPinAccepted: true`, with its photo.
  - `employeePinHistory/{employee}` has 1 entry (a hash, no PIN in it).
  - `syncPinFailures/{employee}` has no new entry; no syncWrongPin alert.

## P2. Old PIN used after the change: refused, Remove only (replaces 4 T6)

Start clocked out, online.

- **Tap:**
  1. Airplane mode on.
  2. On the website, change this employee's PIN and save.
  3. Phone (still offline): Clock In with the OLD PIN (the phone doesn't know
     about the change yet, so it shows green "Will sync when online").
  4. Airplane mode off. Wait until the Sync row shows Failed.
  5. Tap Remove, then Remove in the confirm box.
  6. Clock In with the NEW PIN.
- **You should see:**
  - Step 4: the row Failed, red pill, "Couldn't sync, please speak to your
    supervisor." with Remove only (no Redo). History tags it "Not synced"
    (red). Home still shows Clocked in until it is removed.
  - Step 5: the row is gone, Home shows Clocked out.
  - Step 6: green "Clocked in", the row goes Synced.
- **I check:**
  - No clock event from step 3; its photo was deleted from Storage.
  - `syncPinFailures/{employee}` has 1 new entry.
  - The step 6 clock-in landed normally (no `oldPinAccepted`).

## P3. PIN changed twice while offline

Start clocked out.

- **Tap:**
  1. Airplane mode on. Clock In with the CURRENT PIN (call it A). Write
     down the time.
  2. On the website, change the PIN to B, save. Then change it to C, save.
  3. Airplane mode off. Wait until the row is Synced.
- **You should see:** the row goes Synced with no Redo; History shows the
  clock-in at the time you wrote down.
- **I check:**
  - The clock-in has `oldPinAccepted: true` and the original time.
  - `employeePinHistory/{employee}` has 2 entries (A until the first
    change, B until the second).
  - The current PIN is C (the next online punch needs C).
