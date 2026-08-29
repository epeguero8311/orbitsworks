import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getDb } from "../db";
import { deriveStatus } from "../clockStatus";
import { subscribeQueueChange } from "../queueEvents";

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
       GROUP BY employeeId`
    );
    if (rows.length === 0) {
      setMerged(employees);
      return;
    }
    const overrideMap = new Map(rows.map((r) => [r.employeeId, r.type]));
    setMerged(
      employees.map((e) =>
        overrideMap.has(e.id) ? { ...e, status: deriveStatus(overrideMap.get(e.id)) } : e
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