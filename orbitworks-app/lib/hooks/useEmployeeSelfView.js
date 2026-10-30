import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { readHomeCache, writeHomeCache } from "../employeeHomeCache";

// Employee App: live copy of the employee's own record WITHOUT the PIN
// (companies/{companyId}/employeeSelfViews/{employeeId}, server-written).
// The employee doc itself is never read by an employee login.
// Offline start: the last copy saved on the phone shows until the server
// answers (lib/employeeHomeCache.js).
// -> { view, loading }
export function useEmployeeSelfView(companyId, employeeId) {
  const [state, setState] = useState({ view: null, loading: true });

  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    let live = false;
    let cancelled = false;
    readHomeCache("selfView", companyId, employeeId).then((saved) => {
      if (!cancelled && !live && saved) setState({ view: saved.view, loading: false });
    });
    const ref = doc(db, "companies", companyId, "employeeSelfViews", employeeId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        // Offline with nothing in memory: keep the saved copy.
        if (snap.metadata.fromCache && !snap.exists()) {
          setState((prev) => ({ ...prev, loading: false }));
          return;
        }
        live = true;
        const view = snap.exists() ? snap.data() : null;
        setState({ view, loading: false });
        if (!snap.metadata.fromCache) writeHomeCache("selfView", companyId, employeeId, { view });
      },
      () => setState((prev) => ({ ...prev, loading: false }))
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [companyId, employeeId]);

  return state;
}
