"use client";

import { useCallback, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings, overtimeSettingsFrom } from "@/lib/hooks/useCompanySettings";
import type { ClockEvent, Job, TimesheetApproval } from "@/lib/types";
import { dateKey, startOfWeek } from "@/lib/reportUtils";
import { applyAutoBreak } from "@/lib/autoBreak";
import { computeOvertime, overtimeWeekKey, type OvertimeShiftInput } from "@/lib/overtime";
import { effectiveOvertimeRate } from "@/lib/reportOvertime";
import type { EmployeeHistoryOvertimeExport } from "@/lib/reportExcelUtils";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { fetchShiftData } from "@/lib/shiftData";
import { toastIfPermissionDenied } from "@/lib/permissionErrors";

export type EmployeeHistoryDayRow = {
  dateLabel: string;
  weekLabel: string;
  siteName: string;
  clockInLabel: string;
  clockOutLabel: string;
  hours: number;
  breakHours: number;
  note: string;
  adjusted: boolean;
  // Tips (Task 3): this session's tip in dollars (0 while Tips is OFF).
  tips: number;
};

export type EmployeeHistoryWeek = {
  weekLabel: string;
  hours: number;
};

export type EmployeeTimesheet = {
  employeeName: string;
  hourlyRate: number | null;
  defaultJobId: string | null;
  jobs: Job[];
  dayRows: EmployeeHistoryDayRow[];
  weeklyTotals: EmployeeHistoryWeek[];
  // Overtime (Task 1, decision 11): only with the Overtime toggle ON - the
  // Time History sheet then uses the shared overtime function. null = the
  // existing sheet, unchanged.
  overtime: EmployeeHistoryOvertimeExport | null;
  // Tips (Task 3): the company's Tips toggle at run time - ON adds the Tips
  // column to the Time History sheet.
  tipsEnabled: boolean;
};

type EventWithDate = Omit<ClockEvent, "id"> & {
  id: string;
  timestamp: Timestamp;
  wasAdjusted: boolean;
};

