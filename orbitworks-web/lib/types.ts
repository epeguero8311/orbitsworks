import type { Timestamp } from "firebase/firestore";

export interface JobSite {
  id: string;
  name: string;
  address?: string;
  active: boolean;
  // Set from a picked Google Places autocomplete suggestion (Pro only -
  // see AddressAutocomplete.tsx and app/api/places/details/route.ts) so
  // onClockEventCreated can compute distanceFromSiteM on each clock event.
  // Sites created before this feature, or whose address was never
  // re-picked, simply have neither field - distance just doesn't show for
  // them (see ClockEvent below).
  lat?: number;
  lng?: number;
  geocodedAddress?: string;
  // The Google Places place ID the address was picked from. Only present
  // for addresses picked via autocomplete - a legacy typed address (or one
  // that's never been re-picked) has no placeId even if it does have
  // lat/lng from the old Mapbox-based geocoding.
  placeId?: string;
  // How close a clock event's coordinates must be to count as "on site"
  // (see classifySiteProximity in lib/geo.ts). Editable via the Sites
  // geofence toggle (Pro only - see requireGeofence below); sites without
  // it set just use DEFAULT_SITE_RADIUS_METERS.
  radiusMeters?: number;
  // Admin-facing unit radiusMeters was entered/is displayed in - purely
  // for redisplay in the edit form, never used for distance math.
  radiusUnit?: "ft" | "mi";
  // Pro only. When true, address/lat/lng/radiusMeters must be set (see
  // lib/validators/site.ts) - this is Part 1 (site setup) only, no
  // clock-in enforcement reads this field yet.
  requireGeofence?: boolean;
}

export interface RateHistoryEntry {
  rate: number;
  effectiveFrom: string;
}

export interface Job {
  id: string;
  name: string;
  hourlyRate: number;
  active: boolean;
  // Ordered oldest-first. Seeded with a single entry (current hourlyRate,
  // effectiveFrom the job's creation date) the first time a rate change
  // goes through the "Effective from" prompt - jobs saved before that
  // never had a rate change and have no history until they get one.
  // Analytics resolves a past date's rate from here instead of the live
  // hourlyRate, so a raise today can't rewrite yesterday's cost.
  rateHistory?: RateHistoryEntry[];
}

export interface Subcontractor {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  active: boolean;
}

export interface SubcontractorAssignmentRecord {
  previousSubcontractorId: string | null;
  previousSubcontractorName: string | null;
  newSubcontractorId: string | null;
  newSubcontractorName: string | null;
  changedByUid: string;
  changedByName: string;
  changedAt: Timestamp;
  reason?: string;
}

// ---- Face Verification (Pro) ----
//
// Both written server-only (functions/src/rekognition.ts, Admin SDK) -
// firestore.rules denies these keys to every client write. Unrelated to
// Employee.faceStatus below, which was staged for a different (Collections/
// enrollment-based) design that was never built - this feature does its
// own 1:1 CompareFaces check per clock event instead and never reads
// faceStatus.
export type FaceCheckStatus = "match" | "mismatch" | "noFace";

export interface FaceCheck {
  status: FaceCheckStatus;
  similarity: number | null; // best score 0-100, null when noFace
  threshold: number; // cutoff used at check time (FACE_MATCH_THRESHOLD)
  referencePhotoUrl: string; // the employee pfp used for this check
  facesInTarget: number; // faces detected in the clock photo
  checkedAt: Timestamp;
}

// Set on the employee doc when their pfp has no usable face - checks are
// skipped (no AWS call) while employee.photoUrl still matches
// faceReference.photoUrl, so a bad photo only costs one AWS call until
// it's replaced.
export interface FaceReferenceState {
  status: "bad";
  photoUrl: string; // the exact pfp that was bad
  reason: string; // e.g. "noFace", "multipleFaces", "InvalidParameterException"
  flaggedAt: Timestamp;
}

