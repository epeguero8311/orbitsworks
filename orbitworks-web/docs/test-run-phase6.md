# Phase 6 phone test run (location) - iPhone

Runs on the first build after Phase 7 (no Phase 6 build of its own). Dev
only (orbitworks-dev-ew). Android is tested in Phase 10.

- App: OrbitsWorks Dev (com.orbitworks.app.dev), TestFlight, post-Phase-7 build.
- Website: https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app
- Test companies: jc-test-pro-dev (Pro) and jc-test-core-dev (Core) only.
  Logins: test/dev-e2e/creds.json.
- Before the run: dev functions deployed from employee-app (Phase 6 commits).
- After each test send "done <#>". I check dev read-only (Firestore, logs,
  website) and answer OK or FAILED.
- Location is saved on every punch, every plan, only at the punch. A punch
  never waits for it: no fix = the punch still saves, with no location.

## Step 0. Sites (website, as jc-pro-owner)

- Site A: an active site whose address is where you are testing, picked from
  the address suggestions (so it has a map pin). Note its name.
- Site B: an active site with a pin at least 2 km away.
- jc-pro-emp: assigned to Site B only (so "Phase 3 site" = Site B).
- jc-test-core-dev: one active site with a pin at your test spot (Core Site),
  and the Core employee assigned to a different site.

---

## Group L. Location permission (every plan)

Each test needs a phone that was never asked for location by OrbitsWorks Dev:
delete the app and reinstall it from TestFlight first.

### L1. Allow at sign-up
- Do: Open a new invite (or crew code) link, fill Screen 1 and 2, Submit.
  On "Share your location" tap Turn on location, then "Allow While Using
  App". Done on the PIN screen.
- See: "Share your location" shows after Submit and before the PIN screen;
  the phone's prompt has no "Always" choice; then the PIN screen as before.
  Home has no location banner. Settings > Location is on.
- [ ] OK  [ ] FAILED

### L2. Skip at sign-up, fix from the Home banner
- Do: Reinstall. New sign-up; on "Share your location" tap Skip for now.
  On Home tap the orange "Location is off..." banner, then "Allow While
  Using App".
- See: no prompt at sign-up after Skip; the banner on Home (same look as the
  No signal banner); tapping it shows the phone's prompt; the banner goes
  away after Allow.
- [ ] OK  [ ] FAILED

### L3. Skip at sign-up, fix from Settings
- Do: Reinstall. New sign-up, Skip for now. Settings tab: turn Location on,
  then "Allow While Using App".
- See: the switch was off; the phone's prompt shows; the switch is on; Home
  banner gone.
- [ ] OK  [ ] FAILED

### L4. Denied, fixed in the phone's Settings
- Do: Reinstall. New sign-up, Turn on location, "Don't Allow". On Home tap
  the banner. In the iPhone Settings page that opens set Location to "While
  Using the App", then go back to the app (don't close it).
- See: the banner opens iPhone Settings > OrbitsWorks Dev (no in-app
  prompt); back in the app the banner is gone without a restart; Settings >
  Location is on. Same from the Settings switch: turning it on opens iPhone
  Settings.
- [ ] OK  [ ] FAILED

---

## Group P. Punches (jc-pro-emp unless noted)

### P1. Online punch speed and location
- Do: At Site A, location on, good signal: Clock In, Start break, End
  break, Clock Out.
- See: every green screen as fast as in Phase 5 (no new wait, no spinner).
  Website Time Tracking > each of the 4 events: map + address. Firestore
  (I check): location, locationAccuracyM, locationFixAtMs on all 4.
- [ ] OK  [ ] FAILED

### P2. Offline punch with location
- Do: At Site A: airplane mode on (GPS still works). Clock In. Wait 10 min.
  Airplane off, app open until Synced.
- See: punch saved at once offline; after sync the website shows the
  original time and the map for it; the site is Site A (detected, see D1).
- [ ] OK  [ ] FAILED

### P3. No location: the punch still goes
- Do: iPhone Settings > OrbitsWorks Dev > Location > Never. Clock In, then
  Clock Out.
- See: both punch as fast as usual; Home shows the location banner; website
  shows "No location recorded" on both; the site is Site B (Phase 3).
  Afterwards set Location back to While Using.
- [ ] OK  [ ] FAILED

---

## Group D. Pro site detection at clock in

### D1. Inside a site: detected site wins
- Do: Stand at Site A (assigned only to Site B). Clock In.
- See: the website shows Site A with the "Auto-detected" tag (not Site B);
  Home shows Site A once synced; the timesheet approval row is Site A.
- [ ] OK  [ ] FAILED

### D1b. Site mismatch (same as supervisor punches)
- Do: Use the D1 clock-in (Site A detected, jc-pro-emp assigned to Site B
  only). Then on the website add Site A to jc-pro-emp's assigned sites,
  Clock Out, Clock In again at Site A. Afterwards set them back to Site B
  only.
- See: first clock-in: a "Clocked in at Site A - not one of their assigned
  job sites." alert in the website Alerts tab (and siteMismatch on the event,
  I check). Second clock-in (Site A assigned): no new mismatch alert. Clock
  out and breaks never get one. An employee with no assigned sites never
  gets one.
- [ ] OK  [ ] FAILED

### D2. Outside every site: Phase 3 site
- Do: Go 2+ km from every site (or test from home). Clock In.
- See: site = Site B (the one assigned site), no "Auto-detected" tag; the
  map shows where you were. If Site B has geofencing on: the outside
  geofence badge on the event and a "Clocked in ... from Site B" alert in
  the website Alerts tab (same as supervisor punches).
- [ ] OK  [ ] FAILED

### D3. Rough fix: no detection
- Do: iPhone Settings > OrbitsWorks Dev > Location > Precise Location off.
  Stand at Site A. Clock In. Afterwards turn Precise Location back on.
- See: site = Site B (a fix worse than 500 m is not used to pick a site),
  no "Auto-detected" tag; the website still shows the (rough) location.
- [ ] OK  [ ] FAILED

### D4. Out and breaks keep the clock-in site
- Do: Clock In at Site A (detected). Walk away 2+ km if you can (or stay).
  Start break, End break, Clock Out.
- See: all 4 events show Site A; each has its own location.
- [ ] OK  [ ] FAILED

### D5. Core: no detection
- Do: Sign in as the Core employee. Stand at Core Site (not assigned to
  them). Clock In, Clock Out.
- See: site = their Phase 3 site (crew code site, else their one assigned
  site, else Not specified), never Core Site, no "Auto-detected" tag; the
  map and address still show for both punches.
- [ ] OK  [ ] FAILED

---

## Group G. Still open from earlier runs (same build)

### N5. Sync tab window (from test-run-phase5.md)
- Do: Open the Sync tab.
- See: Synced rows only from today and the 2 days before; an older Failed
  row (if any) still shows.
- [ ] OK  [ ] FAILED

### 5d-1 to 5d-5. Invite autofill (Phase 5d)
- Do/See: exactly as in test-run-phase5.md, section "5d-1 to 5d-5. Invite
  autofill (Phase 5d)". The new "Share your location" step now shows
  between Submit and the PIN screen - Skip for now is fine there.
- [ ] 5d-1  [ ] 5d-2  [ ] 5d-3  [ ] 5d-4  [ ] 5d-5   (OK / FAILED each)
