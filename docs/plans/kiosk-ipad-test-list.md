# Kiosk mode (Task 5) - iPad test list (dev)

Build: OrbitsWorks Dev 1.1.6 (32), from feature/kiosk, on the dev TestFlight (com.orbitworks.app.dev). Dev website: https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app
Company: OT Test Co (ot-test-company, Pro). Seed: `node scripts/devSeedKiosk.js --project orbitworks-dev-ew --apply` (functions/, after `npm run build`).
Logins (functions/scripts/.dev-seed-logins.local, gitignored):
- Kiosk login "Front iPad" - sign in on the iPad.
- Kiosk Admin (Settings permission only) - its own PIN 8024 opens Kiosk Settings; it can also sign in to the website and make exit keys.
- OT Test Co owner (Task 1 seed login) - website, sees everything.
PINs: Kiosk Ava 2581, Kiosk Ben 3692, Kiosk Cal 4703. (OT A/C/D/E have no PIN - they hold the Overtime test data.)
Job site auto-detect: OT Test Co has no job sites. For a site on the punch, add one on the website (Sites) at the iPad's address first; without it punches show "Not specified".

iPad rotation: the build lets the iPad rotate (iOS requires all 4 orientations for an iPad app with Split View; phones stay portrait). Screens are not laid out for landscape yet - that is Task 7. Test in portrait; a stretched landscape view is expected, not a bug.

Exit key: website as owner or Kiosk Admin -> Settings -> Mobile app tab -> Kiosks card -> Front iPad -> Make exit key. The 4 digits show once with a 10:00 countdown; single use.

## On the iPad, in order
1. Sign in with the kiosk login. Expect Kiosk Home (name "Front iPad", time, PIN pad, gear). No tabs, no Log out. Allow location when asked (once).
   Website: Employees -> Front iPad has the teal Kiosk tag; Overview / Time / Approve Hours pickers don't list it; Billing count unchanged (8 active).
2. Clock in: PIN 2581 -> Ava, "Clocked out" -> Clock in -> photo (Use photo) -> green "Clocked in" -> Home after 3 s.
   Website: Approve Hours -> Ava's shift, Clock-in Type = Kiosk, Device = the iPad's name (or "Kiosk" until named in step 7); Session review tag "Kiosk"; Time page badge "Kiosk"; photo + face check as usual.
3. Start break: PIN 2581 -> Start break -> timer -> Back (Home, break still on). Then PIN 2581 -> End break -> "Break ended".
   Website: Ava's shift has the break (Type column only shows in/out types; breaks appear in the session).
4. Break while not clocked in: PIN 3692 (Ben) -> Start break -> "Please clock in first", nothing saved.
5. 3 wrong PINs: 1111, 1112, 1113 -> "Too many wrong PINs. Try again in 45 s", pad disabled, countdown. Close and reopen the app mid-wait -> still waiting.
6. Offline punch: airplane mode -> Home shows "Offline - punches are saved and sent later" -> PIN 3692 -> Clock in -> photo -> green screen. Reconnect -> "Sending 1 punch..." goes away within ~30 s.
   Website: Ben's clock-in at the time it was made (queued); same Kiosk type.
7. Settings with the admin PIN: gear -> 8024 -> Kiosk settings (Logged in as, Device name, Dark mode, Location, Last synced, App version 1.1.6). Rename the device (e.g. "Front gate iPad") -> Saved.
   Website: Settings -> Mobile app -> Devices: the iPad with a teal Kiosk tag and the new name; supervisor phones show Supervisor.
8. Settings with an exit key: Done -> gear -> type the key from the website -> Kiosk settings. Try the same key again -> "That key didn't work" (single use).
9. Exit refused while punches wait: airplane mode -> PIN 4703 (Cal) -> Clock in -> photo. Gear -> 8024 -> Exit Kiosk -> "Connect to send 1 punch first." Reconnect, wait for the punch to send.
10. Exit: Kiosk settings -> Exit Kiosk -> confirm -> back at the sign-in screen.

## After the run, on the website (OT Test Co)
- Reports / Payroll CSV + Excel / Full Report: Ava, Ben, Cal rows; no "Front iPad" row anywhere.
- Employee App invites, Temp Link and crew pickers: no Front iPad.
- The kiosk login on the website (sign in with it) -> "This is a Kiosk login" page, never the dashboard.
