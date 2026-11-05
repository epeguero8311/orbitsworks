"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { SiteExit } from "@/lib/types";
import { chunkIds } from "@/lib/shiftComments";
import { groupSiteExitsByClockIn } from "@/lib/siteExits";

// Employee App Phase 8: live-listens to the "left the job site" / "tracking
// off" stretches of a set of shifts (siteExits where clockInEventId is one
// of the given clock-in ids), in batches of 30 (Firestore's "in" limit).
// Single-field filter, no composite index. Same pattern as
// useShiftCommentsByClockIn; state is set only in the listener callbacks.
// Admin/owner/supervisor read rule (firestore.rules siteExits).
// -> { exitsByClockIn: Map<clockInEventId, SiteExit[]> (oldest first), loading, error }
type Batch = { exits: SiteExit[]; ok: boolean };

export function useSiteExitsByClockIn(companyId: string | undefined, clockInEventIds: string[]) {
  const idsKey = clockInEventIds.join(",");
  const [batches, setBatches] = useState<Record<string, Batch>>({});

  useEffect(() => {
    if (!companyId || !idsKey) return;
    const exitsRef = collection(db, "companies", companyId, "siteExits");
    const unsubscribes = chunkIds(idsKey.split(",")).map((ids) => {
      const batchKey = `${companyId}|${ids.join(",")}`;
      return onSnapshot(
        query(exitsRef, where("clockInEventId", "in", ids)),
        (snapshot) => {
          const exits = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SiteExit, "id">) }));
          setBatches((prev) => ({ ...prev, [batchKey]: { exits, ok: true } }));
        },
        (err) => {
          console.error("Site exits listener error:", err);
          setBatches((prev) => ({ ...prev, [batchKey]: { exits: [], ok: false } }));
        }
      );
    });
    return () => unsubscribes.forEach((u) => u());
  }, [companyId, idsKey]);

  return useMemo(() => {
    const current = companyId && idsKey ? chunkIds(idsKey.split(",")).map((ids) => batches[`${companyId}|${ids.join(",")}`]) : [];
    return {
      exitsByClockIn: groupSiteExitsByClockIn(current.flatMap((b) => (b ? b.exits : []))),
      loading: current.some((b) => !b),
      error: current.some((b) => b && !b.ok) ? "Couldn't load job site exits." : "",
    };
  }, [batches, companyId, idsKey]);
}