export interface Employee {
  id: string;
  name: string;
  jobId?: string | null;
  jobTitle?: string;
  assignedSiteIds: string[];
  photoUrl?: string;
  hourlyRate?: number;
  phone?: string;
  dob?: string;
  isSupervisor?: boolean;
  isAdmin?: boolean;
  linkedUserId?: string;
  // Denormalized from users/{linkedUserId}.email at acceptInvite time so
  // the Edit Employee modal can always show who a supervisor/admin's
  // login belongs to without an extra read. Unset for employees who were
  // never invited (plain, or PIN-only supervisor with no login).
  email?: string;
  active: boolean;
  pin: string;
  subcontractorId?: string | null;
  subcontractorName?: string | null;
  subcontractorHistory?: SubcontractorAssignmentRecord[];
  // Denormalized by onClockEventCreated (functions/src/index.ts) so status
  // is readable without a live clockEvents query - same field the mobile
  // app uses for offline status.
  lastEventType?: "in" | "out" | "breakStart" | "breakEnd";
  // Set by createEmployee (functions/src/createEmployee.ts) when an employee
  // is created from the mobile app's Create Employee flow - unset for every
  // employee created any other way. Staged for a Collections/enrollment-
  // based face feature that was never built - Face Verification (Pro)
  // above is a different, unrelated design and never reads this field.
  faceStatus?: "not_enrolled" | "enrolled";
  // Only meaningful when jobId is unset (custom rate) - see Job.rateHistory
  // for the job-linked equivalent. Same seed-on-first-edit behavior.
  rateHistory?: RateHistoryEntry[];
  // Face Verification (Pro). Absent means "fine/unchecked" - only present
  // while the pfp currently on file has no usable face. Server-written
  // only (functions/src/rekognition.ts).
  faceReference?: FaceReferenceState;
  // Update Employee (mobile) - set by updateEmployeeProfile (functions/src/
  // updateEmployee.ts) whenever a supervisor/admin edits name/photo from the
  // app. lastUpdateId is the idempotency marker (mirrors createEmployee's
  // matching-field replay check, just keyed on the client-generated updateId
  // instead) - never read by the client beyond that replay check.
  updatedByUid?: string;
  updatedAt?: Timestamp;
  updatedByDeviceId?: string | null;
  lastUpdateId?: string;
  // ---- Employee App (self-service) ----
  // All three are server-written only (functions/src/employeeAccess.ts,
  // Admin SDK) - firestore.rules denies them to every client write,
  // including admins. appAccess is the single source of truth for "this
  // employee has an employee-app login" - the gray Employee tag is derived
  // as appAccess && !isSupervisor && !isAdmin. It stays true after a
  // promotion (same login, role changes), which is also what lets
  // setEmployeeRole demote back to the "employee" role instead of the
  // legacy "supervisor" floor. linkedUserId/email are reused as-is for the
  // login link, same as supervisors.
  appAccess?: boolean;
  // Absent means "admin" - every employee created before this feature.
  joinedVia?: EmployeeJoinedVia;
  // Set only when joinedVia is "qr" - the JoinCode doc id (= its token).
  joinCodeId?: string | null;
}

export type EmployeeJoinedVia = "admin" | "qr";

export interface Invite {
  id: string;
  email: string;
  companyId: string;
  role: "supervisor" | "admin";
  assignedSiteIds: string[];
  invitedByUid: string;
  // Set only when this invite promotes an existing employee record in
  // place (Edit Employee modal's Supervisor access toggle) rather than
  // creating a brand new one - see acceptInvite in functions/src/company.ts.
  linkExistingEmployeeId?: string;
  // The employee's existing name, snapshotted at invite time - set
  // alongside linkExistingEmployeeId only. acceptInvite in
  // functions/src/company.ts uses this as the authoritative name instead
  // of trusting whatever the invitee typed on /join. Fresh invites (no
  // linkExistingEmployeeId) never set this - the name is unknown until
  // the invitee types it in on /join, and that client-typed value is
  // trusted (there's no prior record to snapshot from).
  name?: string;
  status: "pending" | "accepted";
  emailStatus: "pending" | "sent" | "failed";
  emailSentAt?: Timestamp | null;
  emailError?: string | null;
  lastEmailAttemptAt?: Timestamp | null;
}

