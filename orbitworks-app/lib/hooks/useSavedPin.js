import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ensureSavedPin, onSavedPinChange, readSavedPinRecord } from "../pinCheck";
import { isOnline } from "../employeeClockApi";

// Employee App Settings tab: the employee's own PIN as saved on the phone
// (lib/pinCheck.js + lib/savedPinStore.js, D1 revised 2026-11-06). Reads
// SecureStore when the tab opens and again whenever a new copy is saved
// (sign-up, sign-in, app open, reconnect, an admin changed it). If nothing
// is saved and the phone is online, it fetches once per visit to the tab
// (2026-11-11) - "fetching" is true meanwhile.
// -> { record, loaded, fetching }   record = lib/savedPin.js record or null
export function useSavedPin(companyId, employeeId) {
  const [state, setState] = useState({ record: null, loaded: false });
  const [fetching, setFetching] = useState(false);
  const triedRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (triedRef.current) return;
    triedRef.current = true;
    if (!(await isOnline())) return;
    setFetching(true);
    try {
      await ensureSavedPin(companyId, employeeId);
    } finally {
      setFetching(false);
    }
  }, [companyId, employeeId]);

  const load = useCallback(() => {
    let cancelled = false;
    readSavedPinRecord(companyId, employeeId)
      .then((record) => {
        if (cancelled) return;
        setState({ record, loaded: true });
        if (!record) fetchOnce().catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setState({ record: null, loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, employeeId, fetchOnce]);

  // Each visit to the tab reads again and may fetch once.
  const onFocus = useCallback(() => {
    triedRef.current = false;
    return load();
  }, [load]);
  useFocusEffect(onFocus);

  useEffect(() => {
    let cancel = () => {};
    const off = onSavedPinChange(() => {
      cancel();
      cancel = load();
    });
    return () => {
      cancel();
      off();
    };
  }, [load]);

  return { ...state, fetching };
}
