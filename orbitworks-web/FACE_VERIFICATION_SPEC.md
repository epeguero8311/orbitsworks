# Face Verification (Pro) - Build Spec for Claude Code

## Update: always-on for Pro (post-v1)

Face checks are no longer a company-level opt-in. They run automatically
for every Pro company whenever an employee has a pfp - there is no
`faceVerification.enabled` field anymore. The only remaining company
setting is `faceVerification.alertsEnabled` (default true): when false,
checks still run and `faceCheck` still gets saved on the clock event
(badges keep working), but `faceMismatch`/`faceNoFace` alerts (and their
push) are skipped. `faceBadReference` always fires regardless, since it
means checks are paused for that employee. Everything below this notice
describes the original v1 design; where it conflicts with this notice,
this notice wins.

## Update: toggle lives in Alerts, not its own card (post-v1)

There is no separate "Face verification" settings card anymore. The
`alertsEnabled` toggle moved into the existing Alerts card
(`AlertsCard.tsx`), alongside the other alert toggles. For Core
companies it's shown but locked - rendered checked/disabled with a PRO
badge next to it (`Toggle`'s existing `disabled`/`badge` props,
`ProBadgeLink`), not hidden behind an upgrade panel like Geofencing's
card does. `FaceVerificationCard.tsx` was deleted.

Read this whole file before touching code. Inspect the real files listed in "Inspect first"
before editing anything - do not guess anchors, shapes, or helper names.

---

## 1. What we're building

Every clock-in AND clock-out photo gets compared against the employee's reference photo
(their pfp, `employees/{id}.photoUrl`). The result is written onto the clock event. A low
score creates a `faceMismatch` alert for admins/supervisors.

- Clock-in/out stays instant. Verification runs in the background. A mismatch NEVER blocks a clock event.
- Employees with no pfp: NOTHING happens (no AWS call, nothing written, no alert).
- Anything wrong (buddy punch, no face in photo, bad pfp) -> alert. AWS/system failures -> no alert, log only.
- Pro-only feature, off by default per company.
- Server-only. The client never talks to AWS.

## 2. Locked decisions (do not change without asking)

| Decision | Choice | Why |
|---|---|---|
| Rekognition API | **CompareFaces (1:1)** | The PIN already identifies the employee. We only verify, not identify. |
| Collections / IndexFaces / SearchFacesByImage / DeleteFaces | **Do NOT use** | Nothing is stored at AWS, so there is no face data to sync or delete. |
| S3 | **Do NOT use** | Image bytes go straight from Firebase Storage into the CompareFaces request. |
| Where it runs | Cloud Function (Firestore trigger on clockEvents) | Background, server-only, no API route. |
| Match cutoff | **90** similarity (constant `FACE_MATCH_THRESHOLD`) | Tune after real testing. |
| `SimilarityThreshold` sent to AWS | **0** | Always get a score back. AWS hides scores under 80 by default. |
| Region | `us-east-1` (hardcoded) | |
| Feature default | Always on for Pro, never for Core, no company opt-out | Changed from the original opt-in design - see "Update: always-on for Pro" below. |
| Which events | Both `type: "in"` and `type: "out"` | Same reference pfp for both. |

## 3. AWS + secrets (ALREADY DONE - do not redo)

- AWS account: "Greenfield Adventures" (free plan, $100 credits, ends Apr 5 2027 -> upgrade same account later).
- IAM user `orbitworks-rekognition` with inline policy `rekognition-compare-only`:
  `rekognition:CompareFaces`, `rekognition:DetectFaces` on `*`. Do NOT widen this policy.
- Firebase Functions secrets (exist, ENABLED):
  - `REKOGNITION_ACCESS_KEY_ID`
  - `REKOGNITION_SECRET_ACCESS_KEY`
