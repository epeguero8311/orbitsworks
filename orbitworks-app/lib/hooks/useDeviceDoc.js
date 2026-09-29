import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { getOrCreateDeviceId, setCachedDeviceName } from "../deviceId";

// Live-reads this install's own device doc (see lib/deviceId.js for how
// the id itself is chosen/persisted). Returns device: null when the doc
// doesn't exist yet (never named) - the caller shows "Not named", it
// never treats that as an error.
export function useDeviceDoc(companyId) {
  const [deviceId, setDeviceId] = useState(null);
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrCreateDeviceId().then((id) => {
      if (!cancelled) {
        setDeviceId(id);
        if (!id) {
          setError(true);
          setLoading(false);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!companyId || !deviceId) return;
    const ref = doc(db, "companies", companyId, "devices", deviceId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setDevice(data);
        setLoading(false);
        setCachedDeviceName(data?.name ?? null);
      },
      (err) => {
        console.log("Device doc listener error:", err);
        setError(true);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [companyId, deviceId]);

  return { deviceId, device, loading, error };
}
