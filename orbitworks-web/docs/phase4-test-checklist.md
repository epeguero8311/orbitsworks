# Employee App Phase 4 - Nov 1 test checklist

Offline punch queue (steps 1-7). Dev only: orbitworks-dev-ew. Prod is not touched.

## Builds (Nov 1, profile employeeDev)

1. Build 1 - UI-only: from tag `ui-only-build` (2b29ec3). New screens plus the dev timing readout. Used for T1 only.
2. Build 2 - Phase 4: from `employee-app` HEAD (includes main up to 8cce37d). Used for T2-T13 and S1-S6.

## How to run it

- One test at a time, in order. Use the same test employee all day.
- After each test, send "done T#". I check dev read-only and answer OK or FAILED.
- "I check" = what I look at on dev (Firestore, Storage, function logs, the dev website). I write nothing.
- Nov 1, 2026 is the US clock change (back 1 h at 2 AM). Test during the day; don't run a shift across 2 AM.
- The 24 h rules (saved PIN deleted after 24 h, punches older than 24 h not recorded) can't be tested in one day. Unit tests cover them (`orbitworks-app/test/punchQueueLogic.test.js`).

---

## Build 1 - UI-only

### T1. "Before" timings, online and airplane

- **Tap:**
  1. On wifi: Clock In, Start Break, End Break, Clock Out.
  2. Cell data only (wifi off): the same 4 punches.
  3. Airplane mode on: tap Clock In and type your PIN.
- **You should see:**
  - The 8 online punches each show the green overlay.
  - In airplane mode the punch stops with "No signal..." and Try again. This build has no queue.
  - Settings shows the timing rows.
- **I check:**
  - Exactly 8 events, with no `queued` field.
  - The step times (PIN check, upload, punch, total) for wifi and for cell. These are the "before" numbers for T13.

---

## Build 2 - Phase 4

### T2. Online punch is unchanged (and the photo size)

- **Tap:** On good wifi, from clocked out: Clock In (PIN + photo).
- **You should see:**
  - Green overlay with no "Will sync when online" line.
  - No banner on Home.
  - Sync tab: "Everything is synced".
  - Settings: Last synced = "Today, <now>", PIN = `****`.
- **I check:**
  - The event has no `queued` and no `syncedLate`.
  - The photo in dev Storage: pixel size (expected 720x1280 portrait), KB, and the face check result.
  - The timing readout.

### T3. The done-test (all offline, then sync)

Start clocked out. If T2 left you clocked in, clock out online first.

- **Tap:**
  1. Airplane mode on, wifi off.
  2. Clock In (PIN + photo), Start Break, End Break, Clock Out.
  3. Write down the 4 times shown on the green overlays.
  4. Wait 6 minutes.
  5. Kill the app (swipe it away) and reopen it, still in airplane mode.
  6. Turn wifi on and stay on Home.
- **You should see:**
  - Each punch: green overlay + "Will sync when online" + the expected site.
  - The "No signal..." banner on Home and the PIN screen.
  - Home follows each punch (Clocked in -> On break -> Clocked in -> Done for the day).
  - Sync tab: 4 rows "Waiting"; the Sync badge shows 4.
  - After reopening offline: Home shows "Done for the day" and today's hours, not a spinner and not "Clocked out" with 0h.
  - With wifi on: the rows go Syncing -> Synced, the badge goes away, and Last synced updates.
  - On the dev website: all 4 punches at the times you wrote down, each with the "Synced late" tag.
- **I check:**
  - Exactly 4 events, in order.
  - Each event's time = the phone's punch time (not the sync time), with `queued: true` and `syncedLate: true`.
  - Clock in and clock out have photos.
  - No duplicates.

### T4. Quick timeout: syncs in under 5 min -> NO "Synced late"

- **Tap:**
  1. iPhone Settings -> Developer -> Network Link Conditioner -> "100% Loss" -> on. Wifi stays on.
  2. Clock In (PIN + photo).
  3. Within 2 minutes, turn the conditioner off.
- **You should see:**
  - "Checking PIN..." for about 3 s, then the camera opens anyway.
  - Green overlay + "Will sync when online".
  - The "Weak signal..." banner.
  - Once the conditioner is off, the row goes Synced within about a minute (a retry stuck on the bad signal times out after 30 s).
  - On the website: no "Synced late" tag on this punch.
- **I check:** `queued: true`, the time is the phone's time, and `syncedLate` is absent.

### T5. Wrong PIN offline -> Redo -> lands with the original time + photo

Start clocked out (clock out online first if needed).

- **Tap:**
  1. Airplane mode on.
  2. Clock In with a WRONG PIN (offline, any 4 digits are accepted) and take the photo.
  3. Write down the overlay time.
  4. Wifi on.
  5. Sync tab: tap Redo on the failed row.
  6. Type the correct PIN.
