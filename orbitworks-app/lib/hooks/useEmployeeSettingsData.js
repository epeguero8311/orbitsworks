import { useMemo } from "react";
import * as Updates from "expo-updates";
import { useAuth } from "../AuthContext";
import { buildSettingsInfo } from "../employeeSettings";
import { useEmployeeAppConfig } from "./useEmployeeAppConfig";
import { useEmployeeSelfView } from "./useEmployeeSelfView";

// Employee App Phase 5: the Settings tab's view-only rows - photo, name,
// email (the one they signed in with), birthday ("Not set" when missing),
// company (the parent company) and the Update line. Phase 10 (A1): no
// subcontractor or job site rows. Rules in lib/employeeSettings.js. Works
// offline from the copies saved on the phone (self view, config).
// -> { info, loading }
export function useEmployeeSettingsData(companyId, employeeId) {
  const { currentUser } = useAuth();
  const loginEmail = currentUser?.email ?? null;
  const { view, loading } = useEmployeeSelfView(companyId, employeeId);
  const { companyName } = useEmployeeAppConfig(companyId);

  const info = useMemo(
    () =>
      buildSettingsInfo({
        view,
        companyName,
        loginEmail,
        // Fixed for this app run: the bundle that is running now.
        update: { updateId: Updates.updateId ?? null, isEmbeddedLaunch: Updates.isEmbeddedLaunch === true },
      }),
    [view, companyName, loginEmail]
  );

  return { info, loading };
}
