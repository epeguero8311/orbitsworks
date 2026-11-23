# Photo and biometric audit

**Date:** 2026-11-17. **Read-only:** no code, data or config was changed for
this audit.

**What was checked:** the `employee-app` branch at `af1554d` (what's about
to ship), compared against `origin/main` (`5fd9898`). Where it matters, I
also checked what is actually running on prod (`orbitworks-7ef59`) and dev
(`orbitworks-dev-ew`).

**Prod runs main, not employee-app.** Prod's live Storage rules and
Firestore rules are byte-identical to main and differ from employee-app.
Prod has 45 functions. None of the 26 Employee App functions are deployed
there (`joinCompany`, `acceptEmployeeInvite`, `employeeClockPunch`, ...). So
every Employee App row below is "employee-app branch only / not on prod yet".

Paths are relative to `orbitworks-web/` unless they start with
`orbitworks-app/`.

**Applies-to key.** **Plans:** Free / Core / Pro. **Surfaces:** SA =
supervisor app, EA = Employee App, Web = website.

---

## Photos

### a. Where photos are stored

**Answer.** All photos live in each project's default Firebase Storage
bucket: `orbitworks-7ef59.firebasestorage.app` on prod and
`orbitworks-dev-ew.firebasestorage.app` on dev, both in `US-EAST1`. Clock
photos and reference photos sit under separate folders in the same bucket.
They are separated by path and by Storage rule, not by bucket.

| Kind | Path | Written by |
|---|---|---|
| Clock-in/out photo | `companies/{c}/clockEvents/{employeeId}/{file}.jpg` | SA offline queue `orbitworks-app/lib/queueSync.js:202`; EA `functions/src/employeeClock.ts:267` / `orbitworks-app/lib/employeeHome.js:343`; temp clock link `functions/src/tempClockLinks.ts:57` |
| Reference photo (profile photo) | `companies/{c}/employees/{e}/reference.jpg` | Web Add Employee `components/dashboard/employees/AddEmployeeForm.tsx:87`; Web Edit `lib/hooks/useEmployeeModal.ts:355`; SA Create Employee `functions/src/createEmployee.ts:135`; EA sign-up (server copy) `functions/src/joinCompany.ts:165` |
| EA sign-up selfie (original) | `companies/{c}/employees/{e}/selfie/signup.jpg`, or `selfie/invite-{id}.jpg` | `functions/src/joinCompany.ts:164`, `functions/src/acceptEmployeeInvite.ts:108` |
| EA invite onto an existing row | `companies/{c}/employees/{e}/selfie/invite-{id}-photo.jpg` (becomes `photoUrl`) | `functions/src/acceptEmployeeInvite.ts:113` |
| SA "Update employee" new photo | `companies/{c}/employees/{e}/updates/{updateId}.jpg` (becomes `photoUrl`; the old one is retained 30 days) | `orbitworks-app/lib/employeeUpdateQueueSync.js:62` |

**Proof.** `gcloud storage buckets describe` shows both buckets in US-EAST1.
The EA sign-up keeps **two copies** of the same selfie: `selfie/...` plus
`reference.jpg`, via a server copy in `functions/src/lib/signupShared.ts:27-33`.
The original is deleted only on a failed sign-up (rollback,
`functions/src/joinCompany.ts:176-177`).

**Applies to.** Clock photos: every plan (Free/Core/Pro), from SA, EA and
temp links. The Privacy Policy says the same
(`components/legal/PrivacyContent.tsx:122-124`). Reference photos: every
plan, but they are only used for face checks on Pro. The `selfie/` folder
exists only on employee-app (EA).

**Prod differs.** Prod has no `selfie/` folder writes, because no EA
sign-up functions are deployed there.

### b. How long clock photos are kept, and is a cleanup running on prod?

