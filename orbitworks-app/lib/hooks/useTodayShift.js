import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useTodayShift(companyId, assignedSiteIds) {
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId || !assignedSiteIds || assignedSiteIds.length === 0) {
      setEmployees([]);
      setSites([]);
      setLoading(false);
      return;
    }

    let employeesData = [];
    let eventsData = [];

    const applyStatus = () => {
      const todayStart = startOfToday();

      const latestEventByEmployee = {};
      eventsData.forEach((evt) => {
        const ts = evt.timestamp?.toDate ? evt.timestamp.toDate() : null;
        if (!ts || ts < todayStart) return;
        const existing = latestEventByEmployee[evt.employeeId];
        if (!existing || ts > existing.ts) {
          latestEventByEmployee[evt.employeeId] = { type: evt.type, ts };
        }
      });

      const merged = employeesData.map((emp) => ({
        ...emp,
        status: latestEventByEmployee[emp.id]?.type === "in" ? "in" : "out",
      }));

      setEmployees(merged);
      setLoading(false);
    };

    const employeesRef = collection(db, "companies", companyId, "employees");
    const employeesQuery = query(
      employeesRef,
      where("active", "==", true),
      where("assignedSiteIds", "array-contains-any", assignedSiteIds)
    );

    const unsubEmployees = onSnapshot(employeesQuery, (snap) => {
      employeesData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      applyStatus();
    });

    const eventsRef = collection(db, "companies", companyId, "clockEvents");
    const eventsQuery = query(eventsRef);

    const unsubEvents = onSnapshot(eventsQuery, (snap) => {
      eventsData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      applyStatus();
    });

    const sitesRef = collection(db, "companies", companyId, "jobSites");
    const sitesQuery = query(sitesRef, where("active", "==", true));

    const unsubSites = onSnapshot(sitesQuery, (snap) => {
      const allSites = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSites(allSites.filter((s) => assignedSiteIds.includes(s.id)));
    });

    return () => {
      unsubEmployees();
      unsubEvents();
      unsubSites();
    };
  }, [companyId, JSON.stringify(assignedSiteIds)]);

  return { employees, sites, loading };
}
