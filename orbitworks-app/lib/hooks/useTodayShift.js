import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { deriveStatus } from "../clockStatus";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useTodayShift(companyId) {
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [todayInEvents, setTodayInEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Docs for inactive-but-still-open employees, fetched on demand outside
  // the active==true listener below (id -> doc data, or "pending" while
  // in flight). Deactivation should auto-close a session the moment it
  // happens, so this only ever fills in for the safety-net/backfill case.
  const inactiveOpenDocsRef = useRef({});

  useEffect(() => {
    if (!companyId) {
      setEmployees([]);
      setSites([]);
      setTodayInEvents([]);
      setLoading(false);
      return;
    }

    inactiveOpenDocsRef.current = {};

    let employeesData = [];
    let eventsData = [];
    // loading only clears once BOTH listeners have delivered their
    // first snapshot - applyStatus can fire from either one first
    // (whichever resolves faster), and computing status against a
    // still-empty employeesData/eventsData array on that first race
    // is what caused the "0 then jumps to real count" flash.
    let employeesReady = false;
    let eventsReady = false;

    const applyStatus = () => {
      const todayStart = startOfToday();
      const latestEventByEmployee = {};
      // Unlike latestEventByEmployee (today-only, used for status of
      // employees already in employeesData), this covers all time - it's
      // what lets an inactive employee whose session has been open since
      // before today still be found as "open" below.
      const latestEventAllTime = {};
      const todayIns = [];

      eventsData.forEach((evt) => {
        const ts = evt.timestamp?.toDate ? evt.timestamp.toDate() : null;
        if (!ts) return;
        if (ts >= todayStart && evt.type === "in") {
          todayIns.push({ employeeId: evt.employeeId, timestamp: ts });
        }
        const existingAll = latestEventAllTime[evt.employeeId];
        if (!existingAll || ts > existingAll.ts) {
          latestEventAllTime[evt.employeeId] = { type: evt.type, ts };
        }
        if (ts < todayStart) return;
        const existing = latestEventByEmployee[evt.employeeId];
        if (!existing || ts > existing.ts) {
          latestEventByEmployee[evt.employeeId] = { type: evt.type, ts };
        }
      });

      // A deactivated employee with a still-open session must still be
      // clockable OUT (never back in) - the active==true employees query
      // below excludes them, so they're found here instead, from the
      // clockEvents listener alone, and their doc fetched separately.
      const activeIds = new Set(employeesData.map((e) => e.id));
      const openInactiveIds = Object.keys(latestEventAllTime).filter(
        (id) => latestEventAllTime[id].type !== "out" && !activeIds.has(id)
      );

      openInactiveIds.forEach((id) => {
        if (inactiveOpenDocsRef.current[id]) return;
        inactiveOpenDocsRef.current[id] = "pending";
        getDoc(doc(db, "companies", companyId, "employees", id))
          .then((snap) => {
            if (!snap.exists()) return;
            inactiveOpenDocsRef.current[id] = { id: snap.id, ...snap.data() };
            applyStatus();
          })
          .catch((error) => {
            delete inactiveOpenDocsRef.current[id];
            console.log("[useTodayShift] inactive employee fetch error:", error.message);
          });
      });

      const extraInactive = openInactiveIds
        .map((id) => inactiveOpenDocsRef.current[id])
        .filter((entry) => entry && entry !== "pending");

      const merged = [...employeesData, ...extraInactive].map((emp) => ({
        ...emp,
        status: deriveStatus(
          (latestEventByEmployee[emp.id] || latestEventAllTime[emp.id])?.type
        ),
      }));

      setEmployees(merged);
      setTodayInEvents(todayIns);

      if (employeesReady && eventsReady) {
        setLoading(false);
      }
    };

    const employeesRef = collection(db, "companies", companyId, "employees");
    const employeesQuery = query(employeesRef, where("active", "==", true));
    const unsubEmployees = onSnapshot(
      employeesQuery,
      (snap) => {
        employeesData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        employeesReady = true;
        applyStatus();
      },
      (error) => {
        console.log("[useTodayShift] employees listener error:", error.code, error.message);
        employeesReady = true;
        applyStatus();
      }
    );

    const eventsRef = collection(db, "companies", companyId, "clockEvents");
    const unsubEvents = onSnapshot(
      query(eventsRef),
      (snap) => {
        eventsData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        eventsReady = true;
        applyStatus();
      },
      (error) => {
        console.log("[useTodayShift] events listener error:", error.code, error.message);
        eventsReady = true;
        applyStatus();
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
      unsubEmployees();
      unsubEvents();
      unsubSites();
    };
  }, [companyId]);

  return { employees, sites, todayInEvents, loading };
}