export interface ClockEventAdjustment {
  fieldChanged: "timestamp" | "employeeId";
  previousValue: Timestamp | string;
  newValue: Timestamp | string;
  changedByUid: string;
  changedByName: string;
  changedAt: Timestamp;
  reason?: string;
}

export interface ClockEvent {
  id: string;
  employeeId: string;
  employeeName: string;
  siteId: string | null;
  siteName: string;
  type: "in" | "out" | "breakStart" | "breakEnd";
  source:
    | "faceMatch"
    | "pin"
    | "supervisorOverride"
    | "adminManual"
    | "autoClockOut"
    | "supervisorPin"
    | "autoBreakEnd"
    | "employeeDeactivated"
    | "tempLink"
    // Employee App - an employee clocking themselves in/out/break from
    // their own phone. firestore.rules only lets the "employee" role write
    // this source, and only for its own employeeId.
    | "employeeApp";
  note?: string;
  photoUrl?: string;
  // Raw device coordinates, captured client-side (mobile app / temp link
  // page) alongside the photo - never blocks a clock event on failure.
  // undefined means this event predates the Geolocation feature (or is a
  // source that never captures location, e.g. adminManual/autoClockOut);
  // null means the feature ran but no fix was available (permission
  // denied, GPS timeout). locationAddress/distanceFromSiteM are filled in
  // once, server-side, by onClockEventCreated - never re-computed after.
  location?: { lat: number; lng: number } | string | null;
  locationAccuracyM?: number | null;
  locationAddress?: string;
  distanceFromSiteM?: number | null;
  // Geofencing (Pro) Part 3 - set once, server-side, by onClockEventCreated
  // (functions/src/clockEvents.ts), same "client never computes this"
  // pattern as distanceFromSiteM. Absent whenever the event's site wasn't
  // geofenced (or predates this feature) - Part 4's UI treats that as
  // "show nothing extra", never as a third status to render.
  geofenceStatus?: "inside" | "outside";
  // Geofencing (Pro) auto site detection - set once, server-side, by
  // onClockEventCreated whenever it overwrote this event's siteId/siteName
  // with what it actually detected (siteCorrected), or when the detected
  // site differs from the employee's own assignedSiteIds (siteMismatch,
  // clock-ins only - info-only, never blocks). Both absent for any event
  // that predates this feature, or whose company has no fenced sites.
  siteCorrected?: boolean;
  siteMismatch?: boolean;
  // True whenever auto-detection resolved this event's site at all
  // (matched or not) rather than a client-side site picker - drives the
  // "Auto-detected" tag in Time Tracking. Flips to false once an admin
  // manually assigns a site via assignSessionSite.
  siteAutoDetected?: boolean;
  authorizedById?: string;
  authorizedByName?: string;
  createdByUid?: string;
  timestamp?: Timestamp;
  adjustedTimestamp?: Timestamp;
  adjustmentHistory?: ClockEventAdjustment[];
  subcontractorId?: string | null;
  subcontractorName?: string | null;
  reason?: string;
  overrideEventId?: string;
  // Device Recognition Pro (dark-launched behind DEVICE_TRACKING_ENABLED -
  // see functions/src/clockEvents.ts). Stamped by the mobile app on every
  // faceMatch/supervisorOverride event regardless of plan (never on
  // adminManual); both are optional forever since old app versions and
  // other sources never send them. deviceNameSnapshot is the device's name
  // *at capture time* (null if the device was never named) - Time Tracking
  // shows "(was: X)" when it no longer matches the device's current name,
  // so renaming a device later never rewrites history.
  deviceId?: string;
  deviceNameSnapshot?: string | null;
  // Face Verification (Pro). Absent whenever the check didn't run at all
  // (no pfp, feature off, Core plan, or predates this feature) - never a
  // fourth status to render alongside match/mismatch/noFace. Server-
  // written only (functions/src/rekognition.ts).
  faceCheck?: FaceCheck;
  // Auto Clock-Out. Set only on the "out" (and synthetic "breakEnd", if
  // one was needed) event the scheduled sweep writes (functions/src/
  // autoClockOut.ts) - a snapshot of the Settings > Automations cap in
  // effect at the moment it fired, so a later change to that setting can
  // never retroactively change what an already-written auto clock-out
  // "used". This is also what distinguishes a NEW auto clock-out from a
  // legacy source:"autoClockOut" event written by the old, removed
  // nightly stale-session sweep (see lib/sessionWarnings.ts) - those
  // never had this field and must keep displaying exactly as before.
  autoClockOutCapHours?: number;
}

