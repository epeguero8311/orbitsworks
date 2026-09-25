"use client";

import { useCallback, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { dateKey, startOfWeek, APPROVALS_CUTOVER_DATE } from "@/lib/reportUtils";
import { previousComparisonRange, percentChange, type DateRangePreset } from "@/lib/validators/dateRange";
import { computeExcludedEventIds, type EventWithDate } from "@/lib/reportComputations";
import { computeAnalytics, type CostEvent, type CostEmployeeInfo, type CostJobInfo, type WorkerFilter } from "@/lib/siteCosts";
import type { AnalyticsSummary } from "@/lib/types";

export type { WorkerFilter } from "@/lib/siteCosts";

export interface SiteOption {
  id: string;
  name: string;
}

export interface AnalyticsComparison {
  totalLaborCostChangePercent: number | null;
  totalHoursChangePercent: number | null;
  totalOtCostChangePercent: number | null;
  mostExpensiveSiteChangePercent: number | null;
}

export function useSiteCosts() {
  const { userData } = useAuth();
  const { settings } = useCompanySettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [comparison, setComparison] = useState<AnalyticsComparison | null>(null);
  const [sites, setSites] = useState<SiteOption[]>([]);

  const fetchAndCompute = useCallback(
    async (
      companyId: string,
      rangeStart: string,
      rangeEnd: string,
      siteFilter: string | null,
      workerFilter: WorkerFilter
    ) => {
      const bufferStart = dateKey(startOfWeek(new Date(rangeStart + "T00:00:00")));
      const start = new Date(bufferStart + "T00:00:00");
      const end = new Date(rangeEnd + "T23:59:59");

      const eventsRef = collection(db, "companies", companyId, "clockEvents");
      const eventsSnapshot = await getDocs(
        query(
          eventsRef,
          where("timestamp", ">=", Timestamp.fromDate(start)),
          where("timestamp", "<=", Timestamp.fromDate(end)),
          orderBy("timestamp", "asc")
        )
      );
      const eventsWithDate: EventWithDate[] = eventsSnapshot.docs.map((d) => {
        const data = d.data() as Omit<EventWithDate, "id">;
        const effectiveTimestamp = data.adjustedTimestamp ?? data.timestamp;
        return { id: d.id, ...data, timestamp: effectiveTimestamp };
      });

      const approvalsSnapshot = await getDocs(
        query(
          collection(db, "companies", companyId, "timesheetApprovals"),
          where("date", ">=", APPROVALS_CUTOVER_DATE),
          where("date", "<=", rangeEnd)
        )
      );
      const approvalStatusByClockInId = new Map<string, "pending" | "approved">();
      approvalsSnapshot.docs.forEach((d) => {
        const data = d.data() as { status?: "pending" | "approved" };
        approvalStatusByClockInId.set(d.id, data.status ?? "pending");
      });
      const unapprovedClockInIds = computeExcludedEventIds(eventsWithDate, approvalStatusByClockInId);

      const events: CostEvent[] = eventsWithDate.map((e) => ({
        id: e.id,
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        siteId: e.siteId,
        siteName: e.siteName,
        type: e.type,
        timestampMs: e.timestamp.toMillis(),
      }));

      const employeesSnapshot = await getDocs(collection(db, "companies", companyId, "employees"));
      const employeesById = new Map<string, CostEmployeeInfo>();
      employeesSnapshot.docs.forEach((d) => {
        const data = d.data() as {
          jobId?: string | null;
          hourlyRate?: number | null;
          rateHistory?: CostEmployeeInfo["rateHistory"];
          subcontractorId?: string | null;
        };
        employeesById.set(d.id, {
          jobId: data.jobId ?? null,
          hourlyRate: data.hourlyRate ?? null,
          rateHistory: data.rateHistory,
          isSubcontractor: !!data.subcontractorId,
        });
      });

      const jobsSnapshot = await getDocs(collection(db, "companies", companyId, "jobs"));
      const jobsById = new Map<string, CostJobInfo>();
      jobsSnapshot.docs.forEach((d) => {
        const data = d.data() as { hourlyRate: number; rateHistory?: CostJobInfo["rateHistory"] };
        jobsById.set(d.id, { hourlyRate: data.hourlyRate, rateHistory: data.rateHistory });
      });

      return computeAnalytics({
        events,
        rangeStart,
        rangeEnd,
        employeesById,
        jobsById,
        unapprovedClockInIds,
        weeklyOvertimeThreshold: settings.weeklyOvertimeThreshold,
        overtimeMultiplier: settings.overtimeMultiplier,
        nowMs: Date.now(),
        siteFilter,
        workerFilter,
      });
    },
    [settings.weeklyOvertimeThreshold, settings.overtimeMultiplier]
  );

  const runAnalytics = useCallback(
    async (
      preset: DateRangePreset,
      rangeStart: string,
      rangeEnd: string,
      siteFilter: string | null,
      workerFilter: WorkerFilter
    ) => {
      if (!userData?.companyId) return;
      setError("");
      setLoading(true);
      setSummary(null);
      setComparison(null);

      try {
        const sitesSnapshot = await getDocs(
          collection(db, "companies", userData.companyId, "jobSites")
        );
        setSites(
          sitesSnapshot.docs.map((d) => ({
            id: d.id,
            name: (d.data() as { name?: string }).name ?? "Unknown site",
          }))
        );

        const current = await fetchAndCompute(
          userData.companyId,
          rangeStart,
          rangeEnd,
          siteFilter,
          workerFilter
        );
        setSummary(current);

        const prevRange = previousComparisonRange(preset, rangeStart, rangeEnd, new Date());
        const previous = await fetchAndCompute(
          userData.companyId,
          prevRange.start,
          prevRange.end,
          siteFilter,
          workerFilter
        );
        setComparison({
          totalLaborCostChangePercent: percentChange(current.totalLaborCost, previous.totalLaborCost),
          totalHoursChangePercent: percentChange(current.totalHours, previous.totalHours),
          totalOtCostChangePercent: percentChange(current.totalOtCost, previous.totalOtCost),
          mostExpensiveSiteChangePercent: percentChange(
            current.mostExpensiveSite?.cost ?? 0,
            previous.siteReports.find((s) => s.siteId === current.mostExpensiveSite?.siteId)?.cost ?? 0
          ),
        });
      } catch (err) {
        console.error("Analytics generation error:", err);
        setError("Couldn't generate Analytics. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [userData?.companyId, fetchAndCompute]
  );

  return { loading, error, summary, comparison, sites, runAnalytics };
}