- **You should see:**
  - The row turns Failed, red pill, "Wrong PIN. Type your PIN again to send this punch." and a Redo button.
  - Home still shows Clocked in.
  - Redo opens "Redo Clock In" / "Type your PIN again", with no camera.
  - Green "Clocked in" at the time you wrote down (not now). The row goes Synced.
- **I check:**
  - `syncPinFailures/{employee}` has 1 entry.
  - The normal 3-strike PIN lock count is untouched.
  - The in event has the original phone time and a photo in Storage (re-uploaded after the reject).

### T6. Queue pauses at a failed punch; newer punches wait behind it (D2)

You are clocked in from T5.

- **Tap:**
  1. Airplane mode on.
  2. Clock Out with a WRONG PIN.
  3. Wifi on. Wait until the row shows Failed.
  4. Tap Clock Back In on Home with the correct PIN (online).
  5. Sync tab: tap Redo on the failed Clock out and type the correct PIN.
- **You should see:**
  - The Clock out row Failed, with the red line "Sending is paused until the failed punch below is fixed."
  - The Clock Back In shows green + "Will sync when online" even though you're online, and its row stays Waiting behind the failed one. The badge counts both.
  - After Redo: Clock out goes Synced first, then Clock in. The badge goes away.
- **I check:**
  - The out event comes before the new in event, both at their original phone times.
  - The in event has `queued: true` (it was queued behind).

### T7. Remove a "Not recorded" punch; the queue continues after

You are clocked in from T6. The test needs a clock out and a clock back in 3 minutes apart.

- **Tap:**
  1. Airplane mode on.
  2. Clock Out (correct PIN). Write down the time (say 10:00).
  3. Wait 3 minutes. Clock Back In (correct PIN), say 10:03.
  4. On the dev website: add a clock out for this employee at a time between the two (say 10:01).
  5. Wifi on.
  6. Sync tab: tap Remove on the failed row and read the confirm. Then tap Remove.
- **You should see:**
  - The Clock out row Failed: "Not recorded, tell your admin." with Remove only (no Redo).
  - The Clock in row Waiting behind it.
  - The confirm box: "Remove this Clock out?" / "This punch will NOT be recorded. Tell your supervisor so they can fix your time." with Remove / Keep it.
  - After Remove: the row is gone, and the Clock in goes Syncing -> Synced right after.
- **I check:**
  - There's no out event from the phone at 10:00 (the website's 10:01 out is the one kept).
  - The phone's 10:00 photo was deleted from Storage.
  - The in event landed at 10:03.

### T8. Inactive employee while punches are queued -> fails, Remove only

You are clocked in from T7.

- **Tap:**
  1. Airplane mode on.
  2. Start Break.
  3. On the dev website, set the employee to Inactive.
  4. Wifi on. Wait for the row.
  5. Tap Remove and confirm.
  6. Set the employee back to Active on the website.
- **You should see:**
  - The row Failed: "Couldn't sync, please speak to your supervisor." with Remove only.
  - After Remove the row is gone.
- **I check:** no break event was written.

### T9. Sign-out warning with punches waiting; sign back in as the same employee -> they sync

You are clocked in (on shift) from T7/T8.

- **Tap:**
  1. Airplane mode on.
  2. Start Break.
  3. Settings -> Log out. Read the box, then tap Log out.
  4. Wifi on.
  5. Sign back in as the same employee.
- **You should see:**
  - Box: "1 punch is not synced yet" / "They stay on this phone and sync only when you sign back in on it." with Log out / Stay signed in.
  - After signing back in: Home shows On break, and the row goes Synced.
- **I check:** the break event landed at the original phone time, `queued: true`.

### T10. Late punch into an approved timesheet -> admin alert on the website

You are on break from T9.

- **Tap:**
  1. On the dev website, approve this employee's timesheet for this week.
  2. On the phone: airplane mode on, End Break.
  3. Wait 6 minutes.
  4. Wifi on.
- **You should see:**
  - On the website: the End break with the "Synced late" tag.
  - The admin alert "Late Punch on Approved Timesheet" on the website. It does not show in the supervisor app's Alerts list (web-only).
- **I check:**
  - A `syncedLateApproved` alert for this event.
  - The event has `queued: true` and `syncedLate: true`.
  - Whether a supervisor push went out for it (I report what happened).

### T11. Sync tab badge count and Sync Now

You are clocked in from T10.

- **Tap:**
  1. Network Link Conditioner "100% Loss" on (wifi stays on).
  2. Start Break, then End Break (each spins about 5 s, then saves).
  3. Open the Sync tab.
  4. Turn the conditioner off. Right away, tap Sync Now.
- **You should see:**
  - The Sync badge shows 1, then 2.
  - The Sync tab shows 2 rows Waiting (one may flip to Syncing while the phone retries), and the top line says "Weak signal".
  - Sync Now changes to "Syncing...", and both rows go Synced. That's within seconds, or up to 30 s if a retry was already stuck on the bad signal.
  - The badge goes away, and Last synced = now.