// Device Recognition Pro. Doc only exists once a supervisor/admin names the
// device - an unnamed device (deviceId seen on clock events but no doc
// here) is never created automatically (see functions/src/clockEvents.ts).
// lastSeenAt/lastUserUid are written ONLY by onClockEventCreated via the
// Admin SDK - firestore.rules denies them to every client.
export interface Device {
  id: string;
  name: string;
  platform: "ios" | "android";
  model: string;
  createdByUid: string;
  createdAt: Timestamp;
  updatedByUid?: string;
  updatedAt?: Timestamp;
  lastSeenAt?: Timestamp;
  lastUserUid?: string;
  // Freezes name for everyone, including admins, until an admin unlocks it.
  // Never blocks clock-ins - lock is a naming-integrity control only.
  locked: boolean;
  lockedByUid?: string;
  lockedAt?: Timestamp;
}

// ---- Alerts ----

export interface AlertActionRecord {
  id: string;
  alertKey: string;
  alertType:
    | "maxHours"
    | "missedClockOut"
    | "overtime"
    | "breakTooLong"
    | "clockedInOutsideGeofence"
    // Face Verification (Pro). faceBadReference has no entry here - it's
    // never ignored/resolved through this mechanism (no Ignore action at
    // all per spec), only auto-resolved server-side by deleting the alert
    // doc directly once the pfp passes again.
    | "faceMismatch"
    | "faceNoFace"
    // Update Employee (mobile) - "ignored" here is what triggers
    // onEmployeeUpdateAlertDismissed's early delete of the retained old
    // photo (functions/src/alerts.ts). No "resolved"/actionTaken path.
    | "employeeUpdated";
  employeeId: string;
  status: "ignored" | "resolved";
  // "confirmedMatch" is Face Verification (Pro)'s "Confirmed it's them" -
  // a resolve with no underlying clock event write, unlike clockOut/
  // editTime/endBreak which all create or adjust one.
  actionTaken?: "clockOut" | "editTime" | "endBreak" | "confirmedMatch";
  resolvedByUid: string;
  resolvedByName: string;
  resolvedAt: Timestamp;
  reason?: string;
}

// ---- Mobile Alerts (server-generated) ----
//
// Distinct from AlertItem (lib/dashboardOverviewUtils.ts), which is
// computed client-side on every dashboard load and never persisted. One
// of these is written once per underlying condition by the alert
// generation Cloud Function (functions/src/alerts.ts, Phase 4) - a
// deterministic id so retries/replays can't duplicate it - and read live
// by the mobile Alerts tab (and, eventually, the web dashboard). Read
// state is per-device, not per-user, so a shared login on multiple
// phones tracks "seen" independently per device: readByDeviceIds is the
// only field a client may ever update (firestore.rules), and only by
// appending its own device id.
export type MobileAlertType =
  | "lateClockIn"
  | "earlyClockOut"
  | "breakTooLong"
  | "maxHours"
  | "overtime"
  | "missedClockOut"
  | "clockedInOutsideGeofence"
  | "siteMismatch"
  // Face Verification (Pro). faceMismatch/faceNoFace are per-clock-event,
  // same as clockedInOutsideGeofence. faceBadReference is the one
  // exception to "one doc per underlying condition, kept forever": it's
  // one per employee (deterministic id has no dateKey in it, unlike every
  // other type here) and is deleted outright - not ignored/resolved via
  // alertActions - once the pfp passes DetectFaces again.
  | "faceMismatch"
  | "faceNoFace"
  | "faceBadReference"
  // Update Employee (mobile). One per update (not per employee/day, unlike
  // every type above except faceBadReference) - see employeeUpdateId below.
  // Severity is per-instance (red for a different-person photo swap, yellow
  // otherwise), not the fixed per-type value every other alert uses.
  | "employeeUpdated"
  // Auto Clock-Out. Admin/owner web Overview only - never shown in the
  // mobile Alerts tab (useAlertsFeed.js filters it out explicitly) and
  // never pushed (functions/src/autoClockOut.ts writes it directly via
  // createAlertIfNew, bypassing maybeCreateAndPush). Keyed per shift
  // (eventId = the clock-in event's id), same convention as
  // clockedInOutsideGeofence/siteMismatch above.
  | "autoClockOut";

