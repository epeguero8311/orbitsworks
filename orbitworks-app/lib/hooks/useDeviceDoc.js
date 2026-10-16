import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { getOrCreateDeviceId, getCachedDeviceName, setCachedDeviceName } from "../deviceId";

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

  // Paints the locally cached name immediately - instant, offline-safe,
  // and what clock-in itself trusts (see clockQueue.js) - before the
  // Firestore listener below has a chance to resolve. The phone's own
  // cache is the first thing shown; Firestore is the live sync on top of
  // it, not the initial source. Only ever a stopgap: the `locked` flag
  // has no local copy and never appears here, and the onSnapshot effect
  // below overwrites this the moment it resolves.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    getCachedDeviceName(companyId).then((name) => {
      if (!cancelled && name) {
        setDevice((prev) => prev ?? { name });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !deviceId) return;
    const ref = doc(db, "companies", companyId, "devices", deviceId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setDevice(data);
        setLoading(false);
        setCachedDeviceName(companyId, data?.name ?? null);
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
