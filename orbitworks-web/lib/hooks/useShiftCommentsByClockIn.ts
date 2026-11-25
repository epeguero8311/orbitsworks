"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { fetchShiftData } from "@/lib/shiftData";
import { ShiftNote } from "@/lib/types";
import { chunkIds, groupCommentsByClockIn } from "@/lib/shiftComments";

// Employee App Phase 5: live-listens to the employee comments on a set of
// shifts (shiftNotes where clockEventId is one of the given clock-in ids),
// in batches of 30 (Firestore's "in" limit). A single-field filter, so no
// composite index. Same pattern as useClockEventsByDay; state is set only
// in the listener callbacks. Admin/owner/supervisor read rule.
// -> { commentsByClockIn: Map<clockEventId, ShiftNote[]> (oldest first), loading, error }
type Batch = { notes: ShiftNote[]; ok: boolean };

export function useShiftCommentsByClockIn(companyId: string | undefined, clockEventIds: string[]) {
  const idsKey = clockEventIds.join(",");
  const [batches, setBatches] = useState<Record<string, Batch>>({});
  // Task 4 (D2): a restricted admin loads these from the server (their
  // sites' shifts only) - same batches, same output.
  const { serverReads } = useAdminAccess();

  useEffect(() => {
    if (!companyId || !idsKey) return;
    if (serverReads) {
      let cancelled = false;
      chunkIds(idsKey.split(",")).forEach((ids) => {
        const batchKey = `${companyId}|${ids.join(",")}`;
        fetchShiftData({ purpose: "shifts", clockInEventIds: ids, want: { shiftNotes: true } })
          .then((res) => {
            if (cancelled) return;
            const notes = res.shiftNotes.map((d) => ({ id: d.id, ...(d.data() as Omit<ShiftNote, "id">) }));
            setBatches((prev) => ({ ...prev, [batchKey]: { notes, ok: true } }));
          })
          .catch((err) => {
            console.error("Server load error (shiftNotes):", err);
            if (!cancelled) setBatches((prev) => ({ ...prev, [batchKey]: { notes: [], ok: false } }));
          });
      });
      return () => {
        cancelled = true;
      };
    }
    const notesRef = collection(db, "companies", companyId, "shiftNotes");
    const unsubscribes = chunkIds(idsKey.split(",")).map((ids) => {
      const batchKey = `${companyId}|${ids.join(",")}`;
      return onSnapshot(
        query(notesRef, where("clockEventId", "in", ids)),
        (snapshot) => {
          const notes = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ShiftNote, "id">) }));
          setBatches((prev) => ({ ...prev, [batchKey]: { notes, ok: true } }));
        },
        (err) => {
          console.error("Shift comments listener error:", err);
          setBatches((prev) => ({ ...prev, [batchKey]: { notes: [], ok: false } }));
        }
      );
    });
    return () => unsubscribes.forEach((u) => u());
  }, [companyId, idsKey, serverReads]);

  return useMemo(() => {
    const current = companyId && idsKey ? chunkIds(idsKey.split(",")).map((ids) => batches[`${companyId}|${ids.join(",")}`]) : [];
    return {
      commentsByClockIn: groupCommentsByClockIn(current.flatMap((b) => (b ? b.notes : []))),
      loading: current.some((b) => !b),
      error: current.some((b) => b && !b.ok) ? "Couldn't load employee comments." : "",
    };
  }, [batches, companyId, idsKey]);
}
