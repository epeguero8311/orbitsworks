# Fresh-start test list (dev, from zero data)

The one ordered list of hand tests owed before the prod release. It starts
from a wiped dev environment with a single company and follows a real
customer's path, from first sign-in to a week of data. It replaces
`ios-test-list-old.md`. Every older test is mapped in the coverage table at
the end, or dropped there with a reason.

- **Written:** 2026-11-19, after the dev wipe (backup:
  `gs://orbitworks-dev-ew-backups/*/2026-11-19-prewipe`).
- **App:** OrbitsWorks Dev (com.orbitworks.app.dev), TestFlight **build 29**
  (`09fda33`). The same app is the supervisor app (supervisor login) and the
  Employee App (employee login).
- **Website:** https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app
  (hosted dev site, `09fda33`).
- **Backend:** dev only (`orbitworks-dev-ew`). Functions, rules and indexes
  are from `09fda33`. Stripe is in **test mode**, with a webhook to the dev
  site.

## How to run it

- **Order:** run the sessions in order. Each test says what it needs; most
  build on earlier tests.
- **Reporting:** reply "pass", "fail: <what you saw>" or "skip: <why>".
  - I record each result in the Results log at the bottom, with the date and
    build, and commit.
  - For a fail, I look into it (read-only on dev). I give you the cause and
    fix options, and I don't change code until you choose.
- **"I check":** I look at dev data read-only (Firestore, Storage, function
  logs).
- **"I set":** a dev data change I make for the test, only after you OK it
  at that step.
- **Stripe test cards:**

| Card | Use it for |
|---|---|
| `4242 4242 4242 4242` | Payment works |
| `5555 5555 5555 4444` | A second card that works (Mastercard) |
| `4000 0000 0000 0002` | Card declined |
| `4000 0000 0000 0341` | Saves, but the charge fails |

  Use any future expiry, any CVC and any ZIP.
- **Keep the app open and the screen on** while anything waits to sync,
  unless the test says to lock or kill it.
- **Geofence:** keep Site A's "Require geofence" **OFF** until Session 7.

## Accounts and emails

"you+x@gmail.com" means a Gmail alias of your own address: everything lands
in your normal inbox. Firebase treats each alias as a separate account.

| Email | Role | Created in |
|---|---|---|
| you+owner | Owner, **Shipmate (Pro-dev)**, Pro tier 1 (15 active / 20 total). Already exists. Set the password with the reset link. | Session 0 |
| you+owner2 | Owner, **Shipmate (Core-dev)**: signs up on the website, Free, then Core | A3 |
| you+admin | Admin, Pro company (email invite) | E1, E3 |
| you+sup | Supervisor, Pro company (email invite). Signs in on the phone for the supervisor app. | E1, E4 |
| you+sup2 | Supervisor invites from BOTH companies (PR-W6) | E5 |
| you+emp1 | **Main Pro employee**, crew code sign-up | E9 |
| you+emp2 | Pro employee, email invite (new person) | E10 |
| you+emp3 | Pro employee, "Invite to app" on the existing row Ana | E13 |
| you+emp4 | Pro employee, "Invite to app" on Dan (Sub Co) | E14 |
| you+emp8, you+emp9 | Throwaway invites (never sign up) | E12, E7 |
| you+wrong | Wrong-email attempt (never completes) | E10 |
| you+dup | Duplicate-flag sign-up, deleted afterwards | E15 |
| you+del1, you+del2 | Pro employees for Delete account | E9 |
| you+core1 | Core employee, email invite | E17 |
| you+del3 | Core employee for Delete account | X8 |

You'll also need:

- **Another person's face:** a friend, or a printed photo, for the mismatch
  tests.
- **Two addresses:** your desk (**Site A**), and a second real place 0.5 to
  2 km away that you can walk or drive to (**Site B**).
- **Optional:** a second iPhone, so you can keep the supervisor and
  employee logins side by side. Otherwise you log out and back in where a
  test says so.

## Sessions

| # | Session | Where | Time |
|---|---|---|---|
| 0 | Start: owner password, plan check, legal pages | web | 10 min |
| 1 | Account and billing (second company), settings, job sites, employees | web | 1 h 45 |
| 2 | Invites, crew codes, QR and links, every sign-up path, seat limits | web + phone | 2 h 15 |
| 3 | Supervisor app | phone + web | 1 h 30 |
| 3b | Role change while signed in, removing unsent punches, and logging out with unsent items (RC1 retests, build 30+) | phone + web | 2 h |
| 4 | Employee App at the desk: punches, PIN, offline and queue, desk site detection, notifications, Hours | phone + web | 3 h (two sittings OK: 4a H1-H12, 4b the rest) |
| 5 | Alerts, push and face checks | phone + web | 2 h (mostly waiting) |
| 6 | Website review: Time Tracking, corrections, reassign, Approve Hours, alerts, reports, Excel, analytics, auto break | web | 1 h 15 |
| 7 | Walking outside: geofence consent, leave tracking, site detection on clock-out | phone + web | 2 h 30 |
| 8 | Remove photo, delete employee, Delete account, photo cleanup | phone + web | 1 h |
| 9 | Billing: upgrade, failed payment, plan drop mid-shift, cancel to Free | web + phone | 1 h |
| 10 | Multi-day: a full week, overnight, Monday checks, auto clock-out | phone + web | ~15 min/day over 1 week |
| P | Prod smoke test (after the prod deploy) | prod | 45 min |
| AN | Android (once an Android build exists) | phone | later |

Total hands-on time is about 19 h, plus Session 10's week.

---

## Session 0. Start (web, 10 min)

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| A1 | web | The password reset link I sent you | 1. Open the link and set your password.<br>2. Sign in on the dev site as you+owner. | The dashboard opens with no Terms re-accept box (the company already accepted r7). Billing shows **Pro, tier 1**: 15 active, 20 total, status active, Visa ending 4242. |
| A2 | web | Sign out (or use a private window) | Open /terms, /privacy, /biometric-policy, /employee-notice and /support. | **Every page:**<br>- shows the 17 November 2026 version (Terms and Privacy r7);<br>- spells "OrbitsWorks" with no "OrbitWorks";<br>- says nothing about what AWS keeps.<br>**Biometric policy and Privacy:** mention the private photo links.<br>**Employee notice:** clock photos are usually deleted after 90 days.<br>**Policy and Terms §10:** mention Remove photo and Delete account. |

## Session 1. Account and billing, settings, job sites, employees (web, 1 h 45)

### a. Second company and billing

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| A3 | web | Private window, signed out | 1. Go to /signup. Fill in company "Shipmate (Core-dev)", your name and you+owner2.<br>2. Try Create without the Terms box.<br>3. Open both links.<br>4. Tick the box and create the account. | **Create:** disabled until the box is ticked. **Links:** open in a new tab.<br>**After sign-up:** lands on the dashboard; Billing shows **Free** (8 employees); Settings > Mobile App > "Ask for job site each time" is **ON**.<br>**I check:** company and user docs carry termsVersion r7; owner claims are set; employeeAppConfig exists. |
| A4 | web | Shipmate (Core-dev), Free | 1. Employees > Invite someone.<br>2. Crew Access.<br>3. Add employees "Free 1" through "Free 8" (name only).<br>4. Try "Free 9".<br>5. Delete Free 6, 7 and 8. | **Invite form:** Employee (app) is greyed with the plan reason.<br>**Crew Access:** crew codes are locked as a Pro feature.<br>**Employees:** 8 save; the 9th is refused with the employee-limit message. 5 remain. |
| A5 | web | Same company | 1. Billing > choose **Core, tier 1**. Pay with `4000 0000 0000 0002`.<br>2. Try again with `4242 4242 4242 4242`. | **Declined card:** a clear error, still Free.<br>**4242:** within seconds Billing shows Core tier 1 (15 active / 20 total) and the card. Nothing to refresh by hand: the plan came from the webhook.<br>**I check:** Stripe shows the subscription; Firestore planTier is `core2_tier1`. |
| A6 | web | Same | Billing > update the payment method to `5555 5555 5555 4444`. | Billing shows the Mastercard ending 4444. |
| A7 | web | A dev promo code, if you have one (otherwise skip: "no dev code") | Billing > apply the promo code. | The code is accepted and shows its label; the next invoice shows the discount. |

### b. Settings (Shipmate Pro-dev, you+owner)

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| B1 | web | — | Settings > **General**: upload a company logo, change it, edit business hours, save, reload. | Each change is kept after reload. The "Unsaved changes" dot shows until you save. The logo shows in the header. |
| B2 | web | — | Settings > **Export Settings**: set daily and total rounding, save, reload. | Kept. It's used again in R7 (Reports). |
| B3 | web | — | Settings > **Automations**:<br>- Automatic Break 30 minutes<br>- Minimum Shift Length 6 hours<br>- Auto clock-out ON, 12 worked hours<br>Save and reload. | Kept. The Auto clock-out help text says breaks aren't counted and admins get an alert. |
| B4 | web | — | Settings > **Alerts**: look at each switch. Turn "Face recognition alerts" off, then on again. | **Defaults:** every alert is ON.<br>**Face recognition off:** the two sub-switches, "Face didn't match" and "No face detected", are greyed.<br>**Fields:** each "Alert after / Warning at" field can be edited. |
| B5 | web | — | Settings > **Mobile App**. | **Switches:** "Ask for job site each time" ON, "Allow supervisor override", "Require Reason for Supervisor Overrides", "Allow creating employees from the app" and "Allow updating employees from the app" all show.<br>**Devices card:** empty, no lock. |
| B6 | web | — | Type "overtime" in the Settings search bar. | It jumps to the Alerts tab, to the Overtime warning field. |

### c. Job sites and geofence

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| C1 | web | Your desk address | Sites > add **Site A**. Pick the address from the suggestions, radius 300 ft, Require geofence **OFF**. | **Map:** a pin at your desk.<br>**Help text under the switch:** says it FLAGS and never blocks. |
| C2 | web | Second address | Add **Site B** the same way, geofence OFF. | Pin shows. |
| C3 | web | — | Add **Site C**: type a name only, don't pick an address. | Saves. The geofence switch is locked with "Add one on the Sites page" (or similar). |
| C4 | web | — | Add 9 quick sites with names only, so there are 12 sites. Then delete those 9. | **With 12 sites (10-W4):** the list shows 10, then "Show 2 more".<br>**After the deletes:** 3 sites remain. |
| C5 | web | — | Jobs > **Titles & Pay**:<br>1. Add 2 titles with rates.<br>2. Edit one and change its rate.<br>3. Deactivate one.<br>4. Delete a test title. | **Edit:** opens a window.<br>**Rate change:** asks for the effective date.<br>**Rows:** show only Edit.<br>**Paging:** 10 at a time, if you have 11 or more. |
| C6 | web | Signed in as you+owner2 | Core company: add **Core Site** at your desk address and **Core Site 2** at Site B's address. | Both pins show. Core has no geofence switch, or it is locked with the plan reason. |

