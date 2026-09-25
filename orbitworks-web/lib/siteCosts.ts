// Pure cost-math module for Job Site Cost Analytics (Pro). No Firebase
// imports on purpose - callers (lib/hooks/useSiteCosts.ts today, backlog
// #6's Excel site breakdown later) own fetching Firestore data and
// converting it into the plain shapes below.
import type {
  RateHistoryEntry,
  SiteCostReport,
  EmployeeSiteCost,
  SiteWeeklyCostPoint,
  AnalyticsSummary,
} from "@/lib/types";
import { dateKey, startOfWeek } from "@/lib/reportUtils";

export interface CostEvent {
  id: string;
  employeeId: string;
  employeeName: string;
  siteId: string | null;
  siteName: string;
  type: "in" | "out" | "breakStart" | "breakEnd";
  timestampMs: number;
}

export interface CostEmployeeInfo {
  jobId: string | null;
  hourlyRate: number | null;
  rateHistory?: RateHistoryEntry[];
  isSubcontractor: boolean;
}

export interface CostJobInfo {
  hourlyRate: number;
  rateHistory?: RateHistoryEntry[];
}

export type WorkerFilter = "all" | "inHouse" | "subs";

export interface ComputeAnalyticsParams {
  // Events from the start of rangeStart's week through rangeEnd, so a
  // range starting mid-week still has the full week's hours to determine
  // overtime correctly. Any order - sorted internally per employee.
  events: CostEvent[];
  rangeStart: string; // yyyy-mm-dd, inclusive
  rangeEnd: string; // yyyy-mm-dd, inclusive
  employeesById: Map<string, CostEmployeeInfo>;
  jobsById: Map<string, CostJobInfo>;
  // Clock-in event ids of sessions excluded from Reports for lacking
  // timesheet approval (see computeExcludedEventIds in reportComputations.ts).
  // Analytics still counts these hours/cost - this set is only used to
  // tag them for the "Includes X unapproved hrs" note.
  unapprovedClockInIds: Set<string>;
  weeklyOvertimeThreshold: number; // hours
  overtimeMultiplier: number;
  nowMs: number;
  siteFilter: string | null; // siteId, or null for all sites
  workerFilter: WorkerFilter;
}

// Resolves the rate in effect on a given calendar day: a job's rate
// history takes priority over the employee's own (matches how the live
// rate is resolved elsewhere - job-linked always wins over any stale
// custom rate). Falls back to the live rate when there's no history yet
// (not edited since this feature shipped), and to the earliest known
// entry for a date older than any history.
function resolveRateAsOf(
  day: string,
  employee: CostEmployeeInfo,
  jobsById: Map<string, CostJobInfo>
): number | null {
  const job = employee.jobId ? jobsById.get(employee.jobId) : undefined;
  if (job) {
    return rateFromHistory(day, job.rateHistory, job.hourlyRate);
  }
  return rateFromHistory(day, employee.rateHistory, employee.hourlyRate ?? null);
}

function rateFromHistory(
  day: string,
  history: RateHistoryEntry[] | undefined,
  currentRate: number | null
): number | null {
  if (!history || history.length === 0) return currentRate;
  const sorted = [...history].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : 1
  );
  let applicable = sorted[0];
  for (const entry of sorted) {
    if (entry.effectiveFrom <= day) applicable = entry;
    else break;
  }
  return applicable.rate;
}

interface Session {
  employeeId: string;
  siteId: string; // "" for unassigned (siteId null on the clock event)
  siteName: string;
  inEventId: string;
  netMs: number;
  startMs: number; // clock-in effective timestamp
  day: string; // dateKey of the clock-in
  isLive: boolean;
}

// Walks one employee's chronologically-sorted events into in->out
// sessions, mirroring computePayrollAndSessions' pendingIn pattern -
// but a superseded "in" (never closed, then another "in" arrives) is a
// missing clock-out from a past shift and is dropped entirely rather
// than counted, while the one still-open "in" left at the very end (if
// any) is the current live shift and counts up to `nowMs`.
function buildSessions(
  employeeId: string,
  sortedEvents: CostEvent[],
  nowMs: number
): { sessions: Session[]; missingClockOutDays: string[] } {
  const sessions: Session[] = [];
  const missingClockOutDays: string[] = [];

  let pendingIn: CostEvent | null = null;
  let openBreakStart: CostEvent | null = null;
  let breakMs = 0;

  for (const event of sortedEvents) {
    if (event.type === "in") {
      if (pendingIn) missingClockOutDays.push(dateKey(new Date(pendingIn.timestampMs)));
      pendingIn = event;
      openBreakStart = null;
      breakMs = 0;
    } else if (event.type === "breakStart") {
      if (pendingIn && !openBreakStart) openBreakStart = event;
    } else if (event.type === "breakEnd") {
      if (openBreakStart) {
        breakMs += event.timestampMs - openBreakStart.timestampMs;
        openBreakStart = null;
      }
    } else if (event.type === "out" && pendingIn) {
      const netMs = event.timestampMs - pendingIn.timestampMs - breakMs;
      if (netMs > 0) {
        sessions.push({
          employeeId,
          siteId: pendingIn.siteId ?? "",
          siteName: pendingIn.siteName,
          inEventId: pendingIn.id,
          netMs,
          startMs: pendingIn.timestampMs,
          day: dateKey(new Date(pendingIn.timestampMs)),
          isLive: false,
        });
      }
      pendingIn = null;
      openBreakStart = null;
      breakMs = 0;
    }
  }

  if (pendingIn) {
    // Still on break right now - work paused at the break, doesn't
    // carry through to nowMs (mirrors accumulateWorkedMs).
    const endMs = openBreakStart ? openBreakStart.timestampMs : nowMs;
    const netMs = endMs - pendingIn.timestampMs - breakMs;
    if (netMs > 0) {
      sessions.push({
        employeeId,
        siteId: pendingIn.siteId ?? "",
        siteName: pendingIn.siteName,
        inEventId: pendingIn.id,
        netMs,
        startMs: pendingIn.timestampMs,
        day: dateKey(new Date(pendingIn.timestampMs)),
        isLive: true,
      });
    }
  }

  return { sessions, missingClockOutDays };
}

