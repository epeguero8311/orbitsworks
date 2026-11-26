"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { fetchShiftData, SERVER_REFRESH_MS } from "@/lib/shiftData";
import { ClockEvent } from "@/lib/types";
import { eventsInDay, toClockEvents } from "@/lib/clockEventDocs";

// Live-listens to one calendar day's clock events (browser-local day, as
// before - company-time day edges are a Phase 10 item).
// Phase 9 (H10 a): also loads the day before and the day after, ONLY so a
// shift that crosses midnight pairs with its other half in the detail
// window (findSession) - a clock-in at 10 PM is no longer "Still clocked
// in", and the 2 AM clock-out finds its clock-in. The table still shows
// only the picked day (events). Range filter + orderBy on the same field
// (timestamp): no composite index. State is set only in the listener
// callbacks (no setState in the effect body).
// Bug 11/26: only the LATEST server response is applied (a slow older one -
// e.g. the 30 s refresh overlapping the first load - never overwrites a
// newer one), and one bad doc is skipped with a console.warn instead of
// blanking the page (lib/clockEventDocs.ts).
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
  // Task 4 (D2): a restricted admin loads their sites' shifts from the server.
  const { serverReads } = useAdminAccess();
  // Request counter: a response is applied only if it is the newest request.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!companyId || !dateStr) return;
    const { before, after } = dayBounds(dateStr);
    if (serverReads) {
      const myKey = `${companyId}|${dateStr}`;
      let cancelled = false;
      const load = () => {
        const seq = ++requestSeq.current;
        const isLatest = () => !cancelled && seq === requestSeq.current;
        return fetchShiftData({ purpose: "shifts", startMs: before.getTime(), endMs: after.getTime(), want: { clockEvents: true } })
          .then((res) => {
            if (!isLatest()) return;
            setLoaded({ key: myKey, all: toClockEvents(res.clockEvents, "Time Tracking"), error: "" });
          })
          .catch((err) => {
            console.error("Clock events by day server load error:", err);
            if (isLatest()) setLoaded({ key: myKey, all: [], error: "Couldn't load clock events for this day." });
          });
      };
      load();
      const timer = setInterval(load, SERVER_REFRESH_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }
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
        setLoaded({ key: myKey, all: toClockEvents(snapshot.docs, "Time Tracking"), error: "" });
      },
      (err) => {
        console.error("Clock events by day listener error:", err);
        setLoaded({ key: myKey, all: [], error: "Couldn't load clock events for this day." });
      }
    );
  }, [companyId, dateStr, serverReads]);

  return useMemo(() => {
    const current = loaded.key === key ? loaded : { key, all: [], error: "" };
    const { startMs, endMs } = dayBounds(dateStr);
    const events = eventsInDay(current.all, startMs, endMs);
    return { events, pairingEvents: current.all, loading: loaded.key !== key, error: current.error };
  }, [loaded, key, dateStr]);
}
