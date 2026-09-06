import type { Timestamp } from "firebase/firestore";

export interface JobSite {
  id: string;
  name: string;
  address?: string;
  active: boolean;
}

export interface Job {
  id: string;
  name: string;
  hourlyRate: number;
  active: boolean;
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
  active: boolean;
  pin: string;
  subcontractorId?: string | null;
  subcontractorName?: string | null;
  subcontractorHistory?: SubcontractorAssignmentRecord[];
}

export interface Invite {
  id: string;
  email: string;
  assignedSiteIds: string[];
  status: "pending" | "accepted";
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
    | "autoBreakEnd";
  note?: string;
  photoUrl?: string;
  location?: { lat: number; lng: number } | string;
  authorizedById?: string;
  authorizedByName?: string;
  createdByUid?: string;
  timestamp?: Timestamp;
  adjustedTimestamp?: Timestamp;
  adjustmentHistory?: ClockEventAdjustment[];
  subcontractorId?: string | null;
  subcontractorName?: string | null;
}

// ---- Alerts ----

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
}

export interface AlertActionRecord {
  id: string;
  alertKey: string;
  alertType: "maxHours" | "missedClockOut" | "overtime" | "breakTooLong";
  employeeId: string;
  status: "ignored" | "resolved";
  actionTaken?: "clockOut" | "editTime" | "endBreak";
  resolvedByUid: string;
  resolvedByName: string;
  resolvedAt: Timestamp;
  reason?: string;
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
  weekLabel: string;
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