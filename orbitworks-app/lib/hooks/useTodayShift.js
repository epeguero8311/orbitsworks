import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { markLaunch, noteLaunchCount } from "../launchTiming";
import {
  buildShiftStatus,
  employeesNeedingLatest,
  eventTime,
  startOfYesterday,
} from "../todayShiftStatus";

// Live employee list with each employee's current in/break/out status.
//
// Reads (all live):
//   - employees (all; active ones are listed, inactive ones only while their
//     session is still open so they can be clocked OUT)
//   - clockEvents since the start of yesterday (the window)
//   - for each listed employee with nothing in the window: their newest
//     clockEvent (employeeId + timestamp desc, limit 1)
//   - active jobSites
// Status rules and why this equals "newest event ever": todayShiftStatus.js.
// This used to read every clockEvent the company ever had (1.5k+ docs,
// ~2.6 MB on every cold start).
//
// loading stays true until every one of those has answered, so a status is
// never shown from a half-loaded set.
//
// One shared set of listeners for the whole app (TodayShiftProvider in
// App.js), started as soon as the signed-in company is known - i.e. while
// the splash is still up - instead of once per screen after it.
function useTodayShiftListeners(companyId) {
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [todayInEvents, setTodayInEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  // True when what's shown didn't come from the server (offline: Firestore
  // here is memory-only, so after a restart that means an empty list).
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setEmployees([]);
      setSites([]);
      setTodayInEvents([]);
      setLoading(false);
      setFromCache(false);
      return;
    }
    setLoading(true);

    let activeEmployees = [];
    let inactiveEmployees = [];
    let windowEvents = [];
    let employeesReady = false;
    let eventsReady = false;
    let employeesFromCache = false;
    let eventsFromCache = false;
    let stopped = false;
    // employeeId -> { type, ts } | null (no events at all). Missing = not
    // answered yet.
    const latestById = {};
    const latestUnsubs = new Map();

    const eventsRef = collection(db, "companies", companyId, "clockEvents");

    const watchLatest = (employeeId) => {
      const q = query(eventsRef, where("employeeId", "==", employeeId), orderBy("timestamp", "desc"), limit(1));
      return onSnapshot(
        q,
        (snap) => {
          const first = snap.empty ? null : snap.docs[0].data();
          const ts = first ? eventTime(first) : null;
          latestById[employeeId] = first && ts ? { type: first.type, ts } : null;
          apply();
        },
        (error) => {
          console.log("[useTodayShift] latest-event listener error:", error.code, error.message);
          latestById[employeeId] = null;
          apply();
        }
      );
    };

    const apply = () => {
      if (stopped || !employeesReady || !eventsReady) return;

      const needed = employeesNeedingLatest(activeEmployees, inactiveEmployees, windowEvents);
      const neededSet = new Set(needed);
      for (const id of needed) {
        if (!latestUnsubs.has(id)) latestUnsubs.set(id, watchLatest(id));
      }
      for (const [id, unsub] of latestUnsubs) {
        if (!neededSet.has(id)) {
          unsub();
          latestUnsubs.delete(id);
          delete latestById[id];
        }
      }
      // Wait for every newest-event answer before showing any status.
      if (!needed.every((id) => id in latestById)) return;

      const result = buildShiftStatus({ activeEmployees, inactiveEmployees, windowEvents, latestById });
      setEmployees(result.employees);
      setTodayInEvents(result.todayIns);
      setFromCache(employeesFromCache || eventsFromCache);
      setLoading(false);
      noteLaunchCount("windowEvents", windowEvents.length);
      noteLaunchCount("latestQueries", needed.length);
      markLaunch("homeData");
    };

    const employeesRef = collection(db, "companies", companyId, "employees");
    const unsubEmployees = onSnapshot(
      employeesRef,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        activeEmployees = all.filter((e) => e.active === true);
        inactiveEmployees = all.filter((e) => e.active !== true);
        employeesFromCache = snap.metadata.fromCache;
        employeesReady = true;
        apply();
      },
      (error) => {
        console.log("[useTodayShift] employees listener error:", error.code, error.message);
        employeesFromCache = true;
        employeesReady = true;
        apply();
      }
    );

    // Fixed at mount: if the app stays open past midnight the window just
    // gets a little bigger, the status stays right.
    const windowQuery = query(eventsRef, where("timestamp", ">=", Timestamp.fromDate(startOfYesterday())));
    const unsubEvents = onSnapshot(
      windowQuery,
      (snap) => {
        windowEvents = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        eventsFromCache = snap.metadata.fromCache;
        eventsReady = true;
        apply();
      },
      (error) => {
        console.log("[useTodayShift] events listener error:", error.code, error.message);
        eventsFromCache = true;
        eventsReady = true;
        apply();
      }
    );

    const sitesRef = collection(db, "companies", companyId, "jobSites");
    const sitesQuery = query(sitesRef, where("active", "==", true));
    const unsubSites = onSnapshot(
      sitesQuery,
      (snap) => {
        setSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        console.log("[useTodayShift] sites listener error:", error.code, error.message);
      }
    );

    return () => {
      stopped = true;
      unsubEmployees();
      unsubEvents();
      unsubSites();
      for (const unsub of latestUnsubs.values()) unsub();
      latestUnsubs.clear();
    };
  }, [companyId]);

  return { employees, sites, todayInEvents, loading, fromCache };
}

const EMPTY = { employees: [], sites: [], todayInEvents: [], loading: true, fromCache: false };
const TodayShiftContext = createContext(EMPTY);

export function TodayShiftProvider({ children }) {
  const { currentUser, userData } = useAuth();
  const { employees, sites, todayInEvents, loading, fromCache } = useTodayShiftListeners(
    // Supervisor/admin only - an Employee App login cannot read the whole
    // company list (rules) and never shows it.
    currentUser && userData?.role !== "employee" ? userData?.companyId : null
  );
  const value = useMemo(
    () => ({ employees, sites, todayInEvents, loading, fromCache }),
    [employees, sites, todayInEvents, loading, fromCache]
  );
  return createElement(TodayShiftContext.Provider, { value }, children);
}

// Screens keep calling useTodayShift(companyId); the data comes from the
// shared provider, which always follows the signed-in user's company.
export function useTodayShift() {
  return useContext(TodayShiftContext);
}
