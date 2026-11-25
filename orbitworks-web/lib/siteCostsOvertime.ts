// Overtime (Task 1) step 9 - Job Site Cost Analytics with the company's
// Overtime toggle ON. Pure (no Firebase). Same AnalyticsSummary shape as
// computeAnalytics (lib/siteCosts.ts), which stays the Overtime OFF path,
// unchanged - so the Analytics UI needs no change.
//
// With Overtime ON:
//  - OT comes from the shared computeOvertime (daily + weekly, company week
//    start + time zone, Automatic Break once per day, frozen OT on approved
//    shifts). The multiplier is the Overtime Pay one.
//  - Each shift's job = its Approve Hours job, else the employee's default
//    job (decision 8). Rates as of the day: the job's rateHistory, and its
//    Overtime rate history (decision 9), else rate x multiplier.
//    Subcontractors: no OT premium (decision 10).
//  - Job Site Cost (decision 7): each day's OT hours, and its OT premium,
//    are split across that day's sites by their share of the day's worked
//    hours (5h Site A + 9h Site B, 6h OT -> A 2.14h, B 3.86h). Straight
//    time stays on the site it was worked at. Pay itself stays chronological
//    (rule 6), so the totals equal the export's Est. Pay.
import type { AnalyticsSummary, EmployeeSiteCost, SiteCostReport, SiteWeeklyCostPoint } from "@/lib/types";
import { computeOvertime, overtimeDayKey, type OvertimeSettings, type OvertimeShiftInput } from "@/lib/overtime";
import { overtimeRateAsOf } from "@/lib/jobOvertimeRate";
import { rateFromHistory, type CostEvent, type CostEmployeeInfo, type CostJobInfo, type WorkerFilter } from "@/lib/siteCosts";
import type { OvertimeRateHistoryEntry } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;

export interface CostJobInfoWithOvertime extends CostJobInfo {
  overtimeRate?: number | null;
  overtimeRateHistory?: OvertimeRateHistoryEntry[];
}

export interface ComputeAnalyticsWithOvertimeParams {
  // From a day before the start of rangeStart's week (company week start)
  // through rangeEnd.
  events: CostEvent[];
  rangeStart: string;
  rangeEnd: string;
  employeesById: Map<string, CostEmployeeInfo>;
  jobsById: Map<string, CostJobInfoWithOvertime>;
  unapprovedClockInIds: Set<string>;
  // Approve Hours data per clock-in id (approved docs only for the frozen
  // fields; any status for jobId).
  jobIdByClockInId: Map<string, string | null>;
  autoBreakByClockInId: Map<string, { minutes: number; minShiftHours: number }>;
  frozenOvertimeMinutesByClockInId: Map<string, number>;
  settings: OvertimeSettings;
  nowMs: number;
  siteFilter: string | null;
  workerFilter: WorkerFilter;
}

type CostShift = {
  id: string;
  siteId: string; // "" = no site
  siteName: string;
  startMs: number;
  endMs: number | null; // null = the live shift
  breakMs: number;
};

// Same session rules as computeAnalytics' buildSessions: a superseded "in"
// (never closed, then another "in") is a missing clock-out and is dropped
// (counted in missingClockOutDays); the one still-open shift at the end is
// live and counts up to now, paused while on break.
function buildCostShifts(sorted: CostEvent[], nowMs: number, timeZone: string) {
  const shifts: CostShift[] = [];
  const missingClockOutDays: string[] = [];
  let pendingIn: CostEvent | null = null;
  let openBreakStart: number | null = null;
  let breakMs = 0;
  for (const e of sorted) {
    if (e.type === "in") {
      if (pendingIn) missingClockOutDays.push(overtimeDayKey(pendingIn.timestampMs, timeZone));
      pendingIn = e;
      openBreakStart = null;
      breakMs = 0;
    } else if (e.type === "breakStart") {
      if (pendingIn && openBreakStart === null) openBreakStart = e.timestampMs;
    } else if (e.type === "breakEnd") {
      if (openBreakStart !== null) {
        breakMs += Math.max(0, e.timestampMs - openBreakStart);
        openBreakStart = null;
      }
    } else if (e.type === "out" && pendingIn) {
      if (e.timestampMs - pendingIn.timestampMs > 0) {
        shifts.push({
          id: pendingIn.id,
          siteId: pendingIn.siteId ?? "",
          siteName: pendingIn.siteName,
          startMs: pendingIn.timestampMs,
          endMs: e.timestampMs,
          breakMs,
        });
      }
      pendingIn = null;
      openBreakStart = null;
      breakMs = 0;
    }
  }
  if (pendingIn) {
    const running = openBreakStart !== null ? Math.max(0, nowMs - openBreakStart) : 0;
    shifts.push({
      id: pendingIn.id,
      siteId: pendingIn.siteId ?? "",
      siteName: pendingIn.siteName,
      startMs: pendingIn.timestampMs,
      endMs: null,
      breakMs: breakMs + running,
    });
  }
  return { shifts, missingClockOutDays };
}

