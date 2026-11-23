"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ClockEvent } from "@/lib/types";

// Live-listens to one calendar day's clock events (browser-local day, as
// before - company-time day edges are a Phase 10 item).
// Phase 9 (H10 a): also loads the day before and the day after, ONLY so a
// shift that crosses midnight pairs with its other half in the detail
// window (findSession) - a clock-in at 10 PM is no longer "Still clocked
// in", and the 2 AM clock-out finds its clock-in. The table still shows
// only the picked day (events). Range filter + orderBy on the same field
// (timestamp): no composite index. State is set only in the listener
// callbacks (no setState in the effect body).
// -> { events (the day), pairingEvents (day before -> day after), loading, error }
type Loaded = { key: string; all: ClockEvent[]; error: string };

function dayBounds(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59`);
  const before = new Date(start);
  before.setDate(before.getDate() - 1);
  const after = new Date(end);
  after.setDate(after.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime(), before, after };
}

export function useClockEventsByDay(companyId: string | undefined, dateStr: string) {
  const key = `${companyId ?? ""}|${dateStr}`;
  const [loaded, setLoaded] = useState<Loaded>({ key: "", all: [], error: "" });

  useEffect(() => {
    if (!companyId || !dateStr) return;
    const { before, after } = dayBounds(dateStr);
    const q = query(
      collection(db, "companies", companyId, "clockEvents"),
      where("timestamp", ">=", Timestamp.fromDate(before)),
      where("timestamp", "<=", Timestamp.fromDate(after)),
      orderBy("timestamp", "desc")
    );
    const myKey = `${companyId}|${dateStr}`;
    return onSnapshot(
      q,
      (snapshot) => {
        const all = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClockEvent, "id">) }));
        setLoaded({ key: myKey, all, error: "" });
      },
      (err) => {
        console.error("Clock events by day listener error:", err);
        setLoaded({ key: myKey, all: [], error: "Couldn't load clock events for this day." });
      }
    );
  }, [companyId, dateStr]);

  return useMemo(() => {
    const current = loaded.key === key ? loaded : { key, all: [], error: "" };
    const { startMs, endMs } = dayBounds(dateStr);
    const events = current.all.filter((e) => {
      const ms = e.timestamp ? e.timestamp.toMillis() : null;
      return ms !== null && ms >= startMs && ms <= endMs;
    });
    return { events, pairingEvents: current.all, loading: loaded.key !== key, error: current.error };
  }, [loaded, key, dateStr]);
}
