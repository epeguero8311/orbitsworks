import { useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { getOrCreateDeviceId } from "../deviceId";
import { APP_PLATFORM, APP_VERSION, appVersionFields } from "../appVersionInfo";

// Task 6 (U3): once per app run per login, a supervisor / admin / owner /
// kiosk tells the server this device's app version (website Devices list).
// Employees' own phones never report (they stay out of Devices). Best
// effort: offline or an older server = nothing happens, tried next run.
const reportFn = httpsCallable(functions, "reportAppVersion", { timeout: 15000 });
const SHARED_DEVICE_ROLES = ["owner", "admin", "supervisor", "kiosk"];
const reported = new Set();

export function useReportAppVersion(uid, role) {
  useEffect(() => {
    if (!uid || !SHARED_DEVICE_ROLES.includes(role) || reported.has(uid)) return;
    if (!appVersionFields().appVersion) return;
    reported.add(uid);
    getOrCreateDeviceId()
      .then((deviceId) => reportFn({ deviceId, version: APP_VERSION, platform: APP_PLATFORM }))
      .catch(() => reported.delete(uid));
  }, [uid, role]);
}
