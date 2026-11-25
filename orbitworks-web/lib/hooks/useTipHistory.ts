"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { TipEdit } from "@/lib/types";

// Tips (Task 3): one shift's full tip history (newest first), loaded only
// when the (i) next to "Last edited by" is opened. Read-only - entries are
// written by setShiftTip only (firestore.rules: tipEdits, admin/owner read).
// `version` re-fetches after a save while the list is open.
export function useTipHistory(clockInEventId: string, open: boolean, version: number) {
  const { userData } = useAuth();
  const companyId = userData?.companyId;
  // The last finished fetch, tagged with what it was for - "loading" is
  // simply "open, but the result on hand isn't for the current request".
  const requestKey = `${companyId}/${clockInEventId}/${version}`;
  const [result, setResult] = useState<{ key: string; edits: TipEdit[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    getDocs(
      query(
        collection(db, "companies", companyId, "timesheetApprovals", clockInEventId, "tipEdits"),
        orderBy("editedAt", "desc")
      )
    )
      .then((snap) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          edits: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TipEdit, "id">) })),
          error: null,
        });
      })
      .catch((err) => {
        console.error("Failed to load tip history:", err);
        if (!cancelled) setResult({ key: requestKey, edits: [], error: "Couldn't load the tip history." });
      });
    return () => {
      cancelled = true;
    };
  }, [open, companyId, clockInEventId, requestKey]);

  return {
    edits: result?.edits ?? [],
    loading: open && result?.key !== requestKey,
    error: result?.key === requestKey ? result.error : null,
  };
}
