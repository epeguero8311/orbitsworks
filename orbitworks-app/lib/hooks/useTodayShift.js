import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
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

  useEffect(() => {
    if (!companyId) {
      setEmployees([]);
      setSites([]);
      setTodayInEvents([]);
      setLoading(false);
      return;
    }

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
      const todayIns = [];

      eventsData.forEach((evt) => {
        const ts = evt.timestamp?.toDate ? evt.timestamp.toDate() : null;
        if (!ts) return;
        if (ts >= todayStart && evt.type === "in") {
          todayIns.push({ employeeId: evt.employeeId, timestamp: ts });
        }
        if (ts < todayStart) return;
        const existing = latestEventByEmployee[evt.employeeId];
        if (!existing || ts > existing.ts) {
          latestEventByEmployee[evt.employeeId] = { type: evt.type, ts };
        }
      });

      const merged = employeesData.map((emp) => ({
        ...emp,
        status: deriveStatus(latestEventByEmployee[emp.id]?.type),
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