export function computeAnalytics(params: ComputeAnalyticsParams): AnalyticsSummary {
  const {
    events,
    rangeStart,
    rangeEnd,
    employeesById,
    jobsById,
    unapprovedClockInIds,
    weeklyOvertimeThreshold,
    overtimeMultiplier,
    nowMs,
    siteFilter,
    workerFilter,
  } = params;

  const thresholdMs = weeklyOvertimeThreshold * 60 * 60 * 1000;

  const eventsByEmployee = new Map<string, CostEvent[]>();
  for (const event of events) {
    const list = eventsByEmployee.get(event.employeeId) ?? [];
    list.push(event);
    eventsByEmployee.set(event.employeeId, list);
  }

  type SiteAgg = {
    siteName: string;
    hours: number;
    cost: number;
    otHours: number;
    otCost: number;
    inHouseCost: number;
    subCost: number;
    employeeIds: Set<string>;
  };
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
    const { sessions, missingClockOutDays } = buildSessions(employeeId, sorted, nowMs);

    missingClockOutsExcluded += missingClockOutDays.filter(
      (day) => day >= rangeStart && day <= rangeEnd
    ).length;

    const cumulativeMsByWeek = new Map<string, number>();

    for (const session of sessions) {
      const weekKey = dateKey(startOfWeek(new Date(session.startMs)));
      const soFar = cumulativeMsByWeek.get(weekKey) ?? 0;
      const regularCapMs = Math.max(thresholdMs - soFar, 0);
      const regularMs = Math.min(session.netMs, regularCapMs);
      const otMs = session.netMs - regularMs;
      cumulativeMsByWeek.set(weekKey, soFar + session.netMs);

      const inOutputRange = session.day >= rangeStart && session.day <= rangeEnd;
      if (!inOutputRange) continue;
      if (siteFilter && session.siteId !== siteFilter) continue;

      const rate = resolveRateAsOf(session.day, employee, jobsById);
      const missingRate = rate == null;
      const multiplier = employee.isSubcontractor ? 1 : overtimeMultiplier;
      const regularHours = regularMs / 3_600_000;
      const otHours = otMs / 3_600_000;
      const regularCost = rate != null ? regularHours * rate : 0;
      const otCost = rate != null ? otHours * rate * multiplier : 0;
      const sessionCost = regularCost + otCost;

      if (missingRate) employeesMissingRate.add(employeeId);
      if (unapprovedClockInIds.has(session.inEventId)) {
        unapprovedHoursIncluded += regularHours + otHours;
      }

      const siteKey = session.siteId || "unassigned";
      const site = siteAgg.get(siteKey) ?? {
        siteName: session.siteName || "No site",
        hours: 0,
        cost: 0,
        otHours: 0,
        otCost: 0,
        inHouseCost: 0,
        subCost: 0,
        employeeIds: new Set<string>(),
      };
      site.hours += regularHours + otHours;
      site.cost += sessionCost;
      site.otHours += otHours;
      site.otCost += otCost;
      if (employee.isSubcontractor) site.subCost += sessionCost;
      else site.inHouseCost += sessionCost;
      site.employeeIds.add(employeeId);
      siteAgg.set(siteKey, site);

      const empKey = `${employeeId}__${siteKey}`;
      const empSite = employeeSiteAgg.get(empKey) ?? {
        employeeId,
        employeeName: sorted[0].employeeName,
        siteId: siteKey,
        hours: 0,
        otHours: 0,
        cost: 0,
        otCost: 0,
        isSubcontractor: employee.isSubcontractor,
        missingRate: false,
        isLive: false,
      };
      empSite.hours += regularHours + otHours;
      empSite.otHours += otHours;
      empSite.cost += sessionCost;
      empSite.otCost += otCost;
      empSite.missingRate = empSite.missingRate || missingRate;
      empSite.isLive = empSite.isLive || session.isLive;
      employeeSiteAgg.set(empKey, empSite);

      const weekLabel = new Date(weekKey + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const weekPoint = weeklyAgg.get(weekKey) ?? {
        weekLabel,
        weekStart: weekKey,
        costBySite: {},
        totalCost: 0,
      };
      weekPoint.costBySite[siteKey] = (weekPoint.costBySite[siteKey] ?? 0) + sessionCost;
      weekPoint.totalCost += sessionCost;
      weeklyAgg.set(weekKey, weekPoint);

      totalLaborCost += sessionCost;
      totalHours += regularHours + otHours;
      totalOtCost += otCost;
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

  const mostExpensiveSite = siteReports.length > 0
    ? { siteId: siteReports[0].siteId, siteName: siteReports[0].siteName, cost: siteReports[0].cost }
    : null;

  const weeklyTrend = Array.from(weeklyAgg.values()).sort((a, b) =>
    a.weekStart < b.weekStart ? -1 : 1
  );

  return {
    siteReports,
    employeeSiteCosts: Array.from(employeeSiteAgg.values()),
    weeklyTrend,
    totalLaborCost,
    totalHours,
    totalOtCost,
    mostExpensiveSite,
    unapprovedHoursIncluded,
    employeesMissingRateCount: employeesMissingRate.size,
    missingClockOutsExcluded,
  };
}
