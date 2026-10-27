import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

const DEFAULTS = {
  timezone: "America/Chicago",
  breaks: { automaticBreakMinutes: 0, minimumShiftHours: 0 },
};

// Employee App: the company settings the app needs (timezone, auto break),
// from the server-written companies/{companyId}/employeeAppConfig/current.
// Employee logins can't read the company doc itself.
export function useEmployeeAppConfig(companyId) {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    if (!companyId) return undefined;
    const ref = doc(db, "companies", companyId, "employeeAppConfig", "current");
    return onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setConfig({
          timezone: typeof data.timezone === "string" && data.timezone ? data.timezone : DEFAULTS.timezone,
          breaks: { ...DEFAULTS.breaks, ...(data.breaks || {}) },
        });
      },
      () => {}
    );
  }, [companyId]);

  return config;
}
