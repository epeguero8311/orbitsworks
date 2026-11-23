import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { checkSiteTracking } from "../siteTracking";
import { subscribeTrackingKick } from "../siteTrackingEvents";

// Employee App Phase 8: keeps leave tracking in step with Home's status
// (same idea as useBreakReminders). Runs after render, never awaited by a
// punch: starts tracking a shift clocked in on this phone (Pro, geofenced
// site), checks it again every time the app comes to the front (Always
// lowered, region lost after a restart, toggle off / Core, a fix), and
// stops it at clock-out. Waits until the plan is known (isPro null).
// home = deriveHomeState(...); punches = the punch queue rows.
export function useSiteTracking({ companyId, employeeId, home, isPro, punches }) {
  const status = home ? home.status : null;
  const shiftInId = home ? home.shiftInId : null;
  const shiftInMs = home ? home.shiftInMs : null;
  const siteName = home ? home.shiftSiteName : "";
  const latest = useRef(null);
  // The newest values for the check (updated after every render, before
  // the effect below reads them).
  useEffect(() => {
    const clockIn = shiftInId ? (punches || []).find((p) => p.requestId === shiftInId) : null;
    latest.current = {
      companyId,
      employeeId,
      status,
      shiftInId,
      shiftInMs,
      siteName,
      isPro,
      punches,
      clockInFix: clockIn && clockIn.location ? clockIn.location : null,
    };
  });
  const ready = !!companyId && !!employeeId && status !== null && isPro !== null;

  useEffect(() => {
    if (!ready) return undefined;
    const run = () => checkSiteTracking(latest.current).catch(() => {});
    run();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });
    const unsubKick = subscribeTrackingKick(run);
    return () => {
      sub.remove();
      unsubKick();
    };
  }, [ready, companyId, employeeId, status, shiftInId, isPro]);
}
