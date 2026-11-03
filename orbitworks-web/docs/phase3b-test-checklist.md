# Employee App Phase 3B - email invite test checklist

Profile employeeDev (com.orbitworks.app.dev, ASC 6826363680). Dev only
(orbitworks-dev-ew). Run in order, one at a time; reply "done B#".

## Status (2026-11-02)

The first 3B build (TestFlight build 19, employee-app 7edec8b) went on the
phone. No test was reported passed. Everything below (B1-B11, N1-N6, and
the Phase 4 leftovers) runs on the NEXT phase's first build. Mark a test
here only after it is reported passed.

Website: https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app
Core owner: jc-core-owner (password in test/dev-e2e/creds.json).
Gmail "+" addresses (you+core2@gmail.com) land in your normal inbox, so one
Gmail covers every test that needs a fresh email.

## Before the 3B tests

Phase 4 leftovers from phase4-test-checklist.md on the same build: T2, T3
(airplane), T16, then S1-S6. T5 and T14 are replaced by N1 and N2 below
(the PIN is now checked on the phone, so a wrong PIN never reaches the
camera or the queue).

## 3B tests

- B1. QR sign-up still works (useJoinInfo and the sign-up hooks changed).
  Scan a jc-test-pro-dev crew code, sign up end to end, land on Home, clock
  in once.
- B2. Invite lands. As jc-core-owner: Employees > Invite new person > your
  Gmail, no site > Send invite. Expect: App invites row Pending, Email
  status Sent; email arrives (check spam); the link opens the /i page
  showing "JC-Test Core (dev)" on your computer.
- B3. Copy link + Resend. Copy link on that row: same URL as the email.
  Resend: a second email arrives with the same link, the expiry moves to 7
  days from now, Resend locks for 60 seconds.
- B4. Revoke. Revoke the row and confirm. Status Revoked. On the phone
  (signed out), tap the email link: "Invite no longer active". Back on the
  website, Remove the row: it disappears.
- B5. Wrong email. Send a new Invite new person to your Gmail with site
  "Core Site". On the phone tap the link, sign up with a DIFFERENT email
  (you+wrong@gmail.com). Expect: after Sign up you're sent back to step 1
  with "Use the email address this invite was sent to." under Email.
  Website: invite still Pending, no new employee.
- B6. Invite sign-up (the done-when, part 1). Same invite: fix the email
  to your Gmail, sign up. Check: "Joining JC-Test Core (dev)", the hint
  under Email, the "Who do you work for?" dropdown starts on
  "JC-Test Core (dev) (direct)" (only if Core Acme Labor shows; leave it on
  the company). Welcome shows a PIN, Done lands on Home. Website (no
  refresh): invite Accepted, new employee live on Employees with your
  selfie and Core Site.
- B7. Core full day (the done-when, part 2). On the phone: clock in, start
  and end a break, clock out, with photos. Time Tracking shows the day with
  the photos and no face check.
- B8. One-time link. Sign out, tap the same email link again: "Invite no
  longer active".
- B9. Invite to app on an existing row. Employees > open JC Core Plain >
  Employee app > you+core2@gmail.com > Invite to app. Table row shows "App
  invite sent". Sign up from that email on the phone. Expect: Welcome
  shows JC Core Plain's existing PIN (not a new one); Employees still has
  ONE JC Core Plain row (no duplicate), now with your selfie and the grey
  Employee tag; any clock history it had is still there.
- B10. Link while signed in. Signed in on the phone, tap any invite link:
  the app opens and stays on Home (no sign-up screen).
- B11. Pro: new selfie becomes the face reference. As jc-pro-owner on
  jc-test-pro-dev (face check on in Settings): Add employee with someone
  else's photo (or any face),
  then Invite to app at you+pro@gmail.com. Sign up on the phone. Clock in:
  the face check passes against your new selfie.

## New tests (2026-11-02 changes, next phase's first build)

Start each one clocked out unless it says otherwise. Same Pro test employee.

- N1. Wrong PIN caught on the phone, online and offline.
  1. Online: Clock In, type a WRONG PIN. Expect: the error at once on the
     PIN pad ("Wrong PIN. 2 tries left before a 1-minute lock."), the
     camera never opens, nothing on the Sync tab.
  2. Airplane mode on: Clock In with a WRONG PIN. Same: error at once, no
     camera, nothing saved.
  3. Still offline: the correct PIN. Camera opens right after the 4th digit,
     green after the photo with "Will sync when online". Airplane off: the
     row goes Synced.
- N2. Lock offline, survives a restart.
  1. Airplane mode on. Clock In with 3 wrong PINs. Expect "1 try left",
     then "Too many wrong PINs. Try again in 60 seconds." with the
     countdown, PIN pad disabled.
  2. Kill the app and reopen it (still offline), open Clock In: the
     countdown is still running.
  3. After it ends, the correct PIN works.
- N3. PIN changed on the website while the phone is offline (E1).
  1. Airplane mode on. Clock In with the CURRENT PIN (green, Will sync).
  2. On the website, change this employee's PIN.
  3. Airplane off. Expect: the Sync row turns Failed with "Your PIN was
     changed. Type your new PIN to send this punch." and Redo.
  4. Redo, type the NEW PIN. Expect: green at once (no "Checking PIN...",
     no "Sending..."), the original time; the row goes Synced. Website: the
     clock-in at the original time with its photo.
  5. Next Clock Out: the NEW PIN works, the OLD one gets "Wrong PIN".
- N4. No "Checking PIN..." anywhere. During N1-N3 and a normal online
  Clock In / Clock Out, "Checking PIN..." and "Sending..." never show.
- N5. Sync tab: today and the 2 days before. Needs punches from 3+ days
  ago still on the phone (run this 3 days after N1-N3, same phone, no
  reinstall). Expect: Synced rows only from today and the 2 days before
  (company time zone); an older Failed row (if any) still shows.
- N6. Auto clock-out on dev (now on for jc-test-pro-dev and
  jc-test-core-dev, 12 h).
  1. Website, jc-test-pro-dev: Settings > Automations > Auto clock-out,
     set max hours to 1. Save.
  2. Clock In on the phone. Wait 1 h 10 min (app can be closed).
  3. Expect: the website shows an automatic clock-out at 1 h after the
     clock-in, and the Auto clock-out alert. The phone's Home shows clocked
     out after it refreshes.
  4. Set max hours back to 12.

## Covered by the dev e2e, not by hand

Expired invite (7 days), Resend on an expired invite, seat caps, revoked /
deleted rows, Free/custom/past_due refusals, rate limit on create.

## Known gap (not 3B)

Android: the dev site has no /.well-known/assetlinks.json, so https links
(/j/ and /i/) aren't verified app links on Android and open in the
browser. The /i and /j pages' "Open in app" button (orbitsworks-dev://)
still works. iOS is fine (AASA has /j/* and /i/*).
