import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getDb } from "../db";
import { deriveStatus } from "../clockStatus";
import { withQueuedShift } from "../activeSiteFilter";
import { subscribeQueueChange } from "../queueEvents";

// A just-synced row stays authoritative for this long after its own
// clientTimestamp, so a live Firestore listener that has not caught up
// yet cannot momentarily override it back to the pre-sync status. Must
// match/exceed SYNCED_RETENTION assumptions in queueSync.js in spirit -
// this only needs to cover realistic onSnapshot round-trip time, not
// full retention.
const GRACE_MS = 30000;

export function useLocalStatusOverlay(employees) {
  const [merged, setMerged] = useState(employees);

  const refresh = useCallback(async () => {
    if (!employees || employees.length === 0) {
      setMerged(employees);
      return;
    }
    const db = await getDb();
    const rows = await db.getAllAsync(
      `SELECT employeeId, type, MAX(clientTimestamp) as latestTs
       FROM event_queue
       WHERE syncStatus IN ('pending','syncing','failed')
          OR (syncStatus IN ('synced','photoPending') AND clientTimestamp > ?)
       GROUP BY employeeId`,
      [Date.now() - GRACE_MS]
    );
    if (rows.length === 0) {
      setMerged(employees);
      return;
    }
    const overrideMap = new Map(rows.map((r) => [r.employeeId, r.type]));
    // Phase 10 (A3): the site of a clock-in still on this phone, so the
    // site filter puts an offline clock-in at its own site at once.
    const inRows = await db.getAllAsync(
      `SELECT employeeId, siteId, MAX(clientTimestamp) as latestTs
       FROM event_queue
       WHERE type = 'in' AND (syncStatus IN ('pending','syncing','failed')
          OR (syncStatus IN ('synced','photoPending') AND clientTimestamp > ?))
       GROUP BY employeeId`,
      [Date.now() - GRACE_MS]
    );
    const inSiteMap = new Map(inRows.map((r) => [r.employeeId, r.siteId ?? null]));
    setMerged(
      employees.map((e) =>
        overrideMap.has(e.id)
          ? withQueuedShift(e, {
              status: deriveStatus(overrideMap.get(e.id)),
              inSiteId: inSiteMap.has(e.id) ? inSiteMap.get(e.id) : undefined,
            })
          : e
      )
    );
  }, [employees]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Refreshes the instant any queue write happens anywhere in the app -
  // this is what makes Breaks/Override/Employee List update immediately
  // after an action instead of only on next screen focus.
  useEffect(() => {
    const unsubscribe = subscribeQueueChange(refresh);
    return unsubscribe;
  }, [refresh]);

  return merged;
}