export interface MobileAlert {
  id: string;
  companyId: string;
  alertType: MobileAlertType;
  employeeId: string | null;
  employeeName: string | null;
  siteId: string | null;
  siteName: string | null;
  message: string;
  severity: "urgent" | "warning" | "info";
  eventId: string | null;
  // Update Employee (mobile). Set only for employeeUpdated alerts - points
  // at companies/{companyId}/employeeUpdates/{employeeUpdateId}, which the
  // web dashboard resolves to render the old/new name and side-by-side
  // photos (same join pattern eventId already uses for faceMismatch).
  employeeUpdateId: string | null;
  dateKey: string;
  createdAt: Timestamp;
  occurredAt: Timestamp;
  readByDeviceIds: string[];
}

// Update Employee (mobile). One doc per employee edit, written once by
// updateEmployeeProfile (functions/src/updateEmployee.ts, Admin SDK only -
// see firestore.rules) - a durable audit record that outlives the alert it
// generated (the alert can be ignored/dismissed; this never is). oldPhotoUrl/
// newPhotoUrl are both Storage download URLs (never the same path - see
// oldPhotoPath comment), same convention as Employee.photoUrl/
// ClockEvent.photoUrl everywhere else in this codebase.
export interface EmployeeUpdate {
  id: string;
  employeeId: string;
  employeeName: string;
  changedFields: ("name" | "photo")[];
  oldName: string | null;
  newName: string | null;
  oldPhotoUrl: string | null;
  newPhotoUrl: string | null;
  // Storage object path (not a download URL) for the retained old photo -
  // used by the Admin SDK to delete the blob directly (cleanupRetainedEmployeePhotos
  // / onEmployeeUpdateAlertDismissed in functions/src/alerts.ts). Null
  // whenever changedFields doesn't include "photo".
  oldPhotoPath: string | null;
  severity: "warning" | "urgent";
  photoCompareRan: boolean;
  photoCompareSimilarity: number | null;
  updatedByUid: string;
  updatedByName: string;
  updatedByDeviceId: string | null;
  updatedByDeviceName: string | null;
  createdAt: Timestamp;
  // Both null whenever changedFields doesn't include "photo". Set together
  // at write time; retainedPhotoDeletedAt flips once the blob is actually
  // gone (either the 30-day sweep or an early dismiss) - never un-set.
  retainedPhotoExpiresAt: Timestamp | null;
  retainedPhotoDeletedAt: Timestamp | null;
}