**Answer: settled.** Both of your notes were true, at different times.
`deleteOldClockPhotos` was removed on 2026-08-31 (commit `30d12a4`, "Remove
delete cloud fucntions"). A new job, **`cleanupClockEventPhotos`**, was
added on 2026-10-15 (commit `19fdd26`). It **is deployed and running daily
on prod right now.** There are **no bucket lifecycle rules** on either
bucket.

**Rule.** A clock photo is deleted 90 days after capture. If the event has
a face alert with no resolution, it is kept until the alert is resolved,
then deleted 90 days after the resolution. The job deletes the Storage file
and clears `photoUrl`. On employee-app it also sets `photoRemovedAt`. The
clock event itself and its `faceCheck` result stay.

**Proof.**
- Code: `functions/src/biometricRetention.ts:18-22` (constants), `:129-170`
  (the job), `:83-120` (face-alert block).
- Prod, read-only:
  - `gcloud functions list --project orbitworks-7ef59`:
    `cleanupClockEventPhotos ACTIVE`, deployed 2026-11-03.
  - `gcloud scheduler jobs list`:
    `firebase-schedule-cleanupClockEventPhotos-us-central1  every 24 hours  ENABLED`.
  - Cloud Logging: HTTP 200 runs at about 02:01 UTC on 11-15, 11-16 and
    11-17.
- The same is true for `cleanupDeactivatedEmployeePhotos`,
  `cleanupCanceledCompanyPhotos` and `cleanupRetainedEmployeePhotos`.
- `gcloud storage buckets describe`: no `lifecycle_config`.
  **soft_delete_policy is 604800 s (7 days)**, so every "deleted" photo
  stays recoverable for 7 more days.

**Applies to.** Every plan. The job loops over every company, regardless
of plan (`biometricRetention.ts:131-135`). All surfaces.

**Prod differs.** Main's job deletes without writing `photoRemovedAt`. The
website then shows "Photo removed" only through its fallback rule
(`lib/clockPhoto.ts`). The schedule itself is the same.

### c. Reference photo retention, per event

| Event | What happens | Proof |
|---|---|---|
| Active employee | Kept indefinitely. Never time-expired. | `biometricRetention.ts:166-176` |
| **Deactivation** (manual) | `deactivatedAt` is set. The photo at `photoUrl` is deleted 1 year after deactivation or 3 years after the last clock event, whichever is sooner. Reactivating clears `deactivatedAt`. | `functions/src/employees.ts:148`, `:194`; `biometricRetention.ts:177-235` |
| **Deletion** (`deleteEmployee`, admin/owner) | Immediately deletes the `photoUrl` file, `reference.jpg` and the whole `selfie/` folder. Marks `employeeConsents.faceDataDeletedAt`. Deletes the PIN docs, the Auth user and the employee doc. **Clock events, and their photos and face results, stay** until the 90-day clock-photo sweep. | `employees.ts:525-548`, `:550-660` |
| Photo replaced in SA ("Update employee") | The old photo is kept 30 days, or deleted early when the alert is dismissed. | `functions/src/updateEmployee.ts:19`, `:287-289`; `functions/src/alerts.ts:891`, `:918` |
| Photo replaced on Web (Edit) | Overwrites `reference.jpg` at the same path. The old photo is gone at once (7-day soft delete). | `lib/hooks/useEmployeeModal.ts:355-358` |
| **Downgrade Pro to Core** | Nothing is deleted. Face checks stop, because `isProCompany` returns false. Photos stay as profile pictures. | `functions/src/rekognition.ts:91-95`; `docs/dev-functions-pending.md` ("reference selfie STAYS on a downgrade") |
| **Downgrade below the employee cap** (billing page, deactivating by choice) | The chosen employees are deactivated through `deactivateEmployeesBulk`, which sets `deactivatedAt`. The 1-year rule applies. | `employees.ts:194` |
| **Cancellation** (Stripe subscription deleted) | `autoRevertToFree` deactivates employees over the free cap (**without `deactivatedAt`**) and stamps `planCanceledAt`. 90 days later, every `photoUrl` file (employees and clock events) is deleted. Resubscribing before then cancels the wipe. | `app/api/stripe/webhook/route.ts:102`, `:122`, `:143-144`, `:233-234`; `biometricRetention.ts:249-285` |
| **Account (company) deletion** | **No code path.** Support says to email a request; deletion is manual "within 30 days". There is no script or runbook. | `app/support/page.tsx:120-145`; no `deleteCompany`/`deleteAccount` anywhere |

**Gap in the time-based sweeps (employee-app).** The deactivation sweep and
the cancellation sweep delete only the file `photoUrl` points to. The EA
sign-up's original selfie in `selfie/` is an identical copy of the reference
photo, and **it survives both sweeps.** Only `deleteEmployee` removes
`selfie/` (`biometricRetention.ts:62-77` vs `employees.ts:535-536`).

**Applies to.** The face-relevant part is Pro only. The sweeps run for
every plan. The `selfie/` gap affects EA sign-ups only.

**Prod differs.** No `selfie/` folder on prod, so no gap there yet. Prod
deletion (`deleteEmployee`) still deletes the `photoUrl` file. The explicit
`reference.jpg` + `selfie/` cleanup in `deleteEmployeeFaceData` is
employee-app only.

### d. Who can view, download or delete each kind of photo

**Storage rules (employee-app, `storage.rules`):**

| Who | Clock photos | Reference photo | Selfie folder |
|---|---|---|---|
| Owner / admin / supervisor (any non-employee user with the company claim) | read + write + **delete**, whole company (`:23-27`) | read + write + delete | read + write + delete |
| Employee (EA login) | read/create/update **own only**, no delete (`:31-34`) | **no access** | read/create/update own, no delete (`:41-44`) |
| Anyone else | denied (`:46-48`) | denied | denied |

**UI.**
- Web shows clock photos and reference photos to owner/admin. Supervisors
  can read the same Firestore docs and Storage objects:
  `firestore.rules:526-529` (`clockEvents` readable by `notEmployee()`) and
  `:426-429` (`employees`).
- There is **no "delete photo" or "remove profile photo" control** on Web
  or in SA. Web only has "Change photo"
  (`components/dashboard/employees/EmployeePhotoAndPin.tsx:64-70`).
- The only way to remove someone's face data is to delete the employee
  (admin/owner only, `employees.ts:654-656`).
- In EA, an employee can read their own clock events, including `faceCheck`
  (`firestore.rules:540-541`). The app shows no face result
  (`orbitworks-app/lib/queueSync.js:388`).

**Applies to.** Rules: every plan. EA rows: employee-app only.

**Prod differs.** Main's Storage rule has no `!isEmployeeRole()` clause and
no employee paths. That is safe on prod only because no employee-role
logins exist there.

### e. Public links or token links?

**Answer.** Every stored `photoUrl` and `referencePhotoUrl` is a Firebase
**download-token URL**:
`https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<uuid>`.
That is a bearer link: **anyone who has it can open the photo with no
login**, and Storage rules don't apply. Without the token, the request is
refused.

**Proof.**
- Read-only test on a dev clock photo: no-auth GET with token → **HTTP
  200**; the same URL with the token removed → **HTTP 403**.
- Builders: `functions/src/lib/signupShared.ts:31-32`,
  `functions/src/employeeClock.ts:302-306`,
  `functions/src/tempClockLinks.ts:62`, and every client `getDownloadURL`
  call.
- No `allUsers` IAM binding on either bucket.

**Where the links travel.**
- They sit in Firestore docs that owner/admin/supervisor can read, and EA
  employees can read their own.
- The **Excel export embeds the photo bytes** in a "Photos" sheet
  (`lib/reportExcelSheets.ts:257-320`). Those copies leave every retention
  schedule.

**Applies to.** Every plan and every surface. Same on prod.

---

## Face recognition

### f. Which Rekognition API, and what's stored at AWS

**Answer.**
- **`CompareFaces`** (1:1): clock photo vs reference photo
  (`rekognition.ts:209-216`), and old vs new reference photo on an SA
  update (`:410-420`).
- **`DetectFaces`**: is the reference photo usable? (`:367`). Which photo
  had no face? (`:106`).
- **No** `CreateCollection`, `IndexFaces`, `SearchFaces*` or `DeleteFaces`
  anywhere. A grep across functions, web and lib finds only
  `CompareFacesCommand` and `DetectFacesCommand`.
- No FaceId, face vector or template is created or stored by us, in
  Firestore or at AWS. Images are sent as raw bytes (`Image: { Bytes }`),
  never as S3 objects, so no S3 copy is created.

**Does AWS keep the images?** The Rekognition FAQ
(https://aws.amazon.com/rekognition/faqs/, read 2026-11-17) says Rekognition
"may store and use image and video inputs processed by the service solely
to provide and maintain" it, and, **unless you opt out** "by using an AWS
Organizations opt-out policy", to "improve and develop the quality of
Amazon Rekognition" and other Amazon AI. The FAQ makes no per-operation
exception for CompareFaces or DetectFaces. So "nothing is stored at AWS"
is **not established**. It depends on the opt-out in (g).

**Applies to.** Pro only (`rekognition.ts:180`, `:354`). Server-side only.
SA, EA and temp-link punches are all checked.

**Prod differs.** Same APIs. Main's no-face handling is older: any
`InvalidParameterException` flagged the *reference* photo as bad, even when
the clock photo was the one with no face (fixed on employee-app at
`:217-255`; `recheckBadFaceReferences.js` cleans up the old flags).

### g. AWS account, region and opt-out

**Answer.**
- **Account:** "Greenfield Adventures", on the AWS free plan with credits
  ending Apr 5 2027 (`FACE_VERIFICATION_SPEC.md:59`).
- **Region:** `us-east-2` (`rekognition.ts:20`).
- **Credentials:** an access key in Secret Manager
  (`REKOGNITION_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY`), present in both
  prod and dev (`gcloud secrets list`). The prod and dev functions use the
  same AWS account; the region is hard-coded.

**Opt-out status: UNKNOWN.** This machine has no AWS CLI and no AWS
credentials, I did not pull the Rekognition secrets to check, and no doc
records an AI-services opt-out policy. To check, in the AWS console run
`aws organizations list-policies --filter AISERVICES_OPT_OUT_POLICY` and
then `describe-effective-policy` for the account. An AWS free-plan account
also stops working when the plan ends unless it is upgraded, so face checks
would silently stop (the code fails open).

**Applies to.** Pro. Prod and dev.

### h. What's stored in Firestore per check

**Answer.** On the clock event, `faceCheck` holds `{ status:
"match"|"mismatch"|"noFace", similarity (1 decimal, or null for noFace),
threshold: 90, referencePhotoUrl, facesInTarget, checkedAt }`.

Other records:
- **Per company:** `faceCheckClaims/{eventId}` (`claimedAt`), a once-only
  guard.
- **Per employee:** `faceReference: { status: "bad", photoUrl, reason:
  "noFace"|"multipleFaces", flaggedAt }`, only while the reference photo is
  unusable.
- **Alerts:** `alerts/*` docs for `faceMismatch` / `faceNoFace` /
  `faceBadReference`.
- **EA:** an `employeeAlerts` entry for a no-face result on the employee's
  own punch.
- **SA update:** `employeeUpdates.photoCompareSimilarity`.

**Proof.** `rekognition.ts:21`, `:118-131`, `:234-241`, `:263-299`,
`:384-391`; `updateEmployee.ts:281`. Clients can't write `faceCheck` or
`faceReference` (`firestore.rules:568-578`, `:613`). Results are **kept
forever**: no job deletes `faceCheck` or face alerts (alerts are a
"permanent audit record", `biometricRetention.ts:81-86`).

**Applies to.** Pro. All surfaces.

### i. Outcomes per scenario (the punch is never blocked)

The check runs in a Firestore trigger **after** the clock event is already
written (`clockEvents.ts:180`, `:822`, `:836-846`). The whole function is
wrapped in a try/catch that never rethrows (`rekognition.ts:174`,
`:304-306`). No path blocks, edits or deletes the punch.

| Case | Result | Proof |
|---|---|---|
| Match (similarity ≥ 90) | `faceCheck.status = "match"`, no alert | `rekognition.ts:285-298` |
| Mismatch (< 90, a face was found) | `"mismatch"` + similarity. A `faceMismatch` alert if both alert toggles are on. **The employee is never told.** | `:287-303`; `alerts.ts:612-623` |
| "Low score" | There's no separate band. Anything under 90 is a mismatch. | `:21`, `:287` |
| No face in the clock photo | `"noFace"`, `faceNoFace` alert. EA tells the employee only for their own EA punch on its first check. | `:217-283`; `alerts.ts:647-658` |
| No reference photo | Skipped. Nothing written. | `:187` |
| Bad reference (0 or 2+ faces) | `faceReference.status = "bad"` + a `faceBadReference` alert (always fires). Checks pause for that employee until the photo changes. | `:188-190`, `:230-243`, `:375-392` |
| AWS error or timeout, download failure, image > 5 MB, missing secret | Logged as a warning. Nothing written. **No retry.** | `:67-80`, `:217-222`, `:304-306` |
| Offline punch synced later | Checked when the event syncs (create trigger, or photo-added trigger). The punch keeps its original time. Retention counts from capture time. | `clockEvents.ts:817-846`; `biometricRetention.ts:150` |

**Applies to.** Pro. SA, EA and temp links.

### j. Who sees results and alerts, dismissals, and an audit log

- **Who sees results and alerts:**
  - Owner/admin on Web.
  - Supervisors, who can read `clockEvents` and `alerts`
    (`firestore.rules:526-529`, `:696-699`).
  - The employee, only their own events' `faceCheck` (raw data; EA shows
    nothing) and their own no-face message.
- **Dismiss / override:**
  - An admin can **resolve or ignore** an alert. That writes `alertActions`
    with `resolvedByUid`, `resolvedByName` and `resolvedAt`
    (`lib/hooks/useAlertActions.ts:83-98`, `:150`).
  - Alerts are never deleted (`firestore.rules:700`).
  - An admin can **reassign** a punch to another employee, which deletes
    the old `faceCheck` and re-runs the check (`clockEvents.ts:954`,
    `:1057`).
  - An admin **cannot** edit `faceCheck` or mark a mismatch as a match.
- **Audit log of who viewed photos or results: none.** A grep for
  view/access logging finds nothing. Only resolutions are logged.

**Applies to.** Pro (face alerts). Web, plus SA reads.

### k. Is face recognition always on for Pro? What does the setting turn off?

**Answer.** It is **always on for Pro**, for every employee who has a
reference photo. There is no company opt-out (`rekognition.ts:86-95`;
Terms §4, `components/legal/TermsContent.tsx:82-89`).

The website's **"Face recognition alerts"** switch
(`company.faceVerification.alertsEnabled`,
`components/dashboard/settings/AlertsCard.tsx:153`) and its two sub-toggles
(`faceMismatchAlert`, `faceNoFaceAlert`) turn off **only the alerts, the
push and the employee's no-face message**. **The AWS call and the stored
`faceCheck` still happen** (`alerts.ts:180-188`, `:623`, `:658`). The
bad-reference alert ignores every toggle.

The only way to keep one employee out of face checks is to never give them
a reference photo. An **EA sign-up always creates one from the selfie**, and
no UI can remove it later.

**Applies to.** Pro. Web settings.

---

## Consent and deletion

### l. Consent today

| Who | What they see | Record saved |
|---|---|---|
| **Company owner (Web sign-up)** | Checkbox: "I agree to the [Terms and Conditions](/terms) (including Section 4, Biometric Data and Face Verification, and Section 5, Location Information) and the [Privacy Policy](/privacy). I understand that if I enable face verification or location features, I am responsible for notifying my employees and obtaining any consent required by law before doing so." Both links open in a new tab. (`app/signup/page.tsx:280-311`) | `agreedToTermsAt` (server timestamp) + `termsVersion` on **both** `companies/{c}` and `users/{uid}` (`functions/src/company.ts:74-75`, `:85-86`). The server re-checks it (`:28-33`). Version: employee-app `2026-11-04-r6`; prod `2026-10-14-r5`. Owners re-accept when it changes. |
| **EA sign-up (QR code or email invite), any plan that allows it** | Box 1: "I have read and agree to the [Privacy Policy](/privacy)." Box 2, under the heading "Face check consent", shows the server text `BIOMETRIC_CONSENT_TEXT` (`functions/src/consentVersions.ts:25-31`), then "Read the Biometric Data Policy" (/biometric-policy), then "I agree to the face check consent above." (`orbitworks-app/screens/join/JoinAccountStep.js:103-125`) | `companies/{c}/employeeConsents/{employeeId}`: `uid, employeeId, companyId, joinCodeId, privacyPolicyVersion, privacyAcceptedAt, biometricConsentVersion ("employee-signup-2026-10-23-v1"), biometricConsentAt, source, faceDataDeletedAt: null`. It is written **in the same transaction that creates the employee, before any photo is saved** (`joinCompany.ts:339-350`, `:360-370`; `acceptEmployeeInvite.ts:400`). Wrong versions are rejected (`joinCompany.ts:230`). Server-only (`firestore.rules:490-492`). |
| **EA location (Pro, geofenced)** | `LOCATION_CONSENT_TEXT` (`consentVersions.ts:49-56`) | Same doc, via `acceptLocationConsent` |
| **Admin-created employee (no app login), SA** | Bilingual "Before this photo is taken" notice that the **supervisor** taps through (`orbitworks-app/components/supervisor/PhotoNoticeModal.js:25-67`) | `photoNoticeAck: { uid (the supervisor), shownAt }` on the employee (`createEmployee.ts:114-117`, `:205`). This proves the notice was shown on the device. **It is not the employee's consent.** |
| **Admin-created employee, Web** | **Nothing.** Add Employee uploads the reference photo straight away. | **None.** The Biometric Policy puts consent on the Customer (§3, `BiometricPolicyContent.tsx:132-142`), which gets a printable template (`/employee-notice`). |

The exact EA biometric text: "I agree that my employer can use my photo for
face checks when I clock in and out, to confirm it is really me. My signup
selfie becomes my reference photo. Clock-in photos are compared to it using
Amazon Rekognition. Photos are only used for these checks, are never sold,
and are deleted on the schedule in the OrbitsWorks Biometric Data Policy. I
can ask my employer to delete my face data at any time."

**Prod differs.** No `employeeConsents` and no EA sign-up on prod. On prod,
only the owner checkbox (r5) and the SA notice exist.

### m. Can an employee's biometric data be deleted on request?

- **Employee:** no self-service. EA has **no "delete my account" or "delete
  my data"** anywhere (a grep of `orbitworks-app` finds nothing). The
  consent text says to ask the employer.
- **Admin/owner:** only by **deleting the employee** (Web, `deleteEmployee`).
  - Deleted: the `photoUrl` file, `reference.jpg`, `selfie/*`, the PIN
    docs, the Auth login, the `users` doc and the employee doc.
    `employeeConsents` gets `faceDataDeletedAt` and is **kept** as proof of
    consent.
  - Stays: **every clock event, its clock photo (until the 90-day sweep),
    its `faceCheck` (forever), face alerts and `alertActions` (forever),
    `employeeUpdates` records,** and photos already embedded in Excel
    exports.
- **There is no way to remove face data while keeping the employee** (no
  "remove photo"). There is **no way to delete one clock photo early.**
  Storage rules would allow it from a client, but no UI or callable does
  it.
- **Company or account deletion:** an email request handled manually. No
  script exists.

**Applies to.** Every plan (photos), Pro (face results). Web only.

### n. What the legal pages say, and what the code doesn't back up

Pages: `/biometric-policy` (`components/legal/BiometricPolicyContent.tsx`),
`/privacy` (`components/legal/PrivacyContent.tsx`), `/terms`
(`components/legal/TermsContent.tsx`), `/employee-notice`
(`components/legal/EmployeeNoticeContent.tsx`) and `/support`
(`app/support/page.tsx`). The biometric wording on main is the same apart
from escaping. Prod shows Terms version r5.

| # | Quote (file:line) | Code reality |
|---|---|---|
| N1 | "Rekognition does not retain a copy of either image after the comparison call completes; nothing is stored at AWS by this feature." (Biometric `:53-55`) | **Not backed.** AWS says it may store and use inputs unless an Organizations opt-out is set. The opt-out is unverified (f, g). |
| N2 | "We do not use biometric data ... to train artificial-intelligence or machine-learning models." (Biometric `:177-178`; Privacy `:137-138`; Notice `:66-68`) | True for OrbitsWorks itself. **AWS may use the inputs for model improvement unless opted out.** Unverified. |
| N3 | "...no separate biometric template ... is created or stored by OrbitWorks or by Rekognition on Customer's behalf." (Terms `:100-103`) | OrbitsWorks: backed. "By Rekognition": same caveat as N1. |
| N4 | "Storage access to the underlying photos is restricted to authenticated users of the Employee's own company." (Biometric `:166-167`, also `:38-41`) | **Not backed.** Token URLs open with no login (e). |
| N5 | "Active reference photo: deleted 1 year after the Employee is deactivated, or 3 years after ... last clock event" (Biometric `:90-96`; Privacy `:264-266`) | Partly. The `photoUrl` file is deleted, but **the EA `selfie/` copy is not** (c). Employees deactivated by `autoRevertToFree` have no `deactivatedAt`, so only the 3-year rule or the cancellation wipe applies. A deactivated employee with no `deactivatedAt` and no clock events is **never** swept (`biometricRetention.ts:225-228`). |
| N6 | "every biometric photo for Customer's account ... is deleted 90 days after cancellation" (Biometric `:110-115`; Privacy `:267-268`) | Partly. The `selfie/` copies, retained `updates/` photos until their own 30 days, and Excel copies are not covered. |
| N7 | "Clock-in/clock-out photos are kept as part of your attendance history." (Notice `:60-61`) | **Contradicts** the 90-day deletion. Photos are deleted; only the event and its result stay. |
| N8 | "Employee profiles and profile photos: ... for up to 90 days following applicable account termination or deletion" (Privacy `:236-240`) | **Contradicts** Privacy `:266` and Biometric `:105-107` ("deleted immediately") and the code (immediate on delete). |
| N9 | "[Customer] can remove the Employee's profile photo and request deletion of historical clock-event photos" (Biometric `:148-150`); "this is the mechanism by which Customer can keep an Employee out of face verification" (Terms `:84-88`) | **No "remove photo" control exists** on Web or SA. The only way is deleting the employee. EA sign-ups always get a photo. |
| N10 | "We'll delete your account, employee records, clock-in events, and photos within 30 days of a verified request." (Support `:138-139`) | **No procedure or script** exists. It would be done by hand. |
| N11 | "A separate, one-time check ... produces no stored result beyond a pass/fail flag" (Biometric `:61-66`) | Backed (`faceReference` only when bad). Also stored: an `employeeUpdates.photoCompareSimilarity` score on SA photo changes. Minor. |
| N12 | "The only thing OrbitWorks stores from the comparison is ... a status, a similarity score, the threshold used, and which reference photo" (Biometric `:58-61`) | Backed. Also stored: `facesInTarget`, `checkedAt`, and alerts. Minor. The policy doesn't say results are **kept forever**. |
| N13 | "These schedules are automated" (Biometric `:78-79`) | Backed (jobs running on prod), but deletion takes **7 more days** of soft-delete recovery. "Backup copies may remain for a limited period" (Privacy `:279-281`) covers that. Biometric is silent. |
| N14 | "Amazon Rekognition for optional face-verification functionality" (Privacy `:205`) | Terms §4 says there's **no** company opt-in or opt-out on Pro. "Optional" only means the Pro plan itself is optional. Wording mismatch. |
| N15 | EA consent: "I can ask my employer to delete my face data at any time." (`consentVersions.ts:30-31`) | The employer can only do it by deleting the whole employee (m). |

Backed by the code: 1:1 CompareFaces only; Pro only; never on Core; never
blocks a punch (Biometric `:69-73`, Notice `:53-55`, Terms `:106`); 90-day
clock photo deletion; 30-day replaced-photo retention (SA flow); immediate
reference deletion on employee delete; 90-day wipe after cancellation;
clients can't write results (Biometric `:163-165`); no sale.

---

## (1) Where the code and the website text disagree

1. **AWS retention and model training** (N1, N2, N3): the text promises
   nothing is kept at AWS and no AI training. That depends on an
   unverified AWS opt-out.
2. **"Only authenticated users"** (N4): bearer token links work without
   login.
3. **Reference photo deletion schedules** (N5, N6): the EA `selfie/`
   duplicate isn't swept, and cancellation deactivations miss
   `deactivatedAt`.
4. **The employee notice says clock photos are kept as attendance history**
   (N7). The code deletes them at 90 days.
5. **Privacy says "up to 90 days after deletion"** for profile photos (N8).
   Code and other lines say immediately.
6. **"Remove the profile photo" as the opt-out and deletion mechanism**
   (N9, N15): no such control exists.
7. **Support's 30-day full account deletion** (N10): no tooling.
8. **"Optional"** in Privacy vs always-on in Terms (N14). Minor.

## (2) Gaps with no answer

| Gap | Rating |
|---|---|
| AWS AI-services opt-out not verified or set for the Rekognition account (N1/N2 are public promises) | **BLOCKER** |
| No in-app account deletion in the Employee App, which lets people create accounts (Apple App Store guideline 5.1.1(v) requires it; it also backs N15) | **BLOCKER** |
| No way to remove one employee's face data or profile photo while keeping the record (N9, N15; BIPA-style deletion requests) | **BLOCKER** |
| EA `selfie/` copy survives the deactivation and cancellation sweeps (N5/N6) | **BLOCKER**: a stated biometric retention schedule isn't met. A small fix: delete `selfie/` in those sweeps, or don't keep the original. |
| Employee Notice and Privacy text contradictions (N7, N8), and the "authenticated users only" claim (N4) | **BLOCKER** (text fix only) |
| No company and account deletion procedure or script behind Support's 30-day promise (N10) | SHOULD FIX |
| Photo links are bearer tokens with no expiry. They travel in docs readable by every supervisor, and in exports. | SHOULD FIX (signed short-lived URLs or a proxy), or disclose it |
| Web Add Employee captures a reference photo with no notice or record (SA has a notice; neither records employee consent) | SHOULD FIX |
| `autoRevertToFree` deactivations don't set `deactivatedAt`; a deactivated employee with no `deactivatedAt` and no clock events is never swept | SHOULD FIX |
| AWS free-plan account ends Apr 5 2027; face checks fail open silently after that | SHOULD FIX (upgrade the account; alert on repeated AWS failures) |
| No retry after an AWS error or timeout. That punch is never checked, silently. | LATER |
| `faceCheck` results, face alerts and `alertActions` kept forever, with no stated retention | LATER (state it in the policy, or add a sweep) |
| No audit log of who viewed photos or face results | LATER |
| Excel exports embed photos outside every retention schedule | LATER (disclose it in the policy) |
| 7-day Storage soft delete not mentioned in the Biometric Policy | LATER |

## (3) What each doc can safely say today

**Biometric Data Policy**
- Face verification runs only on Pro plans, only for employees with a
  reference (profile) photo, and never on Core or Free.
- It is a one-to-one comparison (AWS Rekognition CompareFaces) of each
  clock-in and clock-out photo against that employee's own reference photo.
  DetectFaces is used only to check that a reference photo has exactly one
  face. No face collection, index or search is used. OrbitsWorks creates
  and stores no face template or embedding.
- Stored per check: the status, similarity score, threshold, reference
  photo used, number of faces, and time. Alerts are created for admins and
  supervisors.
- A result never blocks, delays or changes a punch.
- Retention: clock photos are deleted 90 days after capture (90 days after
  any open face alert is resolved). Replaced reference photos are deleted
  after 30 days. The reference photo is deleted immediately when the
  employee is deleted. All photos are deleted 90 days after the
  subscription is canceled. Deleted files can be recovered for up to 7 days.
- **Don't say yet:** "nothing is stored at AWS" or "not used to train AI"
  (until the opt-out is confirmed), "only authenticated users can access
  photos", or that the deactivation schedule covers every copy.

**Photo Storage & Retention Policy**
- Photos are stored in Google Cloud / Firebase Storage (US).
- Each company's photos are in its own folder. Only that company's owners,
  admins and supervisors, plus an employee for their own photos, can reach
  them through the app.
- Photos are served through unguessable links. Anyone holding a link can
  open the photo.
- Clock photos are taken on every plan as an attendance record, and deleted
  on the 90-day schedule above.
- Exports you download contain copies that you control.

**Employee Privacy Explanation (the employee notice)**
- What's collected: your sign-up selfie becomes your reference photo
  (Employee App), plus a photo at each clock-in and clock-out.
- Why: the photos are compared to confirm it's you. A mismatch never stops
  you clocking in. You're told only if no face was found.
- Your employer's admins and supervisors can see your photos and results.
- Clock photos are deleted after 90 days.
- Your consent is recorded with a date and version.
- **Don't say yet:** "I can ask to delete my face data at any time" as a
  self-service option, or that your employer can remove just your photo.
  Today the only way is removing you as an employee.

**Data Deletion Procedure**
- **Admin, delete an employee:** removes their login, profile and selfie
  photos and their record right away. Their clock history and face results
  stay. Clock photos are deleted on the 90-day schedule.
- **Cancel the subscription:** all photos are deleted after 90 days.
- **Whole company:** email request, handled manually. Describe this as
  manual, with no fixed tooling yet.
- There is no per-photo deletion and no employee self-deletion yet.

**Face Recognition FAQ**
- Always on for Pro. It can't be turned off per company. The "Face
  recognition alerts" setting only hides the alerts; the check still runs.
- An employee with no profile photo isn't checked.
- Match threshold: 90% similarity.
- No-face and mismatch results create alerts that an admin can resolve or
  ignore. Results can't be edited.
- An AWS outage means that punch simply isn't checked.
- Offline punches are checked when they sync.

**AWS Rekognition Explanation**
- Calls are made only by OrbitsWorks servers, over an encrypted
  connection, in AWS us-east-2.
- The only operations used are CompareFaces and DetectFaces. Images are
  sent as bytes and never placed in S3 or a face collection.
- OrbitsWorks stores no face data at AWS.
- **Only after the opt-out is confirmed:** "AWS does not use our images to
  improve its services."
