import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { db, COMPANY_TIMEZONE } from "./shared";

// ---- Employee App: company settings mirror ----
//
// Employee App logins can't read companies/{companyId} (it holds billing/
// Stripe/plan fields - see firestore.rules). This keeps a copy of only the
// settings the employee app needs at companies/{companyId}/employeeAppConfig/
// current, which every role in the company can read and no client can write.
//
// syncEmployeeAppConfig re-runs on EVERY company doc write, so any admin save
// on the Settings page (company name/logo, business hours, attendance rules,
// alerts, export settings/auto break, overtime threshold, Automations auto
// clock-out) is mirrored right away. Writes that don't change the mirrored
// fields (e.g. activeEmployeeCount bumps from onEmployeeWrite) are skipped.
//
// Defaults below are duplicated from lib/hooks/useCompanySettings.ts (this
// package can't import across the web boundary) - keep both in sync.

const CONFIG_DOC_ID = "current";

const DEFAULT_ALERTS: Record<string, boolean | number> = {
  maxHoursWarning: true,
  maxHoursThreshold: 8,
  overtimeWarning: true,
  missedClockOutAlert: true,
  missedClockOutMinutes: 30,
  maxBreakWarning: true,
  maxBreakMinutes: 15,
  clockedInOutsideGeofence: true,
  siteMismatchWarning: true,
  lateClockInAlert: true,
  earlyClockOutAlert: true,
};

type CompanyData = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

// Builds the mirrored config from a raw company doc. Key order is fixed (and
// alerts keys are sorted) so two projections can be compared with
// JSON.stringify.
export function buildEmployeeAppConfig(company: CompanyData) {
  const businessHours = asRecord(company.businessHours);
  const attendanceRules = asRecord(company.attendanceRules);
  const exportSettings = asRecord(company.exportSettings);
  const autoClockOut = asRecord(company.autoClockOut);

  const mergedAlerts: Record<string, unknown> = { ...DEFAULT_ALERTS, ...asRecord(company.alerts) };
  const alerts: Record<string, boolean | number> = {};
  for (const key of Object.keys(mergedAlerts).sort()) {
    const value = mergedAlerts[key];
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      alerts[key] = value;
    }
  }

  const planTier = typeof company.planTier === "string" ? company.planTier : "";

  return {
    name: typeof company.name === "string" ? company.name : null,
    logoUrl: typeof company.logoUrl === "string" ? company.logoUrl : null,
    isPro: planTier.startsWith("pro_"),
    // No per-company timezone is stored today - every server date
    // calculation uses COMPANY_TIMEZONE. A future companies.timezone field
    // is picked up automatically.
    timezone: str(company.timezone, COMPANY_TIMEZONE),
    businessHours: {
      open: str(businessHours.open, "08:00"),
      close: str(businessHours.close, "17:00"),
    },
    gracePeriodMinutes: num(attendanceRules.gracePeriodMinutes, 0),
    weeklyOvertimeThreshold: num(company.weeklyOvertimeThreshold, 40),
    breaks: {
      maxBreakWarning: bool(alerts.maxBreakWarning, true),
      maxBreakMinutes: num(alerts.maxBreakMinutes, 15),
      automaticBreakMinutes: num(exportSettings.automaticBreakMinutes, 0),
      minimumShiftHours: num(exportSettings.minimumShiftHours, 0),
    },
    alerts,
    autoClockOut: {
      enabled: bool(autoClockOut.enabled, false),
      maxWorkedHours: num(autoClockOut.maxWorkedHours, 12),
    },
  };
}

function configRef(companyId: string) {
  return db.collection("companies").doc(companyId).collection("employeeAppConfig").doc(CONFIG_DOC_ID);
}

async function writeConfig(companyId: string, company: CompanyData): Promise<void> {
  await configRef(companyId).set({
    ...buildEmployeeAppConfig(company),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export const syncEmployeeAppConfig = onDocumentWritten("companies/{companyId}", async (event) => {
  const companyId = event.params.companyId;
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();

  if (!after) {
    await configRef(companyId).delete();
    return;
  }

  if (before) {
    const unchanged =
      JSON.stringify(buildEmployeeAppConfig(before)) === JSON.stringify(buildEmployeeAppConfig(after));
    if (unchanged) return;
  }

  await writeConfig(companyId, after);
});

// One-time (idempotent, safe to re-run) seed for companies that existed
// before syncEmployeeAppConfig shipped - the trigger only writes the mirror
// on the next company save. Same admin/owner-only convention as
// backfillTotalEmployeeCount (employees.ts).
export const backfillEmployeeAppConfig = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const companySnap = await db.collection("companies").doc(callerCompanyId).get();
  if (!companySnap.exists) {
    throw new HttpsError("not-found", "Company not found.");
  }
  await writeConfig(callerCompanyId, companySnap.data() as CompanyData);
  return { success: true };
});
