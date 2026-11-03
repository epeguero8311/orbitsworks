# Employee App Phase 5 - test checklist (Hours, Comments, Settings)

Dev only: orbitworks-dev-ew. Prod is not touched. Work in progress: more
tests are added as each layer lands.

## Build

- Profile `employeeDev`, from `employee-app` HEAD after Phase 5 is code-complete:
  `$env:APP_VARIANT="dev"; $env:EXPO_PUBLIC_FIREBASE_ENV="dev"; $env:ORBITS_STRICT_ENV="1"; npx eas-cli build -p ios --profile employeeDev`
- Before submit the build must show `com.orbitworks.app.dev` and ASC 6826363680, else STOP.
- The same build also runs the deferred tests: T2, T3, T16, S1-S6 (`phase4-test-checklist.md`) and B1-B11 + N1-N6 (`phase3b-test-checklist.md`).
- Test logins: jc-test-pro-dev and jc-test-core-dev only.

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
