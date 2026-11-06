import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { onSavedPinChange, readSavedPinRecord } from "../pinCheck";

// Employee App Settings tab: the employee's own PIN as saved on the phone
// (lib/pinCheck.js, D1 revised 2026-11-06). No server call here - it reads
// SecureStore when the tab opens and again whenever pinCheck.js saves a
// new copy (sign-in, app open, reconnect, an admin changed it).
// -> { record, loaded }   record = lib/savedPin.js record or null
export function useSavedPin(companyId, employeeId) {
  const [state, setState] = useState({ record: null, loaded: false });

  const load = useCallback(() => {
    let cancelled = false;
    readSavedPinRecord(companyId, employeeId)
      .then((record) => {
        if (!cancelled) setState({ record, loaded: true });
      })
      .catch(() => {
        if (!cancelled) setState({ record: null, loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, employeeId]);

  useFocusEffect(load);

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

  return state;
}