// ---- Push Notifications ----
//
// One doc per mobile install (companies/{companyId}/pushTokens/{deviceId}),
// server-read only (the push-sending function). deviceId is a fresh
// per-install identifier the app generates for itself in Phase 6
// (expo-secure-store) - not the pro-plan Device Recognition feature,
// which doesn't exist on main.
export interface PushToken {
  deviceId: string;
  token: string;
  platform: "ios" | "android";
  notificationsEnabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---- Timesheet Approvals ----
//
// One TimesheetApproval doc per work session, keyed by the clock-in
// event's own id (companies/{companyId}/timesheetApprovals/{clockInEventId}).
// Created server-side only, by a Firestore trigger on clockEvents type=="in"
// (see functions/src/index.ts) - never directly by a client. Hours/break
// are NOT stored here; they're computed live from the paired clockEvents
// the same way useEmployeeTimesheet already does, so an edit to a clock
// event never leaves a stale approved number behind.
//
// Only sessions created going forward have one of these - historical
// clockEvents from before this feature shipped are untouched and stay
// exportable exactly as they were.
export interface Flag {
  type: "SUPERVISOR_OVERRIDE"; // extend later: FACE_MISMATCH, OUTSIDE_GEOFENCE, etc.
  severity: "info" | "warning" | "critical";
  overrideEventId: string;
  createdAt: Timestamp;
}

export interface TimesheetApproval {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  siteId: string | null;
  siteName: string;
  status: "pending" | "approved";
  approvedByUid?: string;
  approvedByName?: string;
  approvedAt?: Timestamp;
  createdAt?: Timestamp;
  flags?: Flag[];
  // Job picked on the Timesheet Approvals row for this day, saved the
  // moment the row is approved (null = the employee's default job).
  jobId?: string | null;
  jobName?: string | null;
  // Automatic Break settings in effect at the moment this session was
  // approved, snapshotted so a later change to Export Settings can never
  // retroactively change an already-approved session's hours. Undefined on
  // any doc approved before this feature shipped, or still "pending" -
  // callers treat that as 0 (no auto break), which is exactly what already-
  // approved history showed before this existed. Pending sessions ignore
  // these fields entirely and read the company's live settings instead.
  autoBreakMinutesApplied?: number;
  autoBreakMinShiftHoursApplied?: number;
}

// ---- Supervisor Overrides ----
//
// One doc per override BATCH (a supervisor can multi-select several
// employees before submitting), keyed by the overrideEventId the mobile
// app generates once, client-side, before looping its queue writes. The
// onClockEventCreated trigger upserts this doc (arrayUnion on
// employeeIds) once per ClockEvent it sees carrying that overrideEventId,
// so it stays correct regardless of write order or partial/delayed sync.
export interface OverrideEvent {
  id: string;
  companyId: string;
  siteId: string | null;
  siteName: string;
  supervisorId: string | null;
  supervisorName: string | null;
  action: "in" | "out" | "breakStart" | "breakEnd";
  reason: string;
  employeeIds: string[];
  createdAt: Timestamp;
}

// ---- Reports ----

export interface EmployeeSummary {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  totalBreakHours: number;
  sessionCount: number;
  openSessions: number;
  hourlyRate: number | null;
  estimatedPay: number | null;
  subcontractorId?: string | null;
  subcontractorName?: string | null;
}

export interface AttendanceStats {
  onTimeCount: number;
  lateCount: number;
  onTimePercent: number;
  latePercent: number;
  avgArrivalMinutes: number | null;
  avgDepartureMinutes: number | null;
}

export interface TimeTrendsPoint {
  dateLabel: string;
  avgHours: number;
}

export interface EmployeesPerDayPoint {
  date: string;
  employeeCount: number;
}

export interface JobSiteReport {
  siteId: string;
  siteName: string;
  employeeCount: number;
  avgHours: number;
  onTimePercent: number;
  totalCost: number;
}

export interface SessionRecord {
  employeeId: string;
  employeeName: string;
  siteName: string;
  clockIn: string;
  clockOut: string | null;
  hours: number | null;
  breakHours: number | null;
  clockInPhotoUrl?: string;
  clockOutPhotoUrl?: string;
  subcontractorId?: string | null;
  subcontractorName?: string | null;
  // Geofencing (Pro) Part 4 - carried over from the session's clock-in
  // event (see computePayrollAndSessions) for the Detail sheet's Geofence/
  // Reason columns. Absent under the same conditions as on ClockEvent.
  geofenceStatus?: "inside" | "outside";
  geofenceDistanceM?: number | null;
  geofenceReason?: string;
}

export interface EmployeeExportRecord {
  id: string;
  name: string;
  jobTitle: string;
  hourlyRate: number | null;
  phone: string;
  active: boolean;
  siteNames: string;
  subcontractorName?: string;
}

export interface AttendanceRecord {
  employeeId: string;
  employeeName: string;
  date: string;
  arrivalTime: string | null;
  departureTime: string | null;
  breakHours: number;
  status: "On Time" | "Late";
  subcontractorName?: string | null;
}

export interface ShiftNote {
  id: string;
  note: string;
  siteId: string | null;
  siteName: string;
  createdByUid: string;
  createdByName: string;
  timestamp?: Timestamp;
  // Employee App - set only on comments an employee leaves on one of their
  // own shifts. Supervisor/admin notes never have these (site-level notes,
  // not tied to a shift). clockEventId is the shift's clock-in event id;
  // firestore.rules checks that event belongs to the same employeeId.
  employeeId?: string;
  clockEventId?: string;
  source?: "employeeApp";
}

// ---- Employee App (self-service) ----

// Top-level joinCodes/{token} - the token in the company QR code IS the doc
// id (same pattern as tempClockLinks/{token}: the join page only ever has
// the token, never a companyId). Server-only: created, listed, edited,
// regenerated and revoked through app/api/join-codes/* (Admin SDK, see
// lib/joinCodes/server.ts) - firestore.rules denies every client read and
// write, so there is no client converter for this type. Pro only.
export interface JoinCode {
  id: string; // the token itself
  // Stable across regenerate - every token doc for the same QR shares it.
  codeId: string;
  name: string;
  companyId: string;
  siteId: string;
  // [] = in-house only; [ids] = in-house or one of these subcontractors.
  subcontractorIds: string[];
  locationRequired: boolean;
  userLimit: number | null; // null = no code limit (still capped by seats)
  expiresAt: Timestamp | null; // null = never expires
  joinedCount: number;
  // Only what's stored. Expired / Full / No seats left are computed when
  // read (computeJoinCodeStatus in lib/joinCodes/server.ts).
  status: "active" | "revoked";
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  revokedAt: Timestamp | null;
  // Set on the old doc when regenerate replaces it.
  replacedByToken: string | null;
}

// Status shown in the list. Anything other than "active" is dead.
export type JoinCodeStatus = "active" | "expired" | "revoked" | "full" | "noSeats";

// One row of GET /api/join-codes - dates as epoch millis (JSON-safe).
export interface JoinCodeListItem {
  token: string;
  codeId: string;
  name: string;
  siteId: string;
  siteName: string;
  subcontractorIds: string[];
  subcontractorNames: string[];
  locationRequired: boolean;
  userLimit: number | null;
  expiresAt: number | null;
  joinedCount: number;
  status: JoinCodeStatus;
  createdAt: number | null;
}

export interface JoinCodeListResponse {
  // Company's active employee cap (null = no cap) and seats left under it.
  activeCap: number | null;
  activeCount: number;
  seatsLeft: number | null;
  codes: JoinCodeListItem[];
}

// companies/{companyId}/employeeAlerts/{alertId} - an employee's own saved
// push notifications. Server-written only (Cloud Functions); the employee
// can read only docs whose employeeId matches their own claim, never write.
// Separate from the company-wide alerts collection (MobileAlert), which is
// supervisor/admin-only.
export interface EmployeeAlert {
  id: string;
  employeeId: string;
  alertType: string;
  message: string;
  reason: string; // why it fired, in plain words
  shiftId: string | null; // clock-in event id of the related shift
  createdAt: Timestamp;
}

// companies/{companyId}/employeeAppConfig/current - a server-maintained,
// employee-readable copy of only the company settings the employee app
// needs. Employees can't read the company doc itself (it holds billing/
// Stripe/plan fields). Rewritten by syncEmployeeAppConfig (functions/src/
// employeeAppConfig.ts) whenever any of these source fields change.
export interface EmployeeAppConfig {
  name: string | null;
  logoUrl: string | null;
  isPro: boolean;
  timezone: string;
  businessHours: { open: string; close: string };
  gracePeriodMinutes: number;
  weeklyOvertimeThreshold: number;
  breaks: {
    maxBreakWarning: boolean;
    maxBreakMinutes: number;
    automaticBreakMinutes: number;
    minimumShiftHours: number;
  };
  alerts: Record<string, boolean | number>;
  autoClockOut: { enabled: boolean; maxWorkedHours: number };
  updatedAt: Timestamp;
}

// ---- Temp Clock-In Links (Pro) ----
//
// companies/{companyId}/tempClockLinks doesn't exist - the collection is
// top-level (tempClockLinks/{token}), keyed by the token itself, since the
// public redeem page only ever has the token in its URL, never a
// companyId to scope a subcollection lookup by. Created only by
// generateTempClockLink and read/written only by redeemTempClockLink and
// revokeTempClockLink (all Admin SDK, bypass firestore.rules entirely) -
// no client ever reads this collection directly, so there's no
// clientTempClockLink read type here, only what the generate/list UI needs.

export interface TempClockLink {
  id: string; // the token itself
  companyId: string;
  siteId: string;
  siteName: string;
  createdByUid: string;
  createdByName: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  durationMinutes: 10 | 30 | 60;
  revoked: boolean;
  wrongAttemptCount?: number;
}

// ---- Analytics (Pro) ----
//
// Cost math lives in lib/siteCosts.ts, a pure module with no Firebase
// imports - these types are its input/output shapes, kept here alongside
// every other report type per project convention.

export interface SiteWeeklyCostPoint {
  weekLabel: string;
  weekStart: string;
  costBySite: Record<string, number>;
  totalCost: number;
}

export interface EmployeeSiteCost {
  employeeId: string;
  employeeName: string;
  siteId: string;
  hours: number;
  otHours: number;
  cost: number;
  otCost: number;
  isSubcontractor: boolean;
  missingRate: boolean;
  isLive: boolean;
}

export interface SiteCostReport {
  siteId: string;
  siteName: string;
  hours: number;
  cost: number;
  otHours: number;
  otCost: number;
  inHouseCost: number;
  subCost: number;
  headcount: number;
  avgHourlyRate: number | null;
}

export interface AnalyticsSummary {
  siteReports: SiteCostReport[];
  employeeSiteCosts: EmployeeSiteCost[];
  weeklyTrend: SiteWeeklyCostPoint[];
  totalLaborCost: number;
  totalHours: number;
  totalOtCost: number;
  mostExpensiveSite: { siteId: string; siteName: string; cost: number } | null;
  unapprovedHoursIncluded: number;
  employeesMissingRateCount: number;
  missingClockOutsExcluded: number;
}

// ---- Geolocation (Pro) ----
//
// Computation lives in lib/geo.ts, a pure module with no React/Firebase
// imports - these types are its input/output shapes, kept here alongside
// every other feature's types per project convention (see SiteCostReport
// etc. above).

export type AccuracyTier = "high" | "medium" | "low";

export interface AccuracyInfo {
  tier: AccuracyTier;
  label: string;
}

export type SiteProximityTier = "on" | "near" | "off" | "unknown";

export interface SiteProximityInfo {
  tier: SiteProximityTier;
  label: string;
}

// ---- Export settings (payroll rounding) ----

// 0 = off (no rounding).
export type RoundingIncrement = 0 | 5 | 15 | 30;

export interface ExportSettings {
  roundDailyMinutes: RoundingIncrement;
  roundTotalMinutes: RoundingIncrement;
  // Automatic Break: minutes deducted from EVERY shift that meets
  // minimumShiftHours, stacking with any real tracked break. 0 = off.
  automaticBreakMinutes: number;
  // Auto break only applies to shifts at least this many hours long. 0 =
  // no minimum (every shift qualifies once automaticBreakMinutes is set).
  minimumShiftHours: number;
}