export function computeAnalyticsWithOvertime(params: ComputeAnalyticsWithOvertimeParams): AnalyticsSummary {
  const { events, rangeStart, rangeEnd, employeesById, jobsById, settings, nowMs, siteFilter, workerFilter } = params;
  const tz = settings.timeZone;

  const eventsByEmployee = new Map<string, CostEvent[]>();
  for (const e of events) {
    const list = eventsByEmployee.get(e.employeeId);
    if (list) list.push(e);
    else eventsByEmployee.set(e.employeeId, [e]);
  }

  type SiteAgg = { siteName: string; hours: number; cost: number; otHours: number; otCost: number; inHouseCost: number; subCost: number; employeeIds: Set<string> };
  const siteAgg = new Map<string, SiteAgg>();
  const employeeSiteAgg = new Map<string, EmployeeSiteCost>();
  const weeklyAgg = new Map<string, SiteWeeklyCostPoint>();
  let totalLaborCost = 0;
  let totalHours = 0;
  let totalOtCost = 0;
  let unapprovedHoursIncluded = 0;
  let missingClockOutsExcluded = 0;
  const employeesMissingRate = new Set<string>();

  for (const [employeeId, employeeEvents] of eventsByEmployee) {
    const employee = employeesById.get(employeeId);
    if (!employee) continue;
    if (workerFilter === "inHouse" && employee.isSubcontractor) continue;
    if (workerFilter === "subs" && !employee.isSubcontractor) continue;

    const sorted = [...employeeEvents].sort((a, b) => a.timestampMs - b.timestampMs);
    const employeeName = sorted[0].employeeName;
    const { shifts, missingClockOutDays } = buildCostShifts(sorted, nowMs, tz);
    missingClockOutsExcluded += missingClockOutDays.filter((d) => d >= rangeStart && d <= rangeEnd).length;

    const defaultJobId = employee.jobId && jobsById.has(employee.jobId) ? employee.jobId : null;
    const jobFor = (id: string) => {
      const approved = params.jobIdByClockInId.get(id);
      return approved && jobsById.has(approved) ? approved : defaultJobId;
    };
    const inputs: OvertimeShiftInput[] = shifts.map((s) => {
      const ab = params.autoBreakByClockInId.get(s.id);
      const frozen = params.frozenOvertimeMinutesByClockInId.get(s.id);
      return {
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        breakMs: s.breakMs,
        jobId: jobFor(s.id),
        ...(ab ? { autoBreak: { minutes: ab.minutes, minimumShiftHours: ab.minShiftHours } } : {}),
        ...(frozen !== undefined ? { frozenOvertimeMs: frozen * 60 * 1000 } : {}),
      };
    });
    const result = computeOvertime(
      inputs,
      settings,
      (jobId, day) => {
        const job = jobId ? jobsById.get(jobId) : undefined;
        if (job) {
          return {
            rate: rateFromHistory(day, job.rateHistory, job.hourlyRate),
            overtimeRate: overtimeRateAsOf(day, job.overtimeRateHistory, job.overtimeRate),
          };
        }
        return { rate: rateFromHistory(day, employee.rateHistory, employee.hourlyRate ?? null), overtimeRate: null };
      },
      { nowMs, noOvertimePremium: employee.isSubcontractor }
    );
    const siteOf = new Map(shifts.map((s) => [s.id, s]));

    for (const day of result.days) {
      if (day.dayKey < rangeStart || day.dayKey > rangeEnd) continue;
      const dayShifts = result.shifts.filter((s) => s.dayKey === day.dayKey && s.workedMs > 0);
      if (dayShifts.length === 0) continue;
      const dayWorked = dayShifts.reduce((sum, s) => sum + s.workedMs, 0);
      const dayOt = dayShifts.reduce((sum, s) => sum + s.overtimeMs, 0);
      // OT pay and the OT premium (above straight time), chronological per
      // job - then shared out by site hours.
      let dayOtPay = 0;
      let dayPremium = 0;
      for (const s of dayShifts) {
        if (s.rate === null) {
          employeesMissingRate.add(employeeId);
          continue;
        }
        dayOtPay += (s.overtimeMs / HOUR_MS) * (s.overtimeRate ?? s.rate);
        dayPremium += (s.overtimeMs / HOUR_MS) * ((s.overtimeRate ?? s.rate) - s.rate);
      }

      const bySite = new Map<string, { siteName: string; worked: number; straight: number; missingRate: boolean; isLive: boolean; unapproved: number }>();
      for (const s of dayShifts) {
        const info = siteOf.get(s.id);
        const siteKey = info?.siteId || "unassigned";
        const agg = bySite.get(siteKey) ?? { siteName: info?.siteName || "No site", worked: 0, straight: 0, missingRate: false, isLive: false, unapproved: 0 };
        agg.worked += s.workedMs;
        agg.straight += s.rate !== null ? (s.workedMs / HOUR_MS) * s.rate : 0;
        agg.missingRate = agg.missingRate || s.rate === null;
        agg.isLive = agg.isLive || s.open;
        if (params.unapprovedClockInIds.has(s.id)) agg.unapproved += s.workedMs;
        bySite.set(siteKey, agg);
      }

      for (const [siteKey, s] of bySite) {
        if (siteFilter && (siteKey === "unassigned" ? "" : siteKey) !== siteFilter) continue;
        const share = dayWorked > 0 ? s.worked / dayWorked : 0;
        const hours = s.worked / HOUR_MS;
        const otHours = (dayOt / HOUR_MS) * share;
        const otCost = dayOtPay * share;
        const cost = s.straight + dayPremium * share;
        unapprovedHoursIncluded += s.unapproved / HOUR_MS;

        const site = siteAgg.get(siteKey) ?? { siteName: s.siteName, hours: 0, cost: 0, otHours: 0, otCost: 0, inHouseCost: 0, subCost: 0, employeeIds: new Set<string>() };
        site.hours += hours;
        site.cost += cost;
        site.otHours += otHours;
        site.otCost += otCost;
        if (employee.isSubcontractor) site.subCost += cost;
        else site.inHouseCost += cost;
        site.employeeIds.add(employeeId);
        siteAgg.set(siteKey, site);

        const empKey = `${employeeId}__${siteKey}`;
        const empSite = employeeSiteAgg.get(empKey) ?? {
          employeeId,
          employeeName,
          siteId: siteKey,
          hours: 0,
          otHours: 0,
          cost: 0,
          otCost: 0,
          isSubcontractor: employee.isSubcontractor,
          missingRate: false,
          isLive: false,
        };
        empSite.hours += hours;
        empSite.otHours += otHours;
        empSite.cost += cost;
        empSite.otCost += otCost;
        empSite.missingRate = empSite.missingRate || s.missingRate;
        empSite.isLive = empSite.isLive || s.isLive;
        employeeSiteAgg.set(empKey, empSite);

        const weekLabel = new Date(day.weekKey + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const weekPoint = weeklyAgg.get(day.weekKey) ?? { weekLabel, weekStart: day.weekKey, costBySite: {}, totalCost: 0 };
        weekPoint.costBySite[siteKey] = (weekPoint.costBySite[siteKey] ?? 0) + cost;
        weekPoint.totalCost += cost;
        weeklyAgg.set(day.weekKey, weekPoint);

        totalLaborCost += cost;
        totalHours += hours;
        totalOtCost += otCost;
      }
    }
  }

  const siteReports: SiteCostReport[] = Array.from(siteAgg.entries())
    .map(([siteId, s]) => ({
      siteId,
      siteName: s.siteName,
      hours: s.hours,
      cost: s.cost,
      otHours: s.otHours,
      otCost: s.otCost,
      inHouseCost: s.inHouseCost,
      subCost: s.subCost,
      headcount: s.employeeIds.size,
      avgHourlyRate: s.hours > 0 ? s.cost / s.hours : null,
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    siteReports,
    employeeSiteCosts: Array.from(employeeSiteAgg.values()),
    weeklyTrend: Array.from(weeklyAgg.values()).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1)),
    totalLaborCost,
    totalHours,
    totalOtCost,
    mostExpensiveSite:
      siteReports.length > 0 ? { siteId: siteReports[0].siteId, siteName: siteReports[0].siteName, cost: siteReports[0].cost } : null,
    unapprovedHoursIncluded,
    employeesMissingRateCount: employeesMissingRate.size,
    missingClockOutsExcluded,
  };
}
