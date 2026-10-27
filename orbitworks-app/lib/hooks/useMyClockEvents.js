import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { weekQueryStartMs } from "../employeeHome";

const RECENT_LIMIT = 30;

function toEvents(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Employee App: the employee's OWN clock events, live (firestore.rules only
// lets an employee query where employeeId == their own id).
//   recent - the latest events, for status, timers and the shift site
//   week   - events since this week's Monday, for the hours summary
// weekAnchorKey changes once a day so the week query moves on Monday.
export function useMyClockEvents(companyId, employeeId, timeZone, weekAnchorKey) {
  const [recent, setRecent] = useState({ events: [], loaded: false });
  const [week, setWeek] = useState([]);

  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    const q = query(
      collection(db, "companies", companyId, "clockEvents"),
      where("employeeId", "==", employeeId),
      orderBy("timestamp", "desc"),
      limit(RECENT_LIMIT)
    );
    return onSnapshot(
      q,
      (snap) => setRecent({ events: toEvents(snap), loaded: true }),
      () => setRecent((prev) => ({ ...prev, loaded: true }))
    );
  }, [companyId, employeeId]);

  useEffect(() => {
    if (!companyId || !employeeId || !timeZone) return undefined;
    const startMs = weekQueryStartMs(Date.now(), timeZone);
    const q = query(
      collection(db, "companies", companyId, "clockEvents"),
      where("employeeId", "==", employeeId),
      where("timestamp", ">=", Timestamp.fromMillis(startMs)),
      orderBy("timestamp", "asc")
    );
    return onSnapshot(
      q,
      (snap) => setWeek(toEvents(snap)),
      () => {}
    );
  }, [companyId, employeeId, timeZone, weekAnchorKey]);

  return { recentEvents: recent.events, loaded: recent.loaded, weekEvents: week };
}
