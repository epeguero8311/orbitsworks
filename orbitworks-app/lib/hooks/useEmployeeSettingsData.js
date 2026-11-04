import { useMemo } from "react";
import * as Updates from "expo-updates";
import { buildSettingsInfo } from "../employeeSettings";
import { useEmployeeAppConfig } from "./useEmployeeAppConfig";
import { useEmployeeSelfView } from "./useEmployeeSelfView";
import { useMyJobSites } from "./useMyJobSites";

// Employee App Phase 5: the Settings tab's view-only rows - photo, name,
// email, birthday ("Not set" when missing), company, subcontractor ("None"),
// job site and the Update line. Rules in lib/employeeSettings.js. Works
// offline from the copies saved on the phone (self view, config, job sites).
// -> { info, loading }
export function useEmployeeSettingsData(companyId, employeeId) {
  const { view, loading } = useEmployeeSelfView(companyId, employeeId);
  const { companyName } = useEmployeeAppConfig(companyId);
  const { sites } = useMyJobSites(companyId, employeeId, view?.assignedSiteIds);

  const info = useMemo(
    () =>
      buildSettingsInfo({
        view,
        companyName,
        sites,
        // Fixed for this app run: the bundle that is running now.
        update: { updateId: Updates.updateId ?? null, isEmbeddedLaunch: Updates.isEmbeddedLaunch === true },
      }),
    [view, companyName, sites]
  );

  return { info, loading };
}
