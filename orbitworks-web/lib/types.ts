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
  // Only meaningful when jobId is unset (custom rate) - see Job.rateHistory
  // for the job-linked equivalent. Same seed-on-first-edit behavior.
  rateHistory?: RateHistoryEntry[];
}

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
    | "tempLink";
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
}

// ---- Alerts ----

export interface AlertActionRecord {
  id: string;
  alertKey: string;
  alertType: "maxHours" | "missedClockOut" | "overtime" | "breakTooLong" | "clockedInOutsideGeofence";
  employeeId: string;
  status: "ignored" | "resolved";
  actionTaken?: "clockOut" | "editTime" | "endBreak";
  resolvedByUid: string;
  resolvedByName: string;
  resolvedAt: Timestamp;
  reason?: string;
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