- **I check:** both events landed, in order, at the original times, with no "Synced late" tag (under 5 min).

### T12. Smaller photo: the face check passes on real Phase 4 photos

- **Tap:** Online, 3 punches with your face clearly in frame: Clock Out, Clock In, Clock Out. Do one of them in poorer light (indoors, no window).
- **You should see:** Normal green overlays.
- **I check:** for these 3 photos and every Phase 4 photo from T2-T9:
  - the pixel size and KB;
  - the face check result and match %, compared with the full-size photos from before Phase 4;
  - no "no face" when your face was clearly in frame.
- If any result is worse, I stop and tell you before anything ships.

### T13. "After" timings vs T1, online and airplane

- **Tap:**
  1. On wifi: Clock In, Start Break, End Break, Clock Out.
  2. Cell data only: the same 4.
  3. Airplane mode on: Clock In.
  4. Settings: open the timing readout.
- **You should see:**
  - Online punches: same flow as T1, with the photo upload shorter.
  - Airplane: the green overlay with "Will sync when online" right after the photo, instead of "No signal".
  - The timing rows (airplane rows show "queued").
- **I check:**
  - The T1 vs T13 table per step (PIN check, upload, punch, total) for wifi, cell and airplane.
  - The airplane punch syncs once wifi is back.

---

## Supervisor smoke tests - main's changes (Build 2)

Build 2 also carries main's supervisor work (sync speed, fast launch,
breaks, offline employees). These are quick checks that the merge didn't
break it. Sign out of the employee, then sign in as a supervisor or admin
of the same dev company. Use 2-3 test employees you can clock in with a PIN.

### S1. Sync speed: events first, photos after

- **Tap:**
  1. Airplane mode on.
  2. Clock In 3 different employees (PIN + photo each).
  3. Airplane mode off and open the Sync Queue tab.
- **You should see:**
  - Within a few seconds all 3 rows leave Waiting. A row can sit on the photo
    step for a bit; it never blocks the next employee.
  - Home shows all 3 as working.
- **I check:**
  - Each event landed before its photo (`photoPending` first, then
    `photoUrl`), with the original times.
  - The dev website log shows "Uploading" until the photo is in, then
    "View". Never "Photo missing".
  - Photos are 720x1280 (or 1280x720). Each event has exactly one face check
    (one `faceCheckClaims` doc).

### S2. A break keeps the clock-out site

- **Tap:** For one employee clocked in from S1 (at a site): Start Break, End
  Break, then Clock Out.
- **You should see:** The break saves with no camera and no location prompt.
- **I check:**
  - The 2 break events have no site and no GPS. The website shows "-" for
    Site, Geofence and Face check on both.
  - The clock-out has the clock-in site and a geofence result.

### S3. Offline home count and name after a restart

- **Tap:**
  1. Online, open Home. Note the active count and your name at the top.
  2. Airplane mode on. Close the app fully (swipe it away) and reopen it.
- **You should see:**
  - The splash goes away within a few seconds. It doesn't hang.
  - Home shows the same active count and your name, with an
    "Offline - last updated" note. It is not empty and has no blank name.

### S4. Offline-created employee clocks in with a PIN

- **Tap:**
  1. Still in airplane mode: create a new employee with a PIN no one else
     uses (for example `S4 Test`).
  2. Clock them in with that PIN (photo too).
  3. Open the Sync Queue tab: the create and the clock-in are both listed.
  4. Airplane mode off.
- **You should see:** The employee syncs first, then the clock-in. Both go
  Synced. Home shows them as working.
- **I check:** The employee exists once, and the clock-in kept its original
  time and points at that employee.

### S5. Change a PIN from the app

- **Tap:**
  1. Online, as admin/owner: Edit Employee on `S4 Test`, set a new unique PIN, save.
  2. Clock them out with the new PIN.
  3. Edit them again and type a PIN another employee already has.
  4. Taken-PIN fix-up: airplane mode on, set `S4 Test`'s PIN to a new
     unused number (say 4321) and save. On the dev website, give a
     different employee that same PIN. Then airplane mode off.
- **You should see:**
  - Step 2 works with the new PIN.
  - Step 3: the phone refuses the PIN (already in use) and saves nothing.
  - Step 4: a notice on the phone "S4 Test's PIN changed to NNNN" (the
    Dashboard sync-notice badge). The supervisor Alerts tab shows nothing for it.
- **I check:**
  - The website Overview shows one "PIN Changed" alert, and nothing was
    pushed.
  - `S4 Test` ends with a unique PIN, and the phone's PIN list has it.

### S6. Sync Queue shows employees

Covered in S4 step 3. Also check:

- **Tap:** Airplane mode on, edit `S4 Test`'s name, open the Sync Queue tab,
  then airplane mode off.
- **You should see:** The edit is listed (Waiting), then Synced. The name
  updates on Home.

When S1-S6 pass: archive `S4 Test` on the website.