### d. Employees (Pro, website)

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| D1 | web | Another person's face (photo file) | Employees > Add employee **Ana Adminmade**: Site A, a birthday, and the **other person's** photo. | **Row:** a PIN (4 digits, never "-"), the photo, no app tag.<br>**Edit window:** shows the same PIN (PR-W4). |
| D2 | web | — | Add **Ben Nophoto**: Site B, birthday 1990-05-05, no photo. | Row with a PIN, and the "No face check" tag (no photo). |
| D3 | web | — | 1. Open Ana > Edit. Change her PIN to a new number and save.<br>2. Try Ben's PIN for Ana. | **New PIN:** the table shows it within a few seconds (PR-W4).<br>**Ben's PIN:** refused, nothing saved. |
| D4 | web | A photo with 2 faces, or none | Add **Cara Badphoto** with that photo. | Within about a minute: a "Photo needs update" tag and an Overview **Bad Reference Photo** alert. |
| D6 | web | — | 1. Employees > Subcontractors: add **Sub Co**.<br>2. Add **Dan Subco**: Site A, birthday 1985-03-03, company Sub Co, no photo.<br>3. Set the Employees company filter to Sub Co. | **Filter (9-E5):** shows only Dan.<br>**Company column:** Sub Co. |
| D7 | web | — | 1. Deactivate Ben, then Show inactive.<br>2. Reactivate him.<br>3. Search "ana", then an email, then "zzz". | **Inactive:** Ben moves to the inactive list and the seat count drops; reactivating puts him back.<br>**Search (10-W3):** filters both lists, and "zzz" shows nothing. |

D5 (Remove photo on Cara) runs in Session 3, after N9.

## Session 2. Invites, crew codes, sign-ups (web + phone, 2 h 15)

Start with the app installed and signed out.

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| E1 | web | you+owner | Employees > **Invite someone** (9-E1). Send three invites:<br>- Employee (app) **you+emp2**, Site A<br>- Supervisor **you+sup**, Sites A and B<br>- Admin **you+admin** | **Form:** one form; the fields change by role; seats left show for every role.<br>**Lists:** each invite lands in its own list as Pending, email status Sent.<br>**Email:** 3 arrive (check spam). |
| E2 | web | — | Invite **you+admin** again, as Supervisor (9-E3). | "There's already a pending invite for that email." |
| E3 | web | Private window | Open the admin email link and sign up as you+admin. | Lands as **admin** of Shipmate (Pro-dev). Billing can't be changed (owner only). The owner's Employees page shows the invite Accepted. |
| E4 | web | Private window | 1. On you+sup's row, Copy invite link (PR-W5).<br>2. Open it and sign up as you+sup. | **Link:** contains `&invite=`.<br>**Sign-up:** lands as **supervisor** of Shipmate (Pro-dev). |
| E5 | web | Both owners | 1. You+owner2 invites **you+sup2** as Supervisor. You+owner invites **you+sup2** as Supervisor too.<br>2. Open the Pro invite link with the `&invite=...` part removed.<br>3. Open the full link. | **Without `&invite=` (PR-W6):** refused, "You have more than one invite…".<br>**Full link:** works and lands in the right company. |
| E6 | web | you+emp2's invite | 1. Copy link.<br>2. Resend (B3). | **Copy link:** the same URL as the email.<br>**Resend:** a second email with the same link; expiry moves to 7 days from now; Resend is locked for 60 seconds. |
| E7 | both | — | 1. Invite **you+emp9** as Employee (app). Revoke it and confirm (B4).<br>2. On the phone, signed out, tap its email link.<br>3. Website: Remove the row. | **Status:** Revoked.<br>**Phone:** "Invite no longer active".<br>**Remove:** the row disappears. |
| E8 | web | — | 1. Crew Access > **Create crew code**. Pick Site A, then Site C, then "+ New job site" (8-Q1).<br>2. Pick Site A again, change its radius to 400 ft and save the code.<br>3. Open the Sites page, then put Site A back to 300 ft, geofence off.<br>4. Open the code's **Info** (8-Q2), Download QR and Copy link.<br>5. Look at the Crew onboarding list (9-C1). | **Code window:** no "Location: Required/Optional" choice; Site A's switch shows its own radius and setting; Site C is locked (no address); a new site is locked until an address is picked; the 400 ft change shows on the Sites page.<br>**Info:** no "Location required" row.<br>**QR and link:** the QR downloads, and the link matches Info.<br>**List:** a Geofence column ("Off"); Copy link only on active codes. |
| E9 | phone | The crew code QR on screen, or its /j/ link | Sign up three times from the **same Wi-Fi**, deleting and reinstalling the app between each (PR-J1, B1): first **you+del1**, then **you+del2**, then **you+emp1** last.<br>**Every time:** check the join screens and the Step 1 and Step 2 buttons (TNB).<br>**On you+emp1:** at "Share your location" tap **Allow While Using** (6-L1). After the PIN screen tap Done, open Settings, then clock in once.<br>**Website:** look at Employees. | **Rate limit:** all 3 sign-ups work, with no rate-limit message.<br>**Buttons:** match the TNB checklist ("Join flow top-bar buttons" and "App sign-up Back / Cancel": scanner Cancel, Checking..., selfie Back, Step 1 Cancel only, Step 2 Back keeps fields, Step 2 Cancel confirm, greyed while creating).<br>**Consent screen:** shows the v2 face text ("…usually deleted after 90 days… I can delete my account in Settings…").<br>**Location step (6-L1):** after Submit and before the PIN; no Always choice; no banner after.<br>**Settings PIN:** shows at once, the same as the welcome screen (TNB fresh joiner).<br>**Clock-in:** works.<br>**Website:** 3 new employees with selfies, the gray Employee tag, Site A. |
| E10 | phone | you+emp2's invite email; sign you+emp1 out first | 1. Tap the invite link. Sign up with **you+wrong** (B5).<br>2. Fix the email to **you+emp2** and sign up (B6, 5d-1). At the location step tap **Skip**, then on Home tap the banner and Allow (6-L2). | **Wrong email:** back on Step 1 with "Use the email address this invite was sent to."; the invite stays Pending.<br>**Correct sign-up:** "Joining Shipmate (Pro-dev)"; email locked; name empty; welcome shows a PIN; Home opens.<br>**Location banner:** shows; the phone's prompt opens from it; the banner goes away.<br>**Website:** invite Accepted, new employee with the selfie and Site A. |
| E11 | phone | Signed out, then signed in | 1. Signed out: tap emp2's link again (B8), then the revoked emp9 link (5d-5).<br>2. Edit a pending invite's email on the website (edited link), then tap the old link.<br>3. Signed in: tap any invite link (B10). | **Signed out:** each link shows "Invite no longer active" and leaks no name or email.<br>**Signed in:** the app opens and stays on Home. |
| E12 | phone | Send a throwaway Employee (app) invite to **you+emp8** | Open an invite link and type a 1-letter name, then an empty name (5d-4). Revoke the invite afterwards. | "Enter your full name." |
| E13 | both | Ana's row | 1. Ana > Edit > Employee app > **you+emp3** > Invite to app. Check the table.<br>2. Sign up on the phone (B9, 5d-3, B11). Keep the name. Skip location, then turn on the Settings Location switch (6-L3).<br>3. Clock in. | **Table:** "App invite sent".<br>**Sign-up:** the name is prefilled; welcome shows **Ana's existing PIN**.<br>**Location:** the prompt shows and the switch turns on.<br>**Website:** still ONE Ana row, now with your selfie and the Employee tag.<br>**Clock-in face check:** **Match**, against your new selfie rather than the old photo. |
| E14 | both | Dan's row | 1. Dan > Invite to app **you+emp4**. Sign up and change the name to "Dan Subco Renamed" (5d-2).<br>2. Open Settings (10-A1e). | **Website:** one Dan row, renamed, same PIN, still Sub Co.<br>**Phone Settings:** Company = **Shipmate (Pro-dev)**, never Sub Co. |
| E15 | both | Crew code | 1. Sign up **you+dup** with the name "Ben Nophoto" and birthday 1990-05-05 (9-E4).<br>2. Website: look at Employees, then dismiss the flag.<br>3. Delete the you+dup employee. | **Flag:** a "possible duplicate" badge, the Edit box with a link to Ben; dismissing clears it; Ben is untouched. |
| E16 | phone | Notes app with links | 1. Tap the crew code's /j/ link.<br>2. Tap an /i/ link.<br>3. Turn on airplane mode and open the /j/ link.<br>4. Revoke a spare crew code (make one first) and open its link. | **Links:** both open the app (universal links).<br>**Airplane mode:** "Can't connect", with Cancel at top right and Retry; Retry works once you're back online.<br>**Revoked code:** "Code no longer active" with Cancel. |
| E17 | both | you+owner2 (Core) | 1. Invite **you+core1** as Employee (app), Core Site (B2 Core). The email arrives; the /i page shows "Shipmate (Core-dev)" and an "OrbitsWorks Dev" install step in plain text.<br>2. Sign up on the phone and tap **Don't Allow** for location.<br>3. Banner > iPhone Settings > While Using > back (6-L4). | **Sign-up:** works.<br>**Banner:** opens iPhone Settings, then disappears without a restart.<br>**Website:** the invite is Accepted. |
| E18 | web | you+owner | 1. Add filler employees until **15 active**, then try a 16th.<br>2. Open Invite someone (9-E2).<br>3. Delete the fillers. | **16th:** refused with the employee-limit message.<br>**Invite form:** every role "(not available)" with "No seats left…", and Send is disabled.<br>**After deleting:** seats come back. |
| E19 | web | — | Crew Access > Temp link: make 2 links (9-C2), then 10 more (10-W1). | **After 2:** "Active temp links (2)".<br>**After 12:** History shows 10, and "Load older links" adds 2 then goes away. The Active list shows only unexpired links. |

## Session 3. Supervisor app (phone + web, 1 h 30)

