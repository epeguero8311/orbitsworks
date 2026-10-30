import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { weekQueryStartMs } from "../employeeHome";
import { eventsForCache, readHomeCache, writeHomeCache } from "../employeeHomeCache";

const RECENT_LIMIT = 30;

function toEvents(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Employee App: the employee's OWN clock events, live (firestore.rules only
// lets an employee query where employeeId == their own id).
//   recent - the latest events, for status, timers and the shift site
//   week   - events since this week's Monday, for the hours summary
// weekAnchorKey changes once a day so the week query moves on Monday.
// Offline start: the last lists saved on the phone show until the server
// answers (lib/employeeHomeCache.js). Punches still in the phone's queue
// are added on top by the screen (foldQueuedEvents).
export function useMyClockEvents(companyId, employeeId, timeZone, weekAnchorKey) {
  const [recent, setRecent] = useState({ events: [], loaded: false });
  const [week, setWeek] = useState([]);

  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    let live = false;
    let cancelled = false;
    readHomeCache("recentEvents", companyId, employeeId).then((saved) => {
      if (!cancelled && !live && Array.isArray(saved)) setRecent({ events: saved, loaded: true });
    });
    const q = query(
      collection(db, "companies", companyId, "clockEvents"),
      where("employeeId", "==", employeeId),
      orderBy("timestamp", "desc"),
      limit(RECENT_LIMIT)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (snap.metadata.fromCache && snap.empty) {
          setRecent((prev) => ({ ...prev, loaded: true }));
          return;
        }
        live = true;
        const events = toEvents(snap);
        setRecent({ events, loaded: true });
        if (!snap.metadata.fromCache) writeHomeCache("recentEvents", companyId, employeeId, eventsForCache(events));
      },
      () => setRecent((prev) => ({ ...prev, loaded: true }))
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [companyId, employeeId]);

  useEffect(() => {
    if (!companyId || !employeeId || !timeZone) return undefined;
    let live = false;
    let cancelled = false;
    // A saved list from an older week is harmless: hours only count
    // shifts that started this week.
    readHomeCache("weekEvents", companyId, employeeId).then((saved) => {
      if (!cancelled && !live && Array.isArray(saved)) setWeek(saved);
    });
    const startMs = weekQueryStartMs(Date.now(), timeZone);
    const q = query(
      collection(db, "companies", companyId, "clockEvents"),
      where("employeeId", "==", employeeId),
      where("timestamp", ">=", Timestamp.fromMillis(startMs)),
      orderBy("timestamp", "asc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (snap.metadata.fromCache && snap.empty) return;
        live = true;
        const events = toEvents(snap);
        setWeek(events);
        if (!snap.metadata.fromCache) writeHomeCache("weekEvents", companyId, employeeId, eventsForCache(events));
      },
      () => {}
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [companyId, employeeId, timeZone, weekAnchorKey]);

  return { recentEvents: recent.events, loaded: recent.loaded, weekEvents: week };
}
