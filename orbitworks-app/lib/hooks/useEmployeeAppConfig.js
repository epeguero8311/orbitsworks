import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { readHomeCache, writeHomeCache } from "../employeeHomeCache";

const DEFAULTS = {
  companyName: "",
  timezone: "America/Chicago",
  breaks: { automaticBreakMinutes: 0, minimumShiftHours: 0 },
};

function toConfig(data) {
  return {
    companyName: typeof data.name === "string" ? data.name : "",
    timezone: typeof data.timezone === "string" && data.timezone ? data.timezone : DEFAULTS.timezone,
    breaks: { ...DEFAULTS.breaks, ...(data.breaks || {}) },
  };
}

// Employee App: the company settings the app needs (name, timezone, auto break),
// from the server-written companies/{companyId}/employeeAppConfig/current.
// Employee logins can't read the company doc itself. Offline start: the
// last copy saved on the phone (lib/employeeHomeCache.js).
export function useEmployeeAppConfig(companyId) {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    if (!companyId) return undefined;
    let live = false;
    let cancelled = false;
    readHomeCache("config", companyId, null).then((saved) => {
      if (!cancelled && !live && saved) setConfig(toConfig(saved));
    });
    const ref = doc(db, "companies", companyId, "employeeAppConfig", "current");
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.fromCache && !snap.exists()) return;
        live = true;
        const data = snap.exists() ? snap.data() : {};
        setConfig(toConfig(data));
        if (!snap.metadata.fromCache) {
          writeHomeCache("config", companyId, null, { name: data.name, timezone: data.timezone, breaks: data.breaks || {} });
        }
      },
      () => {}
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [companyId]);

  return config;
}