Sign you+emp1 out of the app first. If there's a warning, nothing should be
waiting. Sign in as **you+sup**.

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| F1 | both | — | 1. Sign in as you+sup.<br>2. Website > Settings > Mobile App > Devices: rename the phone "Front desk iPhone".<br>3. Lock the device, try a punch, then unlock it. | **Home:** loads with your name and the site pill.<br>**Devices:** the phone appears with Last seen / Last used by; the new name shows.<br>**Lock and unlock:** behave as the Devices card's help text says. |
| F2 | both | — | 1. Airplane mode on. Clock in Ben, Dan (emp4) and Cara with PIN and photo (S1).<br>2. Airplane mode off and open Sync Queue. | **Sync:** all 3 rows leave Waiting within seconds; a photo step never blocks the next one.<br>**Home:** shows all 3 working.<br>**I check:** each event landed before its photo; one faceCheckClaims doc per event. |
| F3 | both | Ben clocked in at Site A | 1. Start Break, then End Break.<br>2. With the pill on Site B, Override > Clock out Ben (S2, 10-F6). | **Break:** no camera, no location prompt.<br>**Website:** both breaks and the clock-out show **Site A**. |
| F4 | phone | — | 1. Note Home's active count.<br>2. Airplane mode on. Kill and reopen the app (S3). | Splash goes away in a few seconds. The same count and name show, with "Offline - last updated". |
| F5 | both | Still offline | Create employee **S4 Test** with an unused PIN and clock them in (S4). Open Sync Queue, then airplane mode off. | **Photo notice:** the bilingual "Before this photo is taken" notice shows.<br>**Sync:** both rows listed; the employee syncs first, then the clock-in.<br>**Website:** one S4 Test row, with the clock-in at the original time. |
| F6 | both | — | 1. Online: Edit S4 Test, set a new unique PIN, clock them out with it (S5).<br>2. Edit again with Ana's PIN.<br>3. Airplane mode on, set S4 Test to an unused number. On the website, give Ben that same number. Airplane mode off. | **New PIN:** works.<br>**Ana's PIN:** refused, nothing saved.<br>**Clash:** phone notice "S4 Test's PIN changed to NNNN"; the website Overview has one "PIN Changed" alert; nothing in the supervisor Alerts tab and no push. |
| F7 | both | — | Airplane mode on, edit S4 Test's name, open Sync Queue, airplane mode off (S6). | **Sync:** Waiting, then Synced.<br>**Home:** shows the new name. Archive S4 Test on the website afterwards. |
| F8 | both | Settings > Mobile App: supervisor override ON, Require reason ON | Override clock-in Dan with no reason, then with a reason. | **No reason:** refused.<br>**With a reason:** saved; the website shows the override and the reason. |
| F9 | both | — | 1. Pick Dan > camera screen > **Comment** (top right). Type, Save Comment, take the photo (CC-1).<br>2. Later, clock Dan out with no comment. | **Comment button:** shows a check once saved.<br>**Time Tracking:** "View comment" on the clock-in only; the event detail shows "Employee comment: …".<br>**Approve Hours:** the blue comment icon opens it. |
| F10 | both | Needs emp1 on the phone afterwards | 1. Clock **you+emp1** in with a comment (CC-2).<br>2. Sign out, sign in as you+emp1, Home > Comments: add a shift comment. Clock out.<br>3. Sign back in as you+sup. | **Website:** both comments show; the Approve Hours icon count is 2; Shift details lists the clock-in comment, then the shift comment. |
| F11 | both | — | Airplane mode on. Clock someone in with a comment. On the next punch, open a comment and Cancel. Online, let it sync (CC-3). | The first punch syncs with its comment; the second has none. |
| F12 | both | emp1 is assigned **only Site B** (change on the website); emp1 is clocked in at your desk (Site A) by the employee app | Switch the pill to Site A, Site B and No Site. Look at the Breaks list and the Override lists (10-A3a-d). Repeat one clock-in offline. | **Counts (10-A3a):** emp1 is under Site A (Active card), not Site B.<br>**Breaks and Override "Clock out" (10-A3b):** under Site A only; Override "Clock in" follows the assigned sites.<br>**Offline (10-A3c):** counted at Site A at once.<br>**No Site (10-A3d):** only people with no site.<br>Put emp1 back on Site A afterwards. |
| F13 | both | Ask for job site each time ON | 1. Clock Ben in at your desk, picking Site B (10-F5).<br>2. Turn the setting OFF. Clock in with the pill on Site B. | **ON:** Site B is kept.<br>**OFF:** Site A + Auto-detected. |
| F14 | both | **I set** (with your OK): remove `appSettings.askJobSiteEachTime` on Shipmate (Pro-dev) | Clock in standing at Site A, picking Site B (PR-S1). Then save Settings with the toggle ON and repeat. | **Without the setting:** Site A, marked as corrected.<br>**After saving ON:** Site B is kept. |
| F15 | phone | — | PIN clock-in for Ben, online, then in airplane mode (PR-P3). | Both work. |
| F16 | phone | A temp link from E19 | Open the temp link on the phone (Safari). Clock Ben in with his PIN, then try a wrong PIN (PR-P4). | **Right PIN:** accepted.<br>**Wrong PIN:** "PIN not recognized". |
| F17 | both | Settings > Mobile App: Allow updating employees ON | Edit Dan in the app and take a new photo. | The website shows the new photo. **I check:** an employeeUpdates record exists, and the old photo is kept (30-day rule). |
| N7 | both | Pro | Clock **emp1** in with the face out of frame (10-FN5). | **Website:** a "No Face Detected" alert.<br>**emp1's phone:** nothing; check when you next sign in as emp1. |
| N8 | both | Ben has no photo | Clock Ben in and out. | No face result on the website ("-") and no face alert. |
| N9 | both | Cara has the bad photo | Clock Cara in. | No face result (checks paused). Still exactly one Bad Reference Photo alert. |
| D5 | web | Cara | Employees > Cara > **Remove photo** > Cancel. Then Remove photo > **Yes, remove photo** (BIO-W3, plus BIO-W1's Cancel path). | **Cancel:** changes nothing.<br>**Yes:** the photo is gone; the "Photo needs update" tag and the Bad Reference alert both go away; the row shows "No face check". |
| F18 | phone | — | Open the supervisor **Alerts** tab. | Shows today's alerts (No Face Detected, Bad Reference Photo, …). It never shows web-only types (Late Punch on Approved Timesheet, Deleted App Account). |

## Session 3b. Role change while signed in (phone + web, 2 h)

RC1 retests. **Needs build 30 or later** (the RC1 fix; build 29 fails
these). Use **you+emp1** on the phone (an Employee App login) and the
website as you+owner on the computer. The website change is always made
on the computer, never on the phone.

- **Done right:** after a change the phone shows "You're now a supervisor" or "Your access changed" for a few seconds, then the new app. The app is never left with an empty list, 0 active, or your email instead of your name.
- **I check (every test):**
  - users/{uid} has the new role and a new roleChangedAt.
  - The phone's token has the new role (no permission-denied in Sentry for this login after the switch).
  - Every punch made in the test is on the server with the time it was made.

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| RC1-1 | both | emp1 signed in, **clocked in**, app open, online | Website: Employees > emp1 > turn **Supervisor access** on. Watch the phone, don't touch it. | **Phone:** within about 10 s, "You're now a supervisor", then supervisor Home **without a restart**: your name, the employee list, emp1 counted as active.<br>**Website:** emp1's clock-in is unchanged. |
| RC1-2 | both | Continue from RC1-1 (emp1 is a supervisor) | PIN clock-in **Ben**, online. Then airplane mode on, PIN clock-out **Ben**, airplane mode off. | **Both:** green screen, then on the website within seconds at the right times. Sync Queue ends empty. |
| RC1-3 | both | Website: turn emp1's Supervisor access **off** first; the phone goes back to the Employee App. emp1 still clocked in. | 1. Airplane mode on. Start Break, End Break (both queued).<br>2. Website: turn Supervisor access **on**.<br>3. Wait 1 minute, then airplane mode off. | **While offline:** the phone stays on the Employee App and works normally.<br>**Back online:** "You're now a supervisor - sending what's saved first", then supervisor Home.<br>**Website:** both breaks at the times you tapped them; nothing left in Sync Queue (no "Your own punches" card). |
| RC1-4 | both | emp1 is a supervisor, clocked in | 1. Airplane mode on. PIN clock-in **Dan** (queued).<br>2. Website: turn emp1's Supervisor access **off** (demote while clocked in).<br>3. Airplane mode off. | **Back online:** "Your access changed - sending what's saved first", then the Employee App.<br>**Website:** Dan's clock-in landed at the right time.<br>**Employee App:** Home shows emp1 **still clocked in**; Clock out works and appears on the website. |
| RC1-5 | both | emp1 back to Supervisor access on (from RC1-4) | Website: turn **Admin** on, wait, then Admin off again (supervisor only). | **Both changes:** the supervisor app keeps working with no empty screens; at most a brief "Updating your access".<br>**Admin on:** Edit employee shows the PIN field.<br>**Admin off:** the PIN field is gone. |
| RC1-6 | both | emp1 is a supervisor | 1. Kill the app.<br>2. Website: turn Supervisor access **off**.<br>3. Open the app. | Never shows the supervisor screens with an empty list (the build 29 bug). Goes to "Your access changed", then the Employee App. |
| RC1-7 | both | emp1 is an employee, clocked out | The original FAIL, exactly: clock in, wait 2 minutes, then on the website make emp1 a supervisor. Then PIN-clock **Ben** in and out. | Supervisor app with name, list and counts. Both of Ben's punches are on the website. |
| RC1-8 | both | emp1 is a supervisor, signed in | Website: **deactivate** emp1. Then reactivate and set Supervisor access off. | **Deactivate:** "Account deactivated" at once (same as before).<br>**Reactivate:** sign in works again, and it opens the Employee App. |

RC1 follow-up retests (build 30+, functions deployed 2026-11-20):
removing an unsent punch warns and alerts the admin, a promotion also
sends comments and leave tracking, and the website follows a role change
or deactivation within seconds.

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| RC1-9 | both | emp1 is an employee, **clocked in**, on the Employee App. Make a punch fail: airplane mode on, tap **Clock out** (queued). On the website, clock emp1 out by hand (Time Tracking). Airplane mode off: the phone's clock-out shows **Failed**. | Sync tab > Remove on the Failed clock-out. Read the box. Tap **Keep it**. Then Remove > **Remove for good**. | **The box:** red "Lose this clock-out?", says it was never recorded, is lost for good, can't be sent or brought back, and that your admin will be told. "Keep it" is the first button.<br>**Keep it:** the row is still there.<br>**Remove for good:** the row is gone.<br>**Website Overview, within a minute:** one "emp1 - Unsent Punch Removed" alert with the clock-out's time and "never recorded".<br>**I check:** one punchRemoved alert keyed by the punch's id. |
| RC1-10 | both | Make another Failed punch (as in RC1-9, with a break start this time) | Airplane mode **on**. Remove it (Remove for good). Wait 2 minutes. Airplane mode **off**. | **While offline:** removing works; nothing on the website.<br>**Back online, within a minute:** exactly one Unsent Punch Removed alert for the break start (sent once, never twice). |
| RC1-11 | both | emp1 clocked out | 1. Airplane mode on. Clock in (queued), then add a shift comment "RC1 lost comment".<br>2. On the website, clock emp1 in by hand.<br>3. Airplane mode off: the clock-in fails and the comment shows **Not synced**.<br>4. Remove the Failed clock-in, then Remove the comment. | **Comment box:** "Delete this comment for good?", never saved, gone for good, admin will be told.<br>**Website:** two alerts: the clock-in, and the comment with its text "RC1 lost comment". |
| RC1-12 | phone | After RC1-9 to RC1-11; sign in as you+sup | Open the supervisor **Alerts** tab. | No "Unsent Punch Removed" alerts there (website only, like Deleted App Account). |
| RC1-13 | both | **Pro**, Site A geofenced. emp1 an employee, clocked in **from the phone** at Site A (leave tracking on). | 1. Airplane mode on. Add a shift comment "before promotion".<br>2. Website: turn emp1's Supervisor access **on**.<br>3. Wait 1 minute, airplane mode off. | **Phone:** "You're now a supervisor - sending what's saved first", then supervisor Home, with **no** "still on this phone" notice.<br>**Website:** the comment is on emp1's shift; Time Tracking shows a "Tracking off (made a supervisor/admin)" stretch starting at the switch.<br>**I check:** no siteExits row after the switch, nothing left in employee_punches.db for emp1. |
| RC1-14 | both | emp1 an employee with a Failed punch on the phone (as in RC1-9) | Airplane mode on. Remove it. Website: turn Supervisor access **on**. Airplane mode off. | The removal report is sent before the switch (or from the supervisor app right after): **exactly one** Unsent Punch Removed alert. The supervisor app works normally. |
| RC1-15 | web | Make emp1 an **admin** (Supervisor + Admin on). On the computer, sign in to the website as **you+emp1** in one browser, and as you+owner in a private window. | Owner window: turn emp1's **Admin** off. Watch the you+emp1 window, don't reload. Then turn **Supervisor** off too. | **Admin off, within about 10 s:** the you+emp1 window loses admin-only pages (e.g. Settings, the PIN field) with no reload; any admin page left open stops working.<br>**Supervisor off:** within about 10 s it goes to the "use the app" page.<br>**I check:** no permission-denied errors in the console after the switch. |
| RC1-16 | web | emp1 a supervisor, signed in to the website as **you+emp1**; you+owner in a private window | Owner window: **deactivate** emp1. Watch the you+emp1 window. Then reactivate emp1. | **Deactivate:** the you+emp1 window is signed out within about 10 s (not up to an hour).<br>**Reactivate:** you+emp1 can sign in again. |

Logout retests (build 30+, app only - no server change, 2026-11-21):
both apps' Log out warn about what hasn't sent, offer Send now, and never
delete it; supervisor-app rows are sent only by the login (and company)
that saved them.

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| LO-1 | both | emp1 clocked out, on the Employee App | 1. Airplane mode on. Clock in, then add a shift comment.<br>2. Settings > **Log out**. Read the box.<br>3. Tap **Send now** (still offline).<br>4. **Stay signed in**. Airplane mode off. Log out again > **Send now**. | **Box:** "1 punch and 1 comment haven't sent yet"; says nothing is deleted, they send when you sign back in, and a punch can only be recorded within 24 hours. Buttons: **Send now** (first), **Log out anyway**, Stay signed in.<br>**Send now offline:** the box stays: "2 still haven't sent. Check your signal…". Not logged out.<br>**Send now online:** sends, then logs out by itself.<br>**Website:** the clock-in (original time) and the comment. |
| LO-2 | both | emp1 clocked in | Airplane mode on. Clock out. Log out > **Log out anyway**. Airplane mode off. Wait 5 min. Sign back in as you+emp1. | **While signed out:** nothing on the website.<br>**After sign-in:** the clock-out sends within a minute at its **original** time. Nothing was deleted. |
| LO-3 | both | Sign in on the phone as **you+admin** (supervisor app) | 1. Airplane mode on. PIN clock-in for Ana. Edit emp2's name (add " T").<br>2. Settings > **Log Out**. **Send now** (offline).<br>3. Airplane mode off. **Send now**. | **Box:** "1 punch and 1 employee change haven't sent yet", nothing is deleted, sent only by this login.<br>**Offline:** stays open, "2 still haven't sent…".<br>**Online:** sends, then logs out.<br>**Website:** Ana's clock-in and emp2's new name. Put the name back. |
| LO-4 | both | Sign in as **you+sup** (supervisor app) | 1. Airplane mode on. PIN clock-in for Ana. Log Out > **Log out anyway**.<br>2. Airplane mode off. Sign in as **you+admin**. Open Sync Queue, tap Sync Now, wait 5 min.<br>3. Log out (you+admin), sign in as **you+sup**. | **As you+admin:** Ana's row shows **"Another login's"** with "Saved by another login on this phone…", no Retry, never Stuck. The tab badge doesn't count it. Log Out shows **no** box (nothing of you+admin's).<br>**Website while you+admin is in:** no clock-in for Ana.<br>**Back as you+sup:** it sends within a minute, at its original time.<br>**I check:** no permission-denied for it in Sentry. |
| LO-5 | both | Sign in as **you+sup** | 1. Airplane mode on. PIN clock-in for Ana. Log Out > Log out anyway.<br>2. Airplane mode off. Sign in as **you+owner2** (the Core company). Open Sync Queue.<br>3. Log out, sign in as you+sup. | **As you+owner2:** the row shows as another login's; nothing is sent to the Core company.<br>**Back as you+sup:** it lands in Shipmate (Pro-dev) at its original time. |
| LO-6 | phone | Nothing waiting (Sync Queue / Sync tab empty) | Log out on the Employee App (you+emp1), then on the supervisor app (you+sup). | Both log out at once, with no box. |

## Session 4. Employee App at the desk (phone + web, 3 h)

Sign out of you+sup and sign in as **you+emp1** (assigned Site A). You're at
Site A, geofence off.

### Punches, PIN, offline and queue

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| H1 | both | Clocked out, good Wi-Fi | Clock In with PIN and photo, Start Break, End Break, Clock Out (T2, 6-P1, N4, TNB 1). | **Camera:** opens right after the 4th digit, with no "Checking PIN...".<br>**Green screen:** right after the photo, with no "Will sync" line and no spinner.<br>**Sync tab:** rows Synced in seconds; Last synced = now.<br>**Website:** a map and address on all 4 events. |
| H2 | phone | Online | Clock In with a wrong PIN 3 times. During the lock, try the right PIN. After the lock, try it again (TNB 3, N1 online). | **Wrong PINs:** "Wrong PIN. 2 tries left before a 1-minute lock.", then 1 left, then "Too many wrong PINs. Try again in 60 seconds." with a countdown.<br>**During the lock:** the right PIN is refused.<br>**After:** it works and the count starts fresh.<br>**Throughout:** no camera, and nothing on the Sync tab. |
| H3 | both | — | Airplane mode on. A wrong PIN, then the correct PIN with a photo. Airplane mode off (N1, TNB 4). | **Wrong PIN:** refused at once.<br>**Correct PIN:** the camera opens instantly, then green + "Will sync when online"; the row goes Synced when you're back online. |
| H4 | phone | Clocked in from H3 | Airplane mode on. Clock Out with 3 wrong PINs. Kill and reopen the app, open Clock Out. After the countdown, use the correct PIN. Airplane mode off (N2). | **Lock:** the countdown survives the restart.<br>**After it ends:** the correct PIN works. |
| H5 | both | Clocked out | 1. Airplane mode on. Clock In, Start Break, End Break, Clock Out; write down the 4 times.<br>2. Open Hours > Today.<br>3. Wait 6 minutes. Kill and reopen the app. Wi-Fi on, and stay on Home (T3, H3). | **While offline:** green + "Will sync" on each punch; 4 Waiting rows, badge 4; after the reopen, "Done for the day" with hours; Hours shows blue "Will sync" tags.<br>**Online:** the rows go Synced and the tags turn gray "Synced late".<br>**Website:** all 4 at your times, with "Synced late". |
| H6 | both | Clocked in online | Online: Start and End Break. Airplane mode on: Start and End Break. Airplane mode off (T16). | **Online:** instant, no "Will sync" line.<br>**Offline:** instant + "Will sync"; the rows sync once you're online. |
| H7 | both | Clocked in | 1. Comments: add "test online". Airplane mode on: add "test offline". Airplane mode off (K1).<br>2. Clock out.<br>3. Airplane mode on. Clock In, add a comment, Clock Out. Airplane mode off (C1). | **K1:** both comments show at once, newest first; "test offline" has a "Will sync" pill until it syncs; the 0/1000 counter shows; "Shift started" is at the top; Home shows hours after the clock-out.<br>**C1:** Clock in, Comment and Clock out rows go Waiting, then Synced. |
| H8 | both | Clocked out | 1. Airplane mode on. Clock In, add a comment, then go straight to Settings > Log out (LO1, T9).<br>2. Airplane mode off. Sign back in as you+emp1. Clock Out. | **Log out box:** "1 punch and 1 comment haven't sent yet" / "Nothing is deleted…" (build 30+; tap **Log out anyway**).<br>**After signing back in:** both rows sync at their original times. |
| H9 | both | — | 1. Open Settings. Then airplane mode on, kill and reopen the app, Settings again (10-A1a, PR-P1, 10-PIN1, TNB PIN row).<br>2. Notifications switch: off, then back on through iPhone Settings (SE2).<br>3. Location switch: the same (SE3). | **Rows:** Email, PIN (the digits), Birthday, Company; no Subcontractor, Job site or Location access rows.<br>**PIN:** the same as the website, and still showing offline.<br>**Switches:** each one follows the phone's own setting. |
| H10 | both | Website open on emp1's Edit window | 1. Airplane mode on. Clock In with the current PIN; write down the time.<br>2. Website: change the PIN.<br>3. Wait 5 minutes. Airplane mode off; open Settings.<br>4. Clock Out with the old PIN, then the new one (P1, PR-P2, 10-PIN2, TNB 2, TNB PIN row). | **Sync:** the clock-in syncs (Synced late), with no red text.<br>**Settings:** the new PIN within a few seconds.<br>**Old PIN:** "Wrong PIN". **New PIN:** works.<br>**TNB 2:** a new PIN typed before the app refreshes still works, and the keypad never freezes more than about 3 s. |
| H11 | both | Clocked out | 1. Airplane mode on. Website: change the PIN.<br>2. Phone: Clock In with the **old** PIN, then add a comment.<br>3. Airplane mode off.<br>4. Remove the comment row, then the clock-in row (P2, K2).<br>5. Clock In with the new PIN. | **Failed rows:** Clock in "Couldn't sync, please speak to your supervisor." (Remove only); Comment "Not synced, tell your admin."; the badge counts both; Hours shows a red "Not synced".<br>**After the Removes:** Home is Clocked out.<br>**New PIN:** works. |
| H12 | both | Clocked out | Airplane mode on. Clock In with PIN A. Website: change to B, then to C. Airplane mode off. Clock Out with C (P3). | The clock-in syncs with no Redo; C works. |
| H13 | both | Network Link Conditioner (Developer settings) | 1. 100% Loss: Clock In. Turn it off within 1 minute.<br>2. 100% Loss again: Clock Out. Turn it off after 3 minutes (T4). | **Both punches:** green + "Will sync"; a "Weak signal" banner.<br>**Website:** no "Synced late" on either.<br>**I check:** the clock-in has server time; the clock-out is queued with no syncedLate. |
| H14 | both | Clocked in | 1. Airplane mode on. Clock Out (10:00). Wait 3 minutes. Clock In (10:03).<br>2. Website: add a clock-out at 10:01.<br>3. Airplane mode off. Remove the failed row (T7). | **Failed row:** "Not recorded, tell your admin.", with Remove only.<br>**Confirm box:** "Remove this Clock out?".<br>**After Remove:** the clock-in syncs at 10:03.<br>**I check:** the 10:00 photo is deleted. |
| H15 | both | Clocked in | 1. Airplane mode on. Start Break.<br>2. Website: set emp1 Inactive.<br>3. Airplane mode off. Remove the failed row. Reactivate emp1 (T8). | **Failed row:** "Couldn't sync, please speak to your supervisor."<br>**After Remove:** no break event on the website. |
| H16 | both | On break | 1. Website: approve emp1's week.<br>2. Airplane mode on. End Break. Wait 6 minutes. Airplane mode off (T10). | **Website:** the End break with "Synced late", and an Overview "Late Punch on Approved Timesheet" alert. Not in the supervisor Alerts tab. |
| H17 | both | Clocked in | Network Link Conditioner 100% Loss. Start and End Break. Turn the conditioner off within 1 minute and tap Sync Now (T11). | **Badge:** 1, then 2.<br>**Sync Now:** "Syncing...", then both Synced; Last synced = now; no "Synced late". |
| H18 | both | 12+ minutes after your last punch | 1. Set the phone's time 10 minutes back. Airplane mode on and punch. Kill the app, set the time back to automatic, reopen online.<br>2. Set the time 10 minutes back again and punch online. Restore the time (T15). | **I check:** the first punch has the phone's time + queued + phoneClockOff; the second has server time + phoneClockOff. |
| H19 | phone | Settings > dev punch timings | Do 4 punches on Wi-Fi, 4 on cellular, and 1 in airplane mode. Read the timings (T13). | Each punch reaches the green screen in under 1 s. **I compare** the numbers with build 16's timings. |
| H20 | phone | — | 1. Delete and reinstall the app. Sign in as emp1 and turn on airplane mode right away. Open Settings, then go online (10-PIN3).<br>2. Clock in and let the green screen close (7-N1). | **Settings offline:** "Connect to the internet once to load your PIN", never a blank row.<br>**Back online:** "Loading your PIN...", then the digits.<br>**After the clock-in:** notifications are asked once, after the green screen. **I check:** the push token is saved. |
| H21 | phone | — | Reinstall. Sign in, clock in, **Don't Allow** notifications. Start a break, then turn the Settings Notifications switch on (7-N2). | **Break:** works normally.<br>**Switch:** on after the phone's Settings. **I check:** the token is saved. |
| H22 | phone | — | Reinstall. Sign in, choose **Not Now** for notifications, take a break, clock out (7-N3). | Nothing is blocked; no second question. |
| H23 | both | — | 1. Log out. Sign in as **you+emp2** and open Settings (10-PIN4).<br>2. Log out, sign in as **you+core1**.<br>3. Website: manual clock-in for emp1, 2 hours ago (7-N4). | **emp2:** only emp2's PIN.<br>**core1's phone:** gets nothing for emp1. Logging out offline finishes within about 3 s. |

### Site detection at the desk (Pro), and Hours

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| J1 | both | emp1 | Airplane mode on. Clock in, wait 10 minutes, go online (6-P2). | Saved offline; after sync it shows the original time, a map and Site A. |
| J2 | both | iPhone Settings > Location: Never | Clock in and out (6-P3, 10-F3). | **Phone:** as fast as usual; the Home banner shows.<br>**Website:** "No location recorded", and the site = the assigned site. |
| J3 | both | emp1 assigned **only Site B**; you're at Site A with a good fix | 1. Clock in (6-D1, 10-F1).<br>2. Assign Site A too. Clock out and in again (6-D1b). | **First clock-in:** Site A + Auto-detected + a "Clocked in at unassigned site" alert.<br>**Second clock-in:** no alert. No alerts on outs or breaks. |
| J4 | both | Precise Location off | Clock in at Site A (6-D3). | The assigned site, no Auto-detected, and a rough location shown. |
| J5 | both | — | Clock in, break, end break, clock out, all at Site A (6-D4). | All 4 events are Site A, each with its own location. |
| J6 | both | you+core1 (Core) at your desk | Clock in and out (6-D5, 10-F4, B7). Add a break too. | **Site:** the Core Site, never detected.<br>**Website:** photos, and no face check (Core). |
| M1 | both | emp1 | 1. Website: add a past-day clock-in with no clock-out.<br>2. Phone: Hours (10-H3, phase5 H2). | **Past day:** shows 0m and an orange "Missing clock-out".<br>**Today:** every punch in order, then green "In progress".<br>**Days off:** no row. |
| SN1 | phone | Any day after Monday | Open the Sync tab (5-N5, N5, 10-A2). | Rows from this week only (Monday to today, company time). An older Failed row, if there is one, still shows. |

## Session 5. Alerts, push and face checks (phone + web, 2 h)

**Setup (website, you+owner):**
- **Settings > Alerts:** Max break warning 6 min; Max hours warning 1 h;
  Overtime warning 2 h for the week; Missed clock out ON.
- **Settings > General:** business hours closing about 20 minutes from now.
- **Late clock-in alert:** ON, 5 min; business hours opening more than 5
  minutes before your next clock-in.
- **Early clock-out alert:** ON.
- Notifications allowed for OrbitsWorks Dev. Phone signed in as **you+emp1**.

Put every value back at the end of the session.

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| K1 | phone | Clocked in | Start a break, lock the phone for 11+ minutes (7-B1, PR-A1). | **Pushes:** "5 minutes left", "time up" and "over limit", once each.<br>**Alerts tab:** a row for each.<br>**Website:** a Max break alert. |
| K2 | phone | — | Airplane mode on. Start a break; end it after "5 minutes left" (7-B2). | Only "5 minutes left". |
| K3 | phone | — | A 30-second break, then wait 12 minutes (7-B3). | No reminders. |
| K4 | both | Max break warning OFF | A 12-minute break (7-B4). Turn the warning back on. | No reminders. |
| K5 | phone | — | Start a break, kill the app, wait 7 minutes (7-B5). | "5 minutes left" and "time up" still arrive. "Over limit" never arrives after End. |
| K6 | both | Business hours close in about 20 minutes | Clock in, close the app (7-S1). | A "Shift ending soon" push 15 to 0 minutes before close; tapping it opens Alerts. |
| K7 | phone | — | Stay clocked in until 35 minutes past close (7-S2). | One "Still clocked in" push. |
| K8 | both | Missed clock out OFF | Repeat K6 and K7 (7-S3). Turn it back on. | No pushes. |
| K9 | phone | — | Clock in after close and wait 30 minutes (7-S4). | No "Shift ending" and no "Still clocked in". |
| K10 | both | — | Stay clocked in for 1 h 15 (7-M1). | **Phone:** a "Max hours" push and an Alerts row.<br>**Website:** a Max Hours alert. |
| K11 | both | — | Website: manual clock-in for emp1 at 11:00 PM yesterday, with no out (7-M2). | A max hours push for that shift, and the alert dated yesterday. Then add the clock-out on the website. |
| K12 | phone | This week over 2 h | Keep working past the threshold (7-M3). | One "Overtime" push this week. |
| K13 | both | Max hours and Overtime OFF | Clock in for 1 h 15 (7-M4). Turn them back on. | No push. |
| K14 | phone | After K1-K13 | Open the Alerts tab (7-A1). | Your own alerts and break reminders, newest first, read only. |
| K15 | phone | — | Log out, sign in as you+core1, open Alerts (7-A2). | None of emp1's alerts. |
| K16 | phone | — | Back as emp1. Airplane mode on, kill and reopen, open Alerts (7-A3). | Opens, and break reminders still show. |
| K17 | both | — | 1. Airplane mode on.<br>2. Website: change emp1's PIN.<br>3. Punch with the old PIN, go online.<br>4. Repeat once (7-W1). | **Phone:** "Couldn't sync".<br>**Website:** ONE "Wrong PIN at Sync" alert today. |
| K18 | both | Late clock-in and Early clock-out ON | Clock in more than 5 minutes after opening time. Clock out before closing time. | **Website:** a "Late clock-in" alert, then an "Early clock-out" alert, each with a time. |
| N1 | both | emp1, good light | Three punches, face in frame; one in poor indoor light (face match, T12). | **Website:** "Match" with a similarity of 90% or more on each.<br>**I check:** photo sizes, and no "no face" when your face was in frame. |
| N2 | both | — | Clock in with the camera at the ceiling (10-FN1). | **Punch:** saved (green as usual).<br>**Website:** "No face", an Overview "No Face Detected" alert, and a red warning in Approve Hours.<br>**Phone:** a push and an Alerts row "Couldn't detect a face". |
| N3 | both | Another person's face | They clock in for emp1 (10-FN2). | **Website:** "Mismatch" and a "Face Mismatch" alert.<br>**Phone:** nothing. |
| N4 | both | Settings > Alerts: only "No face detected" OFF | Repeat N2 and N3 (10-FN3). | **No face:** no alert, no warning, no phone message; the badge still says "No face".<br>**Mismatch:** still alerts. |
| N5 | both | Only "Face didn't match" OFF; then the main switch OFF | Repeat N3 and N2. Then, with the main switch off, repeat N2 (10-FN4). Turn everything back on. | **Mismatch off:** no alert, but the badge shows; no face still alerts and messages.<br>**Main switch off:** sub-switches greyed; no alerts and no phone message. |
| N6 | both | — | Airplane mode on. Clock in with no face. Go online (10-FN6). | The phone message arrives after the sync; the punch keeps its original time. |

## Session 6. Website review (web, 1 h 15)

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| R1 | web | Today's data | Time Tracking, day view. Open several events. | **Each event:** the photo (View), source, map and address, geofence and face badges, "Synced late" tags, comments.<br>**Event detail:** shows the same information. |
| R2 | web | — | 1. Open an event > **Adjust time** > pick a new time > Save. Try Back, then Confirm (PR-W1).<br>2. Move a clock-in to after that shift's break start, then to the future (PR-W2). | **Save:** a yellow confirm panel with the old and new time and the events before and after; Back saves nothing; Confirm saves with the reason.<br>**Out of order:** refused with "out of order", naming the neighbouring event.<br>**Future (more than 2 minutes ahead):** refused. |
| R3 | web | An "unassigned site" or face alert | Overview > the alert > edit the clock-in time (PR-W3). | The same confirm step as R2 before saving. |
| R4 | web | N3's mismatch punch | **Reassign** it to Ana (emp3, your selfie). | The punch moves to Ana; the old face result is gone, and a new check runs (Match). |
| R5 | web | — | Timesheet Approvals: Day, then Week, at laptop width (1280-1366 px). Approve one day, unapprove it, then Select all > Approve (10-W6, 9-W3). | **Layout:** no Shift column, no sideways scrolling, and the Status select and icons fit.<br>**Warnings:** face (red), synced late (yellow), comment icon.<br>**Approve:** all approved. |
| R6 | web | — | 1. Overview: Resolve one alert, Ignore another. Close the Alerts, Employees clocked in and On break cards, then reload (10-W2).<br>2. **I set** an alert dated 31+ days ago (10-W8a). | **Resolve and Ignore:** each shows who did it and when.<br>**Cards:** each closes with its count, and all are open again after reload.<br>**The 31-day-old alert:** not shown. |
| R7 | web | Sub Co has hours (Dan) | Reports for this week. Set Company to All, then In-house, then Sub Co. Then Export to Excel (9-R1, 10-W8b). | **Filter:** every section and the export follow the pick; site notes appear only under All.<br>**Settings applied:** rounding from B2 and the automatic break from B3.<br>**Approved hours:** equal the Timesheet Approvals totals.<br>**Excel:** opens, with photos and the Detail sheet. |
| R8 | web | — | Analytics for this week. | The charts load. Totals match Reports for the same range. |
| U2 | web | Automations: Automatic Break 30 min, Minimum Shift Length 1 h (set it for this test) | Pick a closed shift over 1 h with no real break. Check Approve Hours and Reports. Then put the minimum back to 6 h. | **Shifts of 1 h or more:** 30 minutes deducted.<br>**Shorter shifts:** nothing deducted. |

## Session 7. Walking outside (phone + web, 2 h 30)

**Setup:**
- Website > Sites: Site A **Require geofence ON**, 300 ft.
- Settings > Alerts: "Left the job site" ON.
- emp1 assigned to Site A. Notifications allowed.
- **"Walk out":** at least 200 m from Site A's pin, then stay out for the
  time given. **"Walk back":** return to the pin.

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| J7 | both | Reinstall, sign in as emp1 | Clock in at Site A (8-P1). | After notifications: the consent screen, Agree, then the Always prompts. You aren't asked again. |
| J8 | phone | Reinstall | At the Always prompt, choose "Keep Only While Using" (8-P2). | The walk-through steps show and close by themselves once Always is on. |
| J9 | both | Reinstall | At consent tap **Not now**. Wait 5 minutes, clock out (8-P3). | An orange banner; the website shows gray "Tracking off … (location permission off)". |
| J10 | both | **I set:** reset emp1's location consent and set the Pro company's termsVersion back one version | Clock in at Site A, tap the orange Home banner. Open the website as owner (8-P5). | **Phone:** consent shows again.<br>**Website:** the Terms re-accept box (r7). Accepting closes it. |
| J11 | phone | Crew code | Start a crew code sign-up as far as "Share your location", then Cancel (8-P6). | Geofence wording; While Using only. |
| J12 | both | 2+ km from every site, good fix | Clock in, then out (6-D2, 10-F2, 10-S3). | **Both events:** "Not specified", no Auto-detected.<br>**Clock-in:** an outside badge and a "Clocked in outside geofence" alert, with the distance to Site A. |
| J13 | both | No consent yet | Clock in, tap the banner > Agree > Always. Walk out 5 minutes, then back (8-P4). | The gray "tracking off" ends; then a red exit. |
| J14 | both | Phone locked | Walk out 10 minutes, back for 5 (8-W1). | **Phone:** a notification about 2 minutes after leaving; an Alerts tab entry.<br>**Website:** a red line and an Overview alert. |
| J15 | web | — | Clock out. Open Timesheet Approvals (8-W2). | A red warning; the hours are unchanged. |
| J16 | both | — | Out and back in under 1 minute (8-W3). | Nothing at all. |
| J17 | both | — | Walk out, wait for the notification, back within 3 minutes (8-W4, 8-W4b). | **Phone:** the notification; the employee's entry stays.<br>**Website:** gray "(short)", no red; the Overview and supervisor feed entries go away once the return syncs. |
| J18 | phone | Supervisor login (or second phone) | Open Alerts after J14 (8-W5). | "Left Job Site", with no push. |
| J19 | both | "Left the job site" OFF | Repeat J14 with 5 minutes out (8-W6). Turn it back on. | **Time Tracking:** the exit is still red.<br>**Elsewhere:** no feed, supervisor or Approvals warning. |
| J20 | both | Airplane mode on, location on | Walk out 10, back 5, then go online (8-O1). | The notification arrives while offline; real times after sync. |
| J21 | both | — | Airplane mode on. Clock in, walk out 10, back, go online (8-O2). | The notification arrives offline; the website shows the clock-in, then the exit. |
| J22 | both | — | Force-quit the app. Walk out 10, back, open it (8-O3). | **Write down** whether a notification came (this decides C3). Never a wrong time. |
| J23 | both | — | Restart the phone. Walk out 10, back, open the app (8-O4). | **Write down** whether a notification came. Otherwise gray "phone stopped tracking". |
| J24 | both | — | Leave through bad GPS (a garage). Out 5, back (8-O5). | Gray "no good location fix" then red, or just red. Never nothing. |
| J25 | both | — | Out 5, then clock out from outside (8-E1). | **Exit:** "Left … - clock-out <time>"; tracking stops.<br>**Clock-out:** "Not specified" or the site you're in; hours stay under Site A. |
| J26 | both | — | Break, out 5, back, end the break (8-E3). | A notification; gray "(on break)"; no alerts. |
| J27 | both | you+core1 | Walk out 10 (8-C1). | Nothing. |
| J28 | both | Clocked in | Turn Site A's geofence OFF, open the app, walk out (8-C2). Turn it back on. | No exit after the switch. |
| J29 | both | — | Supervisor app clocks emp1 in; walk out with the employee phone (8-C3). | Nothing. |
| J30 | both | — | Log out mid-shift. Sign in as emp2, walk out (8-C4). | Gray "Tracking off … (signed out)" for emp1; nothing for emp2. |
| J31 | both | — | iPhone Settings > While Using; walk out; set Always again (8-C5). | A banner; gray "location permission off". |
| J32 | both | — | Walk out and stay. Open Overview. Walk back (9-O1). | "Outside now", then today's list, red or gray. |
| J33 | both | Good fix at both sites | Clock in at Site A, walk or drive to Site B, clock out. Check the website (10-S1, 10-S2). | **Clock-in:** Site A + Auto-detected. **Clock-out:** Site B + Auto-detected.<br>**Phone:** the green screen says Site A; Hours and Sync say Site B after sync.<br>**Approve Hours and Reports:** hours under Site A, with "Clocked out at Site B".<br>**Event detail:** "Clocked in at Site A - the shift's hours count there". No new alert. |
| J34 | both | — | Clock out with Precise Location off (10-S4). | The clock-out = the clock-in site, with no tag. |
| J35 | both | emp1 assigned only Site A | Clock out at Site B with a rough 100-500 m fix, if you can get one (10-S5). | The clock-out = Site A. |
| J36 | both | Site B geofence ON | Clock out inside Site B (10-S6). | Geofence "At site", checked against Site B. |
| J37 | both | Supervisor app, Ask for job site each time OFF, then ON | Clock in at Site A, out at Site B (10-S7). | **OFF:** clock-out Site B + Auto-detected.<br>**ON:** clock-out Site A, no tag. |
| J38 | both | During J33 | Take breaks. Also run the auto clock-out from W1 (10-S8). | Breaks and the auto clock-out are at Site A. |
| J39 | both | During J33 | Walk out of Site A (10-S9). | Exits measured from Site A's fence; the clock-out closes them. |
| J40 | both | you+core1 | Clock in at Core Site, out at Core Site 2 (10-S10). | Both the assigned Core site, never detected. |

## Session 8. Remove photo, delete employee, Delete account, cleanup (phone + web, 1 h)

**Order matters.** Each BIO-P deletes that login.

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| X1 | web | Ana (emp3, your selfie) | Remove photo > **Yes, remove photo** (BIO-W1). | **Row:** the photo is gone and the row shows "No face check".<br>**Old clock events:** keep their photos and face results.<br>**Edit:** still works, and Change photo is offered.<br>**I check:** Storage `employees/{id}/` is empty. |
| X2 | both | After X1 | 1. Ana clocks in and out on the phone (as you+emp3).<br>2. Website: Change photo, adding your photo.<br>3. Clock in again (BIO-W2). | **First shift:** no face result and no face alert.<br>**After the new photo:** a face result again. |
| X3 | web | emp2 (has a selfie and clock events) | Employees > delete emp2 (BIO-W4). | **Row:** gone.<br>**Time Tracking:** still shows emp2's events with photos.<br>**I check:** `employees/{id}/` is gone; the `clockEvents/` photos stay. |
| X4 | phone | Sign in as **you+del1**, clock in | Settings > **Delete account**. Then start a break and try again (BIO-P1). | **Both times:** "Clock out first, then delete your account." with only an OK button.<br>**Nothing else:** still signed in; the website is unchanged. |
| X5 | phone | Clocked out, airplane mode on | Delete account > **Delete account** (BIO-P2). | "No connection. Connect to the internet and try again." The box stays open; nothing is deleted. |
| X6 | both | Sign in as **you+del2** | 1. Airplane mode on: clock in and out.<br>2. Airplane mode off and, right away, Delete account > Delete account (BIO-P3). | **Normal case:** the punches sync first, then the account is deleted; both punches are on the website.<br>**If the sync can't finish:** "2 punches haven't synced yet…" and nothing is deleted. |
| X7 | both | Sign in as **you+del1**, clocked out | 1. Delete account: read the box, tap **Keep my account**.<br>2. Again > **Delete account** (BIO-P4). | **Keep:** closes the box.<br>**Delete:** the app signs out to the start screen; signing in with you+del1 fails.<br>**Website:** del1 is inactive (seat freed), with a gray **Deleted app account** tag, no photo and PIN "-". Their clock events stay, and opening one shows the tag. Overview has a blue "Deleted App Account" alert.<br>**Supervisor app Alerts:** does NOT show it.<br>**I check:** `employees/{id}/` is gone; the clock photos stay. |
| X8 | both | you+owner2 invites **you+del3** (Core); sign up and clock in/out once | Repeat X7 as del3 (BIO-P5). | The same result, with no face checks (Core); the selfie and PIN are still deleted. |
| X9 | web | After X7 | Reactivate del1 and set a PIN (BIO-W5). | Reactivates normally. The Edit window offers Invite to app. The tag stays as the record. |

## Session 9. Billing changes (web + phone, 1 h)

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| A8 | web | you+owner2 (Core tier 1) | Billing > **Pro, tier 1**. Pay with the saved card. | **Plan:** Pro within seconds (webhook), with a prorated charge.<br>**Unlocked:** Crew Access codes, and the Employee (app) invite. |
| A9 | web | Same company | Payment method `4000 0000 0000 0341`, then try Pro tier 2. | A clear payment error; the plan stays Pro tier 1. Put the 4242 card back. |
| A10 | both | **Shipmate (Pro-dev)**. emp1 clocked in at Site A (geofence ON) | 1. Billing > **Core, tier 1**.<br>2. Open the app, walk out (8-C6).<br>3. Clock out and in again.<br>4. Try a crew code sign-up.<br>5. Billing > back to **Pro, tier 1**. | **On Core:** no new exit; no face result on the new clock-in; the crew code is refused with the plan message.<br>**Back on Pro:** everything works again, and nothing was wiped. |
| A11 | web | you+owner2 (Pro). Make sure it has **10 active** employees (add 5 more) and one clocked in | Billing > cancel the subscription and go to Free. | **Plan:** Free (via the webhook).<br>**Employees:** active drops to 8; the deactivated ones have their open shifts closed.<br>**I check:** planCanceledAt is set (the 90-day photo sweep starts from it). |

## Session 10. Multi-day (phone + web, about 15 min a day for a week)

| ID | Where | Setup | Steps | Pass |
|---|---|---|---|---|
| W1 | both | Settings > Automations: Auto clock-out ON, **1 h**. Site A geofence ON | Clock in. Walk out after 50 minutes and stay out (N6, 8-E2, U1). Set it back to 12 h afterwards. | **Website:** an automatic clock-out at exactly 1 h; an "Auto clock-out" alert; the exit says "… - auto clock-out <time>".<br>**Phone:** Home shows clocked out after it refreshes. |
| W2 | both | One week, Monday to Friday, of punches for emp1. Monday: a comment and a break. Tuesday: airplane mode, Synced late. Wednesday: red and gray exits. Thursday: 10 PM to 2 AM. Friday: W1. | Then: Time Tracking, day by day (9-W1). | **Each day:** photos, source, comments, "Synced late" and left-site lines.<br>**Thursday 10 PM:** pairs with Friday 2 AM, both ways.<br>**Friday:** Source "Auto clock-out". |
| W3 | web | After W2 | Approve Hours > Week (9-W2), then Select all > Approve (9-W3). | **Week view:** comment icon; Synced late in yellow; Wednesday red with the gray list; Thursday one 4 h session.<br>**Approve:** all approved. |
| W4 | web | After W2 | Reports Monday to Friday, then Export to Excel (9-W4). | **Reports:** a job site exits table; Detail shows left site, tracking off and synced late.<br>**Excel:** a Job site exits sheet. |
| W5 | both | Leave Thursday's shift open past midnight | The next morning: check alerts. | **Write down** when "Missed clock out" fired. It's a known open item (fires at midnight for overnight shifts, old C2). |
| W6 | both | Walk out before midnight, stay out past it | Overview after midnight (9-O2). | Still in "Outside now", and not in today's list. |
| W7 | phone | Work Monday and Wednesday, nothing Tuesday | Hours on Wednesday after the clock-out (10-H1). | **Days:** Wednesday and Monday only, no Tuesday.<br>**Hours:** each day's hours = Approve Hours. |
| W8 | phone | Monday, before any punch | Open Hours, then clock in (10-H2). | **Before:** "No hours worked yet this week."<br>**After:** Today, In progress. |
| W9 | phone | The next Monday or later | Sync tab (N5, 10-A2, 4d-1). | Last week's synced rows are gone; this week's rows and old Failed rows show. |

### Photo cleanup: can't be tested by hand (unit-tested)

| ID | What | Covered by |
|---|---|---|
| X10 | Clock photos deleted after 90 days → "Photo removed" on the website and in Excel. **Optional:** I set photoRemovedAt on one dev event so you can see the text. | functions biometricRetention tests |
| X11 | Site exit locations cleared after 90 days; employee alerts deleted after 90 days | functions tests |
| X12 | Deactivated employee's whole `employees/` folder deleted after 1 year; whole company wiped 90 days after cancellation (d) | functions facePhotos / biometricRetention tests |
| X13 | Replaced reference photos deleted after 30 days | functions tests |
| X14 | Synced queue rows dropped after 8 days on the phone | app punchQueueLogic tests |

---

## P. Prod smoke test (after the prod deploy, ShipMate only, real app from the production profile)

| ID | Steps | Pass |
|---|---|---|
| P1 | The owner signs in on orbitsworks.com. | The Terms re-accept box (r7) shows. Accept it. |
| P2 | Open `https://orbitsworks.com/.well-known/apple-app-site-association`. | Lists `6ZU7MHT284.com.orbitworks.app` for `/j/` and `/i/`. |
| P3 | Crew Access: create a crew code. Employees: send an Employee (app) invite to a + address. | Both work. |
| P4 | **Real app:** "Join with crew code" shows. Scan, sign up, see your PIN. The email invite link and a `/j/` link open the app. On a phone without the app, `/j/` shows an App Store link. | All of these work. |
| P5 | Clock in, break, clock out online. Then one offline punch, then sync. | The website shows photos, face check and site. |
| P6 | Check alerts for ShipMate AND a second company. | The Alerts tab and pushes arrive for both. |
| P7 | Supervisor app (the live 1.1.4 and the new build): PIN clock in and out, online and offline. | Works. The Employees table shows PINs. |
| P8 | Send a password reset. | The email arrives from the firebaseapp.com sender, and the link works. |
| P9 | Employee App > Settings > Delete account, on a throwaway employee. | The same as X7, on prod. |

## AN. Android (after an Android build exists)

You'll need these first: the Firebase Android app, `google-services.json`,
the FCM V1 key and an `employeeDev` Android build. Then rerun Sessions 2-5,
7 and 8, minus the iOS-only steps (the iPhone Settings paths in E17, J8 and
J31). Add:

| ID | Test |
|---|---|
| AN1 | Push token registration |
| AN2 | Break reminders under Doze |
| AN3 | Leave tracking re-arms after a reboot and after force-stop (J23) |
| AN4 | `/j/` and `/i/` App Links (needs `assetlinks.json`) |
| AN5 | The Delete account flow (X4-X7) |

---

## Coverage: every older test → its new test

Sources:
- `ios-test-list-old.md` (the old list, including the PR-, BIO- and prod
  smoke tests);
- `phase4-test-checklist.md` (T, S);
- `phase3b-test-checklist.md` (B, N);
- `phase10-test-round.md` (all IDs);
- `test-run-phase5.md` to `test-run-phase9.md` (the full steps behind the
  phase10 IDs);
- `orbitworks-app/TESTING-NEXT-BUILD.md` (TNB);
- `prod-readiness-report.md` (findings);
- `biometric-audit.md` (gaps a-e and the outcomes).

### Phone and website tests

| Old ID | New ID | Note |
|---|---|---|
| T1 | dropped | The build 1 baseline (UI-only build 15) can't be made again. H19 compares against build 16's numbers, as the old list said. |
| T2 | H1 | |
| T3 | H5 | |
| T4 | H13 | |
| T5 | dropped | Replaced by N1-N2 (H2-H4); there's no Redo since Phase 5. |
| T6 | dropped | Replaced by phase5 P2 (H11). |
| T7 | H14 | |
| T8 | H15 | |
| T9 | H8 | |
| T10 | H16 | |
| T11 | H17 | |
| T12 | N1 | |
| T13 | H19 | |
| T14 | dropped | Replaced by N1-N2 (H2-H4): a wrong PIN never reaches the camera. |
| T15 | H18 | |
| T16 | H6 | |
| S1 | F2 | |
| S2 | F3 | Judged by 10-F6, as before. |
| S3 | F4 | |
| S4 | F5 | |
| S5 | F6 | |
| S6 | F7 | |
| B1 | E9 | |
| B2 | E1 (Pro), E17 (Core) | |
| B3 | E6 | |
| B4 | E7 | |
| B5 | E10 | |
| B6 | E10 | |
| B7 | J6 | |
| B8 | E11 | |
| B9 | E13 | |
| B10 | E11 | |
| B11 | E13 | |
| N1 | H2, H3 | |
| N2 | H4 | |
| N3 | dropped | Replaced by phase5 P1 (H10). |
| N4 | H1 | Watched through the whole session. |
| N5 / 5-N5 | SN1, W9 | |
| N6 | W1 | |
| 0 (phase5 Step 0) | dropped | It removed old Redo rows left from build 23. After a wipe and reinstall there are none. |
| K1 | H7 | |
| K2 | H11 | |
| H1 (phase5) | dropped | Replaced by 10-H (W7, W8, M1): Hours now shows only days worked. |
| H2 (phase5) | M1 | |
| H3 (phase5) | H5 | |
| SE1 | H9 | Rows updated by 10-A1a. |
| SE2 | H9 | |
| SE3 | H9 | |
| P1 (phase5) | H10 | |
| P2 (phase5) | H11 | |
| P3 (phase5) | H12 | |
| C1 (phase5) | H7 | |
| LO1 | H8 | |
| D1 (phase5) | H7 | The website check of an offline comment (C1 part). |
| 5d-1 | E10 | |
| 5d-2 | E14 | Run on Pro: needs the Sub Co row; the plan doesn't matter. |
| 5d-3 | E13 | |
| 5d-4 | E12 | |
| 5d-5 | E11 | |
| 6-L1 | E9 | |
| 6-L2 | E10 | |
| 6-L3 | E13 | |
| 6-L4 | E17 | |
| 6-P1 | H1 | |
| 6-P2 | J1 | |
| 6-P3 | J2 | |
| 6-D1 | J3 | |
| 6-D1b | J3 | |
| 6-D2 | J12 | |
| 6-D3 | J4 | |
| 6-D4 | J5 | |
| 6-D5 | J6 | |
| 7-N1 | H20 | |
| 7-N2 | H21 | |
| 7-N3 | H22 | |
| 7-N4 | H23 | |
| 7-B1 | K1 | |
| 7-B2 | K2 | |
| 7-B3 | K3 | |
| 7-B4 | K4 | |
| 7-B5 | K5 | |
| 7-S1 | K6 | |
| 7-S2 | K7 | |
| 7-S3 | K8 | |
| 7-S4 | K9 | |
| 7-M1 | K10 | |
| 7-M2 | K11 | |
| 7-M3 | K12 | |
| 7-M4 | K13 | |
| 7-A1 | K14 | |
| 7-A2 | K15 | |
| 7-A3 | K16 | |
| 7-W1 | K17 | |
| 8-P1 | J7 | |
| 8-P2 | J8 | |
| 8-P3 | J9 | |
| 8-P4 | J13 | |
| 8-P5 | J10 | |
| 8-P6 | J11 | |
| 8-W1 | J14 | |
| 8-W2 | J15 | |
| 8-W3 | J16 | |
| 8-W4 | J17 | |
| 8-W4b | J17 | |
| 8-W5 | J18 | |
| 8-W6 | J19 | |
| 8-O1 | J20 | |
| 8-O2 | J21 | |
| 8-O3 | J22 | |
| 8-O4 | J23 | |
| 8-O5 | J24 | |
| 8-E1 | J25 | |
| 8-E2 | W1 | |
| 8-E3 | J26 | |
| 8-C1 | J27 | |
| 8-C2 | J28 | |
| 8-C3 | J29 | |
| 8-C4 | J30 | |
| 8-C5 | J31 | |
| 8-C6 | A10 | |
| 8-Q1 | E8 | |
| 8-Q2 | E8 | |
| 9-E1 | E1 | |
| 9-E2 | E18 (Pro, no seats); A4 (Free) | |
| 9-E3 | E2 | |
| 9-E4 | E15 | |
| 9-E5 | D6 | |
| 9-R1 | R7 | |
| 9-C1 | E8 | |
| 9-C2 | E19 | |
| 9-O1 | J32 | |
| 9-O2 | W6 | |
| 9-W1 | W2 | |
| 9-W2 | W3 | |
| 9-W3 | W3 (week), R5 (day) | |
| 9-W4 | W4 | |
| 10-A1a | H9 | |
| 10-A1b | dropped | Replaced by 10-PIN1 (H9). It was already SKIP. |
| 10-A1c | dropped | Replaced by 10-PIN2 (H10). It was already SKIP. |
| 10-A1d | dropped | Replaced by 10-PIN3 (H20). It was already SKIP. |
| 10-A1e | E14 | |
| 10-A2 | SN1, W9 | |
| 10-A3a | F12 | |
| 10-A3b | F12 | |
| 10-A3c | F12 | |
| 10-A3d | F12 | |
| 10-W1 | E19 | |
| 10-W2 | R6 | |
| 10-W3 | D7 (search), partly dropped | The "Show 20 more" paging needs 21+ employee rows. Pro tier 1 and Core tier 1 cap total records at 20. **Optional:** move a company to tier 2 (30 total) and add 21 rows, about 15 min. Say if you want it added. |
| 10-W4 | C4 | |
| 10-W5 | C5 | |
| 10-W6 | R5 | |
| 10-W8a | R6 | |
| 10-W8b | R7 | Compared against Timesheet Approvals for the same range. There's no "before the deploy" data after the wipe. |
| 10-F1 | J3 | |
| 10-F2 | J12 | |
| 10-F3 | J2 | Location Never. J4 covers Precise off. |
| 10-F4 | J6 | |
| 10-F5 | F13 | |
| 10-F6 | F3 | |
| 10-S1 | J33 | |
| 10-S2 | J33 | |
| 10-S3 | J12 | |
| 10-S4 | J34 | |
| 10-S5 | J35 | |
| 10-S6 | J36 | |
| 10-S7 | J37 | |
| 10-S8 | J38 | |
| 10-S9 | J39 | |
| 10-S10 | J40 | |
| CC-1 | F9 | |
| CC-2 | F10 | |
| CC-3 | F11 | |
| 10-H1 | W7 | |
| 10-H2 | W8 | |
| 10-H3 | M1 | |
| 10-PIN1 | H9 | |
| 10-PIN2 | H10 | |
| 10-PIN3 | H20 | |
| 10-PIN4 | H23 | |
| 10-FN1 | N2 | |
| 10-FN2 | N3 | |
| 10-FN3 | N4 | |
| 10-FN4 | N5 | |
| 10-FN5 | N7 | |
| 10-FN6 | N6 | |
| 90d-1 | X11 | Unit-tested. |
| 90d-2 | X11 | Unit-tested. |
| 90d-3 | X10 | Unit-tested; optional manual check. |
| 4d-1 | X14 | Unit-tested. |
| TNB Employee PIN check 1 | H1 | |
| TNB Employee PIN check 2 | H10 | |
| TNB Employee PIN check 3 | H2 | |
| TNB Employee PIN check 4 | H3 | |
| TNB App sign-up Back / Cancel (4) | E9 | |
| TNB Join flow top-bar buttons (8) | E9, E16 | |
| TNB Settings PIN row: fresh joiner | E9 | |
| TNB Settings PIN row: airplane | H9 | |
| TNB Settings PIN row: website change | H10 | |
| TNB Settings PIN row: log out | H20 | |
| TNB Settings PIN row: clock screen check | H2, H3 | |
| PR-W1 | R2 | |
| PR-W2 | R2 | |
| PR-W3 | R3 | |
| PR-W4 | D1, D3 | |
| PR-W5 | E4 | |
| PR-W6 | E5 | |
| PR-W7 | A3 | On a company made by a real sign-up. |
| PR-P1 | H9 | |
| PR-P2 | H10 | |
| PR-P3 | F15 | |
| PR-P4 | F16 | |
| PR-S1 | F14 | |
| PR-A1 | K1 | Every dev company is new now, so any company proves it. |
| PR-J1 | E9 | |
| BIO-W1 | X1 (Cancel path in D5) | |
| BIO-W2 | X2 | |
| BIO-W3 | D5 | |
| BIO-W4 | X3 | |
| BIO-W5 | X9 | |
| BIO-P1 | X4 | |
| BIO-P2 | X5 | |
| BIO-P3 | X6 | |
| BIO-P4 | X7 | |
| BIO-P5 | X8 | |
| Prod smoke 1-8 | P1-P8 | P9 is new (Delete account on prod). |
| Android items (4) | AN1-AN4 | AN5 is new. |

### Prod-readiness findings (`prod-readiness-report.md`)

| Finding | New test | Note |
|---|---|---|
| B1 invites update hole | dropped (hand test) | It's a rules exploit, not a user flow. Covered by the rules test that came with the fix. |
| B2 prod admin key | dropped | An ops task, not a test. |
| B3 deploy order | dropped | A prod deploy checklist step. |
| B4 prod app links and sign-up | P2, P4 | |
| B5 prod params file | dropped | A prod deploy checklist step. |
| B6 TEST_COMPANY_IDS | P6 | The code no longer reads it (flags.ts, 2026-11-14). |
| B7 prod indexes | dropped (hand test) | A prod deploy checklist step. P3-P6 fail without them. |
| B8 correction confirm and order check | R2, R3 | |
| B9 employeeAppConfig and selfie recheck | A3 (I check the config exists after sign-up) | The selfie recheck is a prod deploy step. |
| E1 password reset domain | P8 | |
| E2-E6 | dropped | Config and dev-machine items, not app behaviour. E5 (gcloud default = prod) was fixed today: the default is now dev. |
| F1-F8 | dropped | Code and deploy findings. F4 (random downgrade pick) is observed in A11. |
| S1 PIN off the employee doc | D1, D3, H9, H10, F15, F16 | |
| S2 rate limit and App Check | E9 | Normal use is never limited. The limit itself is unit-tested. |
| S3-S6 rules hardening | dropped (hand test) | Covered by rules tests. |

### Biometric audit (`biometric-audit.md`)

| Gap | New test | Note |
|---|---|---|
| a. AWS opt-out | — | **PENDING** (you, in the AWS console). Not testable in the app. |
| b. Employee App Delete account | X4-X9, P9 | |
| c. Remove photo | D5, X1, X2 | |
| d. Photo cleanup on delete and cancellation | X3, X7, X12 | The sweeps are unit-tested. |
| e. Legal text matches the code | A2, E9 (consent text v2) | |
| i. Outcomes: match | N1 | |
| i. Outcomes: mismatch | N3 | |
| i. Outcomes: no face | N2, N7 | |
| i. Outcomes: no reference photo | N8 | |
| i. Outcomes: bad reference | D4, N9 | |
| i. Outcomes: offline synced later | N6 | |
| i. Outcomes: AWS error | dropped (hand test) | It can't be forced on dev without breaking the secret. |
| j. Reassign re-runs the check | R4 | |
| k. Alert toggles | B4, N4, N5 | |
| l. Supervisor app photo notice | F5 | |

---

## Results log

| Date | Build | ID | Result | Note |
|---|---|---|---|---|
| 2026-11-20 | 29 | RC1 (unlisted: role change mid-session) | **FAIL** | Drops (employee app, clocked in 23:43 UTC) made supervisor on the website at 00:23:15 UTC. The next app launches showed the supervisor app with an empty list, 0 active and the email instead of the name. Logging out and back in fixed it. See Open fails. |

## Open fails

### RC1. Role change while signed in: wrong UI for the token (build 29, 2026-11-20)

- **Cause (confirmed):** `AuthContext.js` starts from the ID token's claims, then replaces `userData` with `users/{uid}`, which `setEmployeeRole` had already set to `supervisor`. The token on the phone was still the employee one (issued less than 1 h before; nothing forces a refresh). So the app routed to the supervisor screens while every read and callable was checked against `role: employee`.
  - This only happens at an app launch. A running app never notices a role change. Sentry shows 4 cold starts (00:23:26, 00:23:48, 00:24:14, 00:25:40 UTC).
  - Each launch logged permission-denied on the employees, events and sites listeners (ORBITWORKS-APP-1, `role: supervisor`). Dev logs show 11 × 403 from `getPinSyncTable` (00:23:26 to 00:25:44).
- **Punches in the broken state:** none reached Firestore and none were queued. The queue was empty (`startCount 0`) at each of the 4 launches. There is no `queueSync` error in Sentry (every failed send is reported there). Nothing synced after the re-login either. The PIN table never loaded (403), so the PINs were most likely refused as "PIN not recognized". Only 2 clock events exist after 23:30 UTC: Drops in at 23:43:37 and Emilio in at 00:22:30 (Employee App, before the role change).
- **Own shift:** Drops' clock-in survived (event, employee doc and self view all say `in`). It was never visible in the broken state.
- **Same problem by code reading (not tested):**
  - **Supervisor to employee:** the reverse mismatch. Employee App punches fail `wrongAccount`, then show "Couldn't sync" with Remove, so a punch can be lost. The supervisor's unsent queue is no longer synced.
  - **Promotion with unsent Employee App punches:** those punches get stranded, because the employee queue sync isn't mounted for a supervisor.
  - **Admin to/from supervisor:** same UI tree, so nothing goes empty. The token keeps the old powers for up to 1 h.
  - **Deactivation:** a different path (live listener plus token revoke). This is not the same bug.
- **Fix:** B + C chosen 2026-11-20.
  - **B:** the app routes by the token's role and watches users/{uid}. On a change it sends the old role's queue first, refreshes the token, then switches.
  - **C:** the server accepts a promoted login's own queued punches.
  - **Code:** employee-app 3981380..0755aa5. Functions `setEmployeeRole` and `employeeClockPunch` deployed to dev.
  - **Retest:** Session 3b, RC1-1 to RC1-8, on build 30.
- **Follow-up (2026-11-20):**
  - **Remove:** the Sync tab's Remove now says the punch/comment is lost for good and that the admin will be told; each removal sends a punchRemoved alert (website Overview), queued if offline. Retest RC1-9 to RC1-12, RC1-14.
  - **After a promotion:** leave tracking ends ("made a supervisor/admin"); comments, leave tracking and removal reports are sent before the switch, and any leftovers keep sending from the supervisor app. Retest RC1-13.
  - **Website:** follows a role change or deactivation within seconds (users/{uid} roleChangedAt / accessRevokedAt). Retest RC1-15, RC1-16.
- **Logout fix (2026-11-21, app only):**
  - **Both apps:** Log out with anything unsent shows "N punches haven't sent yet" with Send now / Log out anyway / Stay signed in. Nothing is deleted.
  - **Supervisor app:** each saved row keeps the login and company that saved it. Only that login sends it; another login (or company) on the phone sees it as "Another login's" and never sends it.
  - **Retest:** LO-1 to LO-6 (Session 3b), and H8 with the new text.
- **Still open (RC1 stays open):**
  - **Green screens:** you saw green success screens in the broken state, but nothing reached the server and no send failed. By code, green means the punch was written to the phone's queue. Needs the phone's Sync Queue (Drops) checked before a cause is named.
  - **24 h window (decision needed):** an Employee App punch can only be recorded within 24 hours of being made (server rule). The phone's saved PIN for it is kept just as long, so the PIN expiry is not what loses it: a punch not sent within 24 h is refused as too old. The logout box now says so.