export function useEmployeeTimesheet() {
  const { userData } = useAuth();
  const { settings } = useCompanySettings();
  const { serverReads, can } = useAdminAccess();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runTimesheet = useCallback(
    async (
      employeeId: string,
      startDate: string,
      endDate: string
    ): Promise<EmployeeTimesheet | null> => {
      if (!userData?.companyId) return null;
      setError("");
      setLoading(true);
      try {
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T23:59:59`);
        // Overtime ON: weekly OT needs the whole week, so load from the
        // start of the week containing startDate (minus a day of margin).
        // Overtime OFF: exactly the requested range, as before.
        const otSettings = settings.overtimeEnabled ? overtimeSettingsFrom(settings) : null;
        const fetchStart = new Date(start);
        if (otSettings) {
          const weekStartKey = overtimeWeekKey(startDate, otSettings.weekStartsOn);
          const wideStart = new Date(`${weekStartKey}T00:00:00`);
          wideStart.setDate(wideStart.getDate() - 1);
          if (wideStart < fetchStart) fetchStart.setTime(wideStart.getTime());
        }
        const fetchStartKey = `${fetchStart.getFullYear()}-${String(fetchStart.getMonth() + 1).padStart(2, "0")}-${String(fetchStart.getDate()).padStart(2, "0")}`;

        const employeeSnap = await getDoc(
          doc(db, "companies", userData.companyId, "employees", employeeId)
        );
        const employeeData = employeeSnap.exists()
          ? (employeeSnap.data() as {
              name?: string;
              hourlyRate?: number | null;
              jobId?: string | null;
              subcontractorId?: string | null;
            })
          : {};

        const jobsSnapshot = await getDocs(
          collection(db, "companies", userData.companyId, "jobs")
        );
        const jobsMap = new Map<string, Job>();
        jobsSnapshot.docs.forEach((d) => {
          const data = d.data() as Omit<Job, "id">;
          jobsMap.set(d.id, { id: d.id, ...data });
        });
        const jobs = Array.from(jobsMap.values());

        const hourlyRate = employeeData.jobId
          ? jobsMap.get(employeeData.jobId)?.hourlyRate ?? null
          : employeeData.hourlyRate ?? null;

        const eventsRef = collection(db, "companies", userData.companyId, "clockEvents");
        const q = query(
          eventsRef,
          where("employeeId", "==", employeeId),
          where("timestamp", ">=", Timestamp.fromDate(fetchStart)),
          where("timestamp", "<=", Timestamp.fromDate(end)),
          orderBy("timestamp", "asc")
        );
        // Task 4 (D2/D4): a restricted admin reads it through the server -
        // every site with Export payroll (it's an export), else their sites.
        const serverData = serverReads
          ? await fetchShiftData({
              purpose: can("exportPayroll") ? "export" : "shifts",
              startMs: fetchStart.getTime(),
              endMs: end.getTime(),
              startDate: fetchStartKey,
              endDate,
              employeeId,
              want: { clockEvents: true, approvals: true },
            })
          : null;
        const snapshot = serverData
          ? {
              docs: [...serverData.clockEvents].sort(
                (a, b) =>
                  ((a.data().timestamp as Timestamp | undefined)?.toMillis() ?? 0) -
                  ((b.data().timestamp as Timestamp | undefined)?.toMillis() ?? 0)
              ),
            }
          : await getDocs(q);
        const events: EventWithDate[] = snapshot.docs.map((d) => {
          const data = d.data() as Omit<ClockEvent, "id">;
          const effective = (data.adjustedTimestamp ?? data.timestamp) as Timestamp;
          return { ...data, id: d.id, timestamp: effective, wasAdjusted: !!data.adjustedTimestamp };
        });

        // Keyed by the clock-in event id, same as timesheetApprovals doc
        // ids - lets an already-approved session here use the Auto Break
        // settings frozen at approval time instead of the company's live
        // ones, same rule the Timesheet Approvals page follows.
        const approvalsRef = collection(db, "companies", userData.companyId, "timesheetApprovals");
        const approvalsQuery = query(
          approvalsRef,
          where("employeeId", "==", employeeId),
          where("date", ">=", fetchStartKey),
          where("date", "<=", endDate)
        );
        const approvalsSnapshot = serverData ? { docs: serverData.approvals } : await getDocs(approvalsQuery);
        const approvalByClockInId = new Map<string, TimesheetApproval>();
        approvalsSnapshot.docs.forEach((d) => {
          approvalByClockInId.set(d.id, { id: d.id, ...(d.data() as Omit<TimesheetApproval, "id">) });
        });

        const dayRows: EmployeeHistoryDayRow[] = [];
        let pendingIn: EventWithDate | null = null;
        let openBreakStart: EventWithDate | null = null;
        let currentSessionBreakMs = 0;
        let sessionAdjusted = false;
        let sessionNotes: string[] = [];
        const weeklyMs = new Map<string, number>();
        // Overtime ON only: every closed session (incl. the week's earlier
        // days), with its row, for the shared overtime function.
        const otSessions: { input: OvertimeShiftInput; row: EmployeeHistoryDayRow }[] = [];

        for (const event of events) {
          if (event.note && event.type !== "in") sessionNotes.push(event.note);

          if (event.type === "in") {
            pendingIn = event;
            openBreakStart = null;
            currentSessionBreakMs = 0;
            sessionAdjusted = event.wasAdjusted;
            sessionNotes = event.note ? [event.note] : [];
          } else if (event.type === "breakStart") {
            if (pendingIn && !openBreakStart) openBreakStart = event;
          } else if (event.type === "breakEnd") {
            if (openBreakStart) {
              const ms = event.timestamp.toMillis() - openBreakStart.timestamp.toMillis();
              if (ms > 0) currentSessionBreakMs += ms;
              openBreakStart = null;
            }
          } else if (event.type === "out" && pendingIn) {
            if (event.wasAdjusted) sessionAdjusted = true;
            const durationMs = event.timestamp.toMillis() - pendingIn.timestamp.toMillis();
            if (durationMs > 0) {
              const approval = approvalByClockInId.get(pendingIn.id);
              // Same frozen-at-approval rule as the Timesheet Approvals
              // page: an approved session keeps the Auto Break settings
              // stamped on it at approval time, not the company's live ones.
              const autoBreakMinutes =
                approval?.status === "approved"
                  ? approval.autoBreakMinutesApplied ?? 0
                  : settings.exportSettings.automaticBreakMinutes;
              const minShiftHours =
                approval?.status === "approved"
                  ? approval.autoBreakMinShiftHoursApplied ?? 0
                  : settings.exportSettings.minimumShiftHours;
              const { breakMs: effectiveBreakMs, netMs } = applyAutoBreak(
                durationMs,
                currentSessionBreakMs,
                true,
                autoBreakMinutes,
                minShiftHours
              );
              const weekKey = dateKey(startOfWeek(pendingIn.timestamp.toDate()));
              weeklyMs.set(weekKey, (weeklyMs.get(weekKey) ?? 0) + netMs);

              const row: EmployeeHistoryDayRow = {
                dateLabel: pendingIn.timestamp.toDate().toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
                weekLabel: new Date(weekKey + "T00:00:00").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                }),
                siteName: pendingIn.siteName,
                clockInLabel: pendingIn.timestamp.toDate().toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                }),
                clockOutLabel: event.timestamp.toDate().toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                }),
                hours: durationMs / (1000 * 60 * 60),
                breakHours: effectiveBreakMs / (1000 * 60 * 60),
                note: sessionNotes.join("; "),
                adjusted: sessionAdjusted,
                // Same rows as the hours, so the tip follows them (D6).
                tips:
                  settings.tipsEnabled && typeof approval?.tipCents === "number" ? approval.tipCents / 100 : 0,
              };
              if (otSettings) {
                const approvedJobId = approval?.jobId && jobsMap.has(approval.jobId) ? approval.jobId : null;
                const defaultJobId = employeeData.jobId && jobsMap.has(employeeData.jobId) ? employeeData.jobId : null;
                otSessions.push({
                  input: {
                    id: pendingIn.id,
                    startMs: pendingIn.timestamp.toMillis(),
                    endMs: event.timestamp.toMillis(),
                    breakMs: currentSessionBreakMs,
                    jobId: approvedJobId ?? defaultJobId,
                    ...(approval?.status === "approved"
                      ? {
                          autoBreak: {
                            minutes: approval.autoBreakMinutesApplied ?? 0,
                            minimumShiftHours: approval.autoBreakMinShiftHoursApplied ?? 0,
                          },
                          // Rule 11: approved OT stays frozen.
                          ...(typeof approval.overtimeApplied?.overtimeMinutes === "number"
                            ? { frozenOvertimeMs: approval.overtimeApplied.overtimeMinutes * 60 * 1000 }
                            : {}),
                          // Decision 4B: rates frozen at approval.
                          ...(typeof approval.overtimeApplied?.rate === "number"
                            ? {
                                frozenRates: {
                                  rate: approval.overtimeApplied.rate,
                                  overtimeRate: approval.overtimeApplied.overtimeRate ?? null,
                                },
                              }
                            : {}),
                        }
                      : {}),
                  },
                  row,
                });
              } else {
                dayRows.push(row);
              }
            }
            pendingIn = null;
            openBreakStart = null;
            currentSessionBreakMs = 0;
            sessionAdjusted = false;
            sessionNotes = [];
          }
        }

        const weeklyTotals: EmployeeHistoryWeek[] = Array.from(weeklyMs.entries())
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([weekKey, ms]) => ({
            weekLabel: new Date(weekKey + "T00:00:00").toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
            hours: ms / (1000 * 60 * 60),
          }));

        let overtime: EmployeeHistoryOvertimeExport | null = null;
        if (otSettings) {
          const isSubcontractor = !!employeeData.subcontractorId;
          const defaultJob = employeeData.jobId ? jobsMap.get(employeeData.jobId) : undefined;
          const result = computeOvertime(
            otSessions.map((x) => x.input),
            otSettings,
            (jobId) => {
              const job = jobId ? jobsMap.get(jobId) : undefined;
              return job
                ? { rate: job.hourlyRate, overtimeRate: job.overtimeRate ?? null }
                : { rate: employeeData.hourlyRate ?? null, overtimeRate: null };
            },
            { noOvertimePremium: isSubcontractor }
          );
          const weekLabelOf = (weekKey: string) =>
            new Date(`${weekKey}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const rows: EmployeeHistoryOvertimeExport["rows"] = [];
          const weekKeys: string[] = [];
          result.shifts.forEach((r) => {
            if (r.dayKey < startDate || r.dayKey > endDate) return;
            const session = otSessions.find((x) => x.input.id === r.id);
            if (!session) return;
            if (!weekKeys.includes(r.weekKey)) weekKeys.push(r.weekKey);
            rows.push({
              ...session.row,
              weekLabel: weekLabelOf(r.weekKey),
              breakHours: r.breakMs / (1000 * 60 * 60),
              jobId: r.jobId,
              jobName: r.jobId ? jobsMap.get(r.jobId)?.name ?? null : null,
              rate: r.rate,
              overtimeHours: r.overtimeMs / (1000 * 60 * 60),
              overtimeRate: r.overtimeRate,
              ratesFrozen: session.input.frozenRates !== undefined,
            });
          });
          overtime = {
            rows,
            weekLabels: weekKeys.sort().map(weekLabelOf),
            defaultOvertimeRate: effectiveOvertimeRate(
              hourlyRate,
              defaultJob?.overtimeRate,
              otSettings.multiplier,
              isSubcontractor
            ),
            isSubcontractor,
            multiplier: otSettings.multiplier,
          };
        }

        return {
          employeeName: employeeData.name ?? "Unknown employee",
          hourlyRate,
          defaultJobId: employeeData.jobId ?? null,
          jobs,
          dayRows,
          weeklyTotals,
          overtime,
          tipsEnabled: settings.tipsEnabled,
        };
      } catch (err) {
        console.error("Employee timesheet error:", err);
        // Caught errors never reach Sentry on their own. IDs and dates only:
        // no names, wages, or other PII on the event.
        Sentry.captureException(err, {
          tags: {
            feature: "employee-timesheet-report",
            step: "load-timesheet",
            companyId: userData.companyId,
            employeeId,
            startDate,
            endDate,
            firebaseCode: (err as { code?: string })?.code ?? "none",
          },
        });
        if (!toastIfPermissionDenied(err, { action: "view this employee's timesheet" })) {
          setError("Couldn't build this employee's timesheet. Try again.");
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    // settings as a whole: the Overtime branch reads several of its fields.
    [userData, settings, serverReads, can]
  );

  return { runTimesheet, loading, error };
}