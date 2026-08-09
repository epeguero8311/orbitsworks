import type { Timestamp } from "firebase/firestore";

export interface JobSite {
  id: string;
  name: string;
  address?: string;
  active: boolean;
}

export interface Employee {
  id: string;
  name: string;
  jobTitle?: string;
  assignedSiteIds: string[];
  photoUrl?: string;
  hourlyRate?: number;
  phone?: string;
  dob?: string;
  isSupervisor?: boolean;
  active: boolean;
  pin: string;
}

export interface Invite {
  id: string;
  email: string;
  assignedSiteIds: string[];
  status: "pending" | "accepted";
}

export interface ClockEvent {
  id: string;
  employeeId: string;
  employeeName: string;
  siteId: string | null;
  siteName: string;
  type: "in" | "out";
  source: "faceMatch" | "pin" | "supervisorOverride" | "adminManual";
  note?: string;
  photoUrl?: string;
  location?: { lat: number; lng: number } | string;
  timestamp?: Timestamp;
}

// ---- Reports ----

export interface EmployeeSummary {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  sessionCount: number;
  openSessions: number;
  hourlyRate: number | null;
  estimatedPay: number | null;
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
  clockInPhotoUrl?: string;
  clockOutPhotoUrl?: string;
}

export interface EmployeeExportRecord {
  id: string;
  name: string;
  jobTitle: string;
  hourlyRate: number | null;
  phone: string;
  active: boolean;
  siteNames: string;
}

export interface AttendanceRecord {
  employeeId: string;
  employeeName: string;
  date: string;
  arrivalTime: string | null;
  departureTime: string | null;
  status: "On Time" | "Late";
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
