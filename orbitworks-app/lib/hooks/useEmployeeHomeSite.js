import { useEffect, useState } from "react";
import { fetchHomeSite } from "../employeeClockApi";
import { readHomeCache, writeHomeCache } from "../employeeHomeCache";

// Employee App: where the next clock-in would land, from the server
// (getEmployeeHomeSite - same rule as the punch). Re-asked whenever
// refreshKey changes (e.g. after each punch). No signal: the last answer
// saved on the phone - the expected site on an offline clock-in
// confirmation. Blank ("") if the phone never had one.
export function useEmployeeHomeSite(enabled, refreshKey, companyId, employeeId) {
  const [siteName, setSiteName] = useState("");

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let answered = false;
    readHomeCache("homeSite", companyId, employeeId).then((saved) => {
      if (!cancelled && !answered && saved && typeof saved.siteName === "string") setSiteName(saved.siteName);
    });
    fetchHomeSite().then((site) => {
      if (cancelled || !site) return;
      answered = true;
      const name = site.siteName ? site.siteName : "";
      setSiteName(name);
      writeHomeCache("homeSite", companyId, employeeId, { siteName: name });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey, companyId, employeeId]);

  return enabled ? siteName : "";
}
