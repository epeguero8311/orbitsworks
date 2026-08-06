import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

const DEFAULTS = {
  businessHours: { open: "08:00", close: "17:00" },
};

export function useCompanySettings(companyId) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    const ref = doc(db, "companies", companyId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      setSettings({
        businessHours: data?.businessHours ?? DEFAULTS.businessHours,
      });
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return { settings, loading };
}
