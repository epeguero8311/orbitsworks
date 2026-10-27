import { useEffect, useState } from "react";
import { fetchHomeSite } from "../employeeClockApi";

// Employee App Home top right while clocked out: where the next clock-in
// would land, from the server (getEmployeeHomeSite - same rule as the
// punch). Re-asked whenever refreshKey changes (e.g. after each punch).
// Blank ("") on any failure or no signal.
export function useEmployeeHomeSite(enabled, refreshKey) {
  const [siteName, setSiteName] = useState("");

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    fetchHomeSite().then((site) => {
      if (!cancelled) setSiteName(site && site.siteName ? site.siteName : "");
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return enabled ? siteName : "";
}
