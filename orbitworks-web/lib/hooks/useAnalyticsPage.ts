"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useSiteCosts, type WorkerFilter } from "@/lib/hooks/useSiteCosts";
import { isProPlan } from "@/lib/stripe/tiers";
import { resolvePreset, type DateRangePreset } from "@/lib/validators/dateRange";

export function useAnalyticsPage() {
  const { userData } = useAuth();
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      setPlanTier(snapshot.exists() ? snapshot.data().planTier ?? null : null);
      setPlanLoading(false);
    });
    return unsubscribe;
  }, [userData?.companyId]);

  const isPro = isProPlan(planTier);

  // Lazy initializers so "now" is read when this hook first mounts, not
  // whenever this module happened to be evaluated - a long-lived SPA
  // session that never hard-reloads must still default to the current
  // month, not whatever month was current at first import.
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [startDate, setStartDate] = useState(() => resolvePreset("thisMonth", new Date())!.start);
  const [endDate, setEndDate] = useState(() => resolvePreset("thisMonth", new Date())!.end);
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [workerFilter, setWorkerFilter] = useState<WorkerFilter>("all");

  const { loading, error, summary, comparison, sites, runAnalytics } = useSiteCosts();

  const run = useCallback(
    (p: DateRangePreset, start: string, end: string, site: string | null, worker: WorkerFilter) => {
      runAnalytics(p, start, end, site, worker);
    },
    [runAnalytics]
  );

  useEffect(() => {
    if (!isPro) return;
    run(preset, startDate, endDate, siteFilter, workerFilter);
    // Only re-runs when Pro status resolves - filter changes go through
    // their own handlers below instead of round-tripping through state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro]);

  function handlePresetChange(next: DateRangePreset) {
    setPreset(next);
    const resolved = resolvePreset(next, new Date());
    if (!resolved) return;
    setStartDate(resolved.start);
    setEndDate(resolved.end);
    run(next, resolved.start, resolved.end, siteFilter, workerFilter);
  }

  function handleCustomDateChange(field: "start" | "end", value: string) {
    setPreset("custom");
    if (field === "start") setStartDate(value);
    else setEndDate(value);
  }

  function handleApplyCustomRange() {
    run("custom", startDate, endDate, siteFilter, workerFilter);
  }

  function handleSiteFilterChange(value: string | null) {
    setSiteFilter(value);
    run(preset, startDate, endDate, value, workerFilter);
  }

  function handleWorkerFilterChange(value: WorkerFilter) {
    setWorkerFilter(value);
    run(preset, startDate, endDate, siteFilter, value);
  }

  return {
    planLoading,
    isPro,
    preset,
    startDate,
    endDate,
    siteFilter,
    workerFilter,
    sites,
    loading,
    error,
    summary,
    comparison,
    handlePresetChange,
    handleCustomDateChange,
    handleApplyCustomRange,
    handleSiteFilterChange,
    handleWorkerFilterChange,
  };
}
