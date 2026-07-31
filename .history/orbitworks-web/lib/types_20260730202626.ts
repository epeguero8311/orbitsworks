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
  source: "faceMatch" | "supervisorOverride" | "adminManual";
  note?: string;
  timestamp?: Timestamp;
}