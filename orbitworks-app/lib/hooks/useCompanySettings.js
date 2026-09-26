import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

const DEFAULTS = {
  businessHours: { open: "08:00", close: "17:00" },
  appSettings: {
    allowSupervisorOverride: true,
  },
  attendanceRules: {
    requireOverrideReason: true,
  },
};

// Duplicated from lib/stripe/tiers.ts's isProPlan (can't import across the
// app/web package boundary) - same convention functions/src/tempClockLinks.ts
// already uses on the web side.
function isProPlan(planTier) {
  return !!planTier && planTier.startsWith("pro_");
}

export function useCompanySettings(companyId) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    const ref = doc(db, "companies", companyId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      setSettings({
        businessHours: data?.businessHours ?? DEFAULTS.businessHours,
        appSettings: {
          ...DEFAULTS.appSettings,
          ...(data?.appSettings ?? {}),
        },
        attendanceRules: {
          ...DEFAULTS.attendanceRules,
          ...(data?.attendanceRules ?? {}),
        },
      });
      setIsPro(isProPlan(data?.planTier));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return { settings, isPro, loading };
}