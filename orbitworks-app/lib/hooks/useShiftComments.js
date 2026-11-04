import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { toMs } from "../employeeHome";
import { readHomeCache, writeHomeCache } from "../employeeHomeCache";

// Employee App Phase 5: the comments on the server for one of the
// employee's own shifts (shiftNotes with this clockEventId). The query
// filters by employeeId too - firestore.rules lets an employee list only
// their own notes. Same offline pattern as useEmployeeSelfView: the last
// copy saved on the phone (for the current shift only) shows right away,
// live data replaces it ("shiftComments" in lib/employeeHomeCache.js).
// The comments still on the phone come from useCommentQueue; the screen
// merges both (shiftCommentRows). failed = the server read was refused or
// errored (the screen shows commentsLoadNotice); a later answer clears it.
// -> { notes: [{ id, note, madeAtMs, timestampMs }], loading, failed }
const NONE = { notes: [], loading: false, failed: false };

export function useShiftComments(companyId, employeeId, clockEventId) {
  const [state, setState] = useState({ notes: [], loading: true, failed: false });

  useEffect(() => {
    if (!companyId || !employeeId || !clockEventId) return undefined;
    let cancelled = false;
    let live = false;
    readHomeCache("shiftComments", companyId, employeeId).then((saved) => {
      if (!cancelled && !live && saved && saved.clockEventId === clockEventId) setState((prev) => ({ ...prev, notes: saved.notes || [], loading: false }));
    });
    const q = query(
      collection(db, "companies", companyId, "shiftNotes"),
      where("employeeId", "==", employeeId),
      where("clockEventId", "==", clockEventId)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        // Offline with nothing in memory: keep the saved copy.
        if (snap.metadata.fromCache && snap.empty) return;
        live = true;
        const notes = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            note: typeof data.note === "string" ? data.note : "",
            madeAtMs: typeof data.madeAtMs === "number" ? data.madeAtMs : null,
            timestampMs: data.timestamp ? toMs(data.timestamp) : null,
          };
        });
        setState({ notes, loading: false, failed: false });
        if (!snap.metadata.fromCache) writeHomeCache("shiftComments", companyId, employeeId, { clockEventId, notes });
      },
      (err) => {
        console.log("[useShiftComments] server read failed:", err && err.code);
        setState((prev) => ({ ...prev, loading: false, failed: true }));
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [companyId, employeeId, clockEventId]);

  return clockEventId ? state : NONE;
}