- For the emulator: put the values in `functions/.secret.local` (confirm it's gitignored first).

## 4. Inspect first (read these before writing anything)

```
functions/package.json
functions/src/index.ts                     (how functions are exported)
functions/src/geocoding.ts                 (pattern for defineSecret + external API client)
functions/src/lib/resend.ts                (same)
functions/src/alerts.ts                    (ALERT_TYPES, ALERT_SEVERITY, ALERT_ID_PREFIX, ALERT_SETTINGS_DEFAULTS)
wherever onClockEventCreated lives          (existing check* functions)
reassignClockEvent function                 (needs a change - see 6.6)
lib/types.ts                                (ClockEvent, Employee, Company settings, alert types)
lib/validators/                             (zod schemas for settings)
firestore.rules                             (clockEvents update rules)
How Pro tier is checked today (geofencing / geolocation code) - reuse that helper, don't invent a new one.
How employees.photoUrl is stored: a Storage path or a download URL? (see 6.3)
Mobile app (orbitworks-app): is clock event photoUrl set at doc creation, or patched in later by offline replay?
```

## 5. Build order (project convention)

types -> validators -> firestore rules -> cloud function -> hooks -> components -> page composition

Branch: `face-recognition`, cut from the pro-plan branch (NOT main).

## 6. Implementation details

### 6.1 Types (`lib/types.ts`, mirror in functions if functions keeps its own copy)

```ts
export type FaceCheckStatus = "match" | "mismatch" | "noFace";

export interface FaceCheck {
  status: FaceCheckStatus;
  similarity: number | null;        // best score 0-100, null when noFace
  threshold: number;                // cutoff used at check time (90)
  referencePhotoUrl: string;        // pfp used for this check
  facesInTarget: number;            // faces detected in the clock photo
  checkedAt: Timestamp;
}

// Server-only flag on the EMPLOYEE doc. Set when the pfp has no usable face.
export interface FaceReferenceState {
  status: "bad";
  photoUrl: string;                 // the exact pfp that was bad
  reason: string;                   // e.g. "noFace", "multipleFaces", "InvalidParameterException"
  flaggedAt: Timestamp;
}
// Employee gets:  faceReference?: FaceReferenceState   (server-written only; absent = fine/unchecked)

// ClockEvent gets:  faceCheck?: FaceCheck   (server-written only)
// Company settings get:  faceVerification: { enabled: boolean }   default { enabled: false }
export const FACE_MATCH_THRESHOLD = 90;
```

Keep union types and generics on ONE line (SWC parser issue in .tsx).

Outcomes:

| situation | written | alert |
|---|---|---|
| employee has no pfp | nothing | none |
| employee faceReference bad AND same photoUrl | nothing (skip, $0) | existing badReference alert stays |
| best similarity >= 90 | faceCheck match | none |
| faces found, best < 90 | faceCheck mismatch | faceMismatch |
| clock photo has no face | faceCheck noFace | faceNoFace |
| pfp unusable (InvalidParameterException on source) | employee.faceReference = bad | faceBadReference (one per employee, persistent) |
| AWS down / throttled / download fail / too large / bad format | nothing | none - logger.warn only |

### 6.2 Validators
Add `faceVerification: z.object({ enabled: z.boolean() })` to the company settings schema with default false.

### 6.3 Cloud Function `functions/src/rekognition.ts`

- `defineSecret("REKOGNITION_ACCESS_KEY_ID")`, `defineSecret("REKOGNITION_SECRET_ACCESS_KEY")`, mirroring geocoding.ts.
- `RekognitionClient({ region: "us-east-1", credentials: { accessKeyId, secretAccessKey } })`. Create it inside the handler (secrets are only readable at runtime).
- Install: `npm install @aws-sdk/client-rekognition` inside `functions/`.

Trigger choice:
- If photoUrl is ALWAYS present when the clock event doc is created -> call `checkFaceMatch()` from `onClockEventCreated` with the other check* functions (add the secrets to that function's `secrets: []`).
- If photoUrl can arrive LATER (offline replay patches it in) -> separate `onDocumentWritten("companies/{companyId}/clockEvents/{eventId}")`. Run only when `after.photoUrl` exists AND `after.faceCheck` is missing. This guard also prevents the infinite loop when we write faceCheck back.
- Confirm which case applies from the mobile code. Ask if unclear.

Handler steps (clock event check):
1. Guard: event exists, `photoUrl` present, `faceCheck` absent.
2. Load the company. Skip silently unless it is Pro (existing helper) AND `faceVerification.enabled === true`.
3. Load the employee. No `photoUrl` -> stop. Write nothing.
4. If `employee.faceReference?.status === "bad"` AND `employee.faceReference.photoUrl === employee.photoUrl` -> stop. Write nothing. (Saves AWS calls until the pfp is replaced.)
5. Download both images with Admin SDK `bucket.file(path).download()`.
   - If photoUrl is a download URL, extract the object path from the `/o/<encoded>` segment and `decodeURIComponent` it.
   - If either buffer is > 5 MB -> logger.warn, stop, write nothing. Don't add sharp in v1.
6. `CompareFaces({ SourceImage: { Bytes: pfp }, TargetImage: { Bytes: clockPhoto }, SimilarityThreshold: 0 })`.
7. Map the result:
   - `facesInTarget = FaceMatches.length + UnmatchedFaces.length`
   - 0 faces -> `noFace` + faceNoFace alert
   - otherwise best = max(FaceMatches[].Similarity): `match` if best >= 90, else `mismatch` + faceMismatch alert
   - InvalidParameterException (source image has no face) -> do NOT write faceCheck; set `employee.faceReference = { status:"bad", photoUrl, reason, flaggedAt }` and create the faceBadReference alert (6.5)
   - Any other error -> logger.warn with err.name, write nothing, no alert, do not rethrow. (Because nothing is written, a later write to the event naturally retries it.)
8. Write `faceCheck` with an Admin SDK `update()`. Round similarity to 1 decimal.
9. `logger.info` one line: companyId, eventId, employeeId, status, similarity. Never log image bytes or URLs with tokens.

Second function - reference photo check (employee pfp changes):
- Trigger: `onDocumentUpdated("companies/{companyId}/employees/{employeeId}")` (and created, if pfps can be set at creation) when `photoUrl` changed and is non-empty.
- Same Pro + enabled gate.
- Download the pfp -> `DetectFaces({ Image: { Bytes } })`.
  - exactly 1 face -> delete `faceReference` (FieldValue.delete()) and auto-resolve any open faceBadReference alert for this employee
  - 0 faces -> set faceReference bad (reason "noFace") + faceBadReference alert
  - 2+ faces -> set faceReference bad (reason "multipleFaces") + faceBadReference alert
  - AWS error -> logger.warn, clear nothing, write nothing
- photoUrl removed -> delete faceReference and resolve the alert (no pfp = feature silently off for them).
- Guard against loops: this function writes faceReference, not photoUrl, so only react when photoUrl changed.

Traced examples:
```
Rosa clocks out, pfp vs photo -> FaceMatches [{Similarity: 96.43}]  -> faceCheck {status:"match", similarity:96.4}
Someone else uses Rosa's PIN  -> FaceMatches [{Similarity: 38.12}]  -> faceCheck {status:"mismatch", similarity:38.1} + faceMismatch alert
Camera aimed at the ceiling   -> FaceMatches [], UnmatchedFaces []  -> faceCheck {status:"noFace"} + faceNoFace alert
Rosa's pfp is her dog         -> InvalidParameterException          -> employee.faceReference bad + ONE faceBadReference alert
Rosa clocks in 5 more times   -> flag + same photoUrl               -> skipped, $0, no new alerts
Admin uploads a real pfp      -> DetectFaces: 1 face                -> flag cleared, alert resolved, checks resume
Employee has no pfp           -> (no AWS call)                       -> nothing
AWS throttled                 -> ThrottlingException                 -> logger.warn only
```

### 6.4 Firestore rules
- Clients can NEVER write `faceCheck` on clockEvents (create or update). Only the Admin SDK writes it.
- Clients can NEVER write `faceReference` on employees. Admin SDK only.
- Clients CAN read `faceCheck` (admins/supervisors within their company, same as clock events today).
- Company `faceVerification` setting: admin/owner write only, same as other settings.

### 6.5 Alerts (`alerts.ts`)
Three new alert types. Add each to `ALERT_TYPES`, `ALERT_SEVERITY`, `ALERT_ID_PREFIX`, and a toggle in `ALERT_SETTINGS_DEFAULTS` (default **true** - they only fire when the feature is enabled).

| type | scope / id | actions | clears when |
|---|---|---|---|
| faceMismatch | per clock event | Confirmed it's them / Ignore | an action is taken |
| faceNoFace | per clock event | Confirmed it's them / Ignore | an action is taken |
| faceBadReference | **one per employee** (id = prefix + employeeId, so it can't duplicate) | Update photo (opens employee modal). NO Ignore. | auto-resolves when the pfp check passes or the pfp is removed |

- faceMismatch / faceNoFace payload: eventId, employeeId, employeeName, type (in/out), similarity, clock photoUrl, reference photoUrl. The card shows the reference pfp and the clock photo **side by side** plus the score.
- faceBadReference payload: employeeId, employeeName, photoUrl, reason. Text: "<name>'s profile photo has no usable face. Face verification is paused for them until it's updated."
- Follow the existing alertActions pattern for actions.

### 6.6 Reassign edge case
`reassignClockEvent` changes employeeId, so the existing faceCheck compared the WRONG person. On reassign, delete `faceCheck` (FieldValue.delete()) so the trigger re-runs against the new employee. This only works with the onDocumentWritten trigger; if using onCreate, call `checkFaceMatch()` directly after reassign instead.

### 6.7 Web UI
- **Settings:** a "Face verification" toggle in the Pro section. Core companies see it disabled with an upgrade hint. Short description: compares clock photos to the employee profile photo and flags mismatches; never blocks clock-ins.
- **Time tracking / event log:** a small faceCheck badge per event: Match 96% (green) / Mismatch 38% (red) / No face (red). No badge when faceCheck is absent.
- **Employee page/modal:** if `faceReference.status === "bad"`, show a warning on the photo: "No usable face - face verification paused until replaced".
- **Alerts panel:** faceMismatch card per 6.5.

## 7. Do NOT
- Use Collections, IndexFaces, SearchFacesByImage, DeleteFaces, or S3.
- Widen the IAM policy.
- Call AWS from the client, Next.js API routes, or anything under components/.
- Block or reject a clock event because of the face result.
- Alert on AWS/system failures.
- Call AWS for employees with no pfp or a flagged bad pfp.
- Store image bytes, embeddings, or face data in Firestore. Only the FaceCheck summary.
- Put secrets anywhere except Firebase secrets / `.secret.local`.
- Show any face verification UI to Core customers beyond the disabled upgrade toggle.

## 8. Test plan
1. Emulator with `.secret.local`: clock in as yourself -> `match`, expect high 90s, no alert.
2. Use your PIN with someone else's face -> `mismatch` + faceMismatch alert with side-by-side photos.
3. Photo of a wall -> `noFace` + faceNoFace alert.
4. Employee with no pfp -> nothing written, logs show no AWS call.
5. Set a pfp with no face (logo/dog) -> faceReference bad + ONE faceBadReference alert immediately (DetectFaces on pfp change).
6. Clock in 3x with that bad pfp -> no AWS calls, no new alerts.
7. Replace with a real pfp -> flag cleared, alert auto-resolved, next clock-in gets checked.
8. Group photo as pfp -> flagged multipleFaces.
9. Feature toggle off -> nothing written at all.
10. Core company with the toggle forced on in the DB -> still skipped.
11. Offline clock-in where the photo uploads late -> faceCheck still written.
12. Reassign an event -> faceCheck recomputed for the new employee.
13. Client write to faceCheck or faceReference -> rules reject it.
14. Clock out -> also checked.
15. Break AWS creds in .secret.local -> logger.warn only, no alert, nothing written.

## 9. Deploy
- `cd functions; npm run build` must pass clean.
- Deploy functions + rules. Confirm the function has access to both secrets (deploy output / logs).
- Watch logs for the first real check before enabling for any customer.

## 10. Open items (not v1 code, but must be resolved before selling this)
- **Consent:** BIPA-style laws want per-employee written consent, and they can reach the vendor too. A company-level checkbox may not be enough. Get legal review before enabling for Illinois customers.
- **Retention:** clock photos have no lifecycle/deletion schedule. Needed once they're face-matched.
- **Leaked key:** confirm the original access key (ending ...FLK) is DELETED in AWS and secret versions @1 are destroyed.
- **Threshold:** tune 90 after real-world scores come in.
- **AWS budget alert:** set $10/mo in AWS Budgets (also earns $20 credit).
