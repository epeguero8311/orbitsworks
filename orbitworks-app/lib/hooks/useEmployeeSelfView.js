import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// Employee App: live copy of the employee's own record WITHOUT the PIN
// (companies/{companyId}/employeeSelfViews/{employeeId}, server-written).
// The employee doc itself is never read by an employee login.
// -> { view, loading }
export function useEmployeeSelfView(companyId, employeeId) {
  const [state, setState] = useState({ view: null, loading: true });

  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    const ref = doc(db, "companies", companyId, "employeeSelfViews", employeeId);
    return onSnapshot(
      ref,
      (snap) => setState({ view: snap.exists() ? snap.data() : null, loading: false }),
      () => setState((prev) => ({ ...prev, loading: false }))
    );
  }, [companyId, employeeId]);

  return state;
}
