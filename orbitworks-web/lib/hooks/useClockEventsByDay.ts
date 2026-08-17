"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ClockEvent } from "@/lib/types";

// Live-listens to a single calendar day's worth of clock events.
// Range filter + orderBy on the same field (timestamp) does not
// require a composite Firestore index.
export function useClockEventsByDay(
  companyId: string | undefined,
  dateStr: string
) {
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId || !dateStr) return;
    setLoading(true);
    setError("");

    const start = Timestamp.fromDate(new Date(`${dateStr}T00:00:00`));
    const end = Timestamp.fromDate(new Date(`${dateStr}T23:59:59`));

    const eventsRef = collection(db, "companies", companyId, "clockEvents");
    const q = query(
      eventsRef,
      where("timestamp", ">=", start),
      where("timestamp", "<=", end),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEvents(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ClockEvent, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Clock events by day listener error:", err);
        setError("Couldn't load clock events for this day.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [companyId, dateStr]);

  return { events, loading, error };
}