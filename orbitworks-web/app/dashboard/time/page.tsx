"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type Employee = {
  id: string;
  name: string;
  assignedSiteIds: string[];
  active: boolean;
};

type JobSite = {
  id: string;
  name: string;
  active: boolean;
};

type ClockEvent = {
  id: string;
  employeeId: string;
  employeeName: string;
  siteId: string;
  siteName: string;
  type: "in" | "out";
  source: "faceMatch" | "supervisorOverride" | "adminManual";
  note?: string;
  timestamp?: Timestamp;
};

export default function TimeTrackingPage() {
  const { currentUser, userData } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<JobSite[]>([]);
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [employeeId, setEmployeeId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [type, setType] = useState<"in" | "out">("in");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Live employees (active only)
  useEffect(() => {
    if (!userData?.companyId) return;
    const employeesRef = collection(
      db,
      "companies",
      userData.companyId,
      "employees"
    );
    const unsubscribe = onSnapshot(employeesRef, (snapshot) => {
      setEmployees(
        snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Employee, "id">) }))
          .filter((e) => e.active)
      );
    });
    return unsubscribe;
  }, [userData?.companyId]);

  // Live job sites (active only)
  useEffect(() => {
    if (!userData?.companyId) return;
    const sitesRef = collection(
      db,
      "companies",
      userData.companyId,
      "jobSites"
    );
    const unsubscribe = onSnapshot(sitesRef, (snapshot) => {
      setSites(
        snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<JobSite, "id">) }))
          .filter((s) => s.active)
      );
    });
    return unsubscribe;
  }, [userData?.companyId]);

  // Live recent clock events (most recent 50)
  useEffect(() => {
    if (!userData?.companyId) return;
    const eventsRef = collection(
      db,
      "companies",
      userData.companyId,
      "clockEvents"
    );
    const q = query(eventsRef, orderBy("timestamp", "desc"), limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEvents(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ClockEvent, "id">),
          }))
        );
        setLoadingEvents(false);
      },
      (err) => {
        console.error("Clock events listener error:", err);
        setLoadingEvents(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  // Employees eligible for the currently selected site (or all, if no site picked yet)
  const eligibleEmployees = siteId
    ? employees.filter((e) => e.assignedSiteIds?.includes(siteId))
    : employees;

  async function handleManualClock(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId || !currentUser) return;
    setError("");
    setSuccess("");

    if (!note.trim()) {
      setError("A reason/note is required for manual entries.");
      return;
    }

    setIsSubmitting(true);
    try {
      const employee = employees.find((emp) => emp.id === employeeId);
      const site = sites.find((s) => s.id === siteId);
      if (!employee || !site) {
        setError("Select an employee and job site.");
        setIsSubmitting(false);
        return;
      }

      const eventsRef = collection(
        db,
        "companies",
        userData.companyId,
        "clockEvents"
      );
      await addDoc(eventsRef, {
        employeeId: employee.id,
        employeeName: employee.name,
        siteId: site.id,
        siteName: site.name,
        type,
        source: "adminManual",
        note: note.trim(),
        createdByUid: currentUser.uid,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      setSuccess(`Clocked ${type === "in" ? "in" : "out"}: ${employee.name}`);
      setEmployeeId("");
      setSiteId("");
      setNote("");
      setType("in");
    } catch (err) {
      console.error("Manual clock event error:", err);
      setError("Couldn't record the clock event. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function sourceLabel(source: ClockEvent["source"]) {
    switch (source) {
      case "faceMatch":
        return { text: "Face match", className: "bg-green-50 text-green-700" };
      case "supervisorOverride":
        return {
          text: "Supervisor override",
          className: "bg-amber-50 text-amber-700",
        };
      case "adminManual":
        return { text: "Admin manual", className: "bg-blue-50 text-blue-700" };
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Time Tracking</h1>
      <p className="mt-1 text-sm text-gray-600">
        View clock events, and manually clock an employee in or out when the
        normal selfie flow isn&apos;t available.
      </p>

      {/* Manual clock in/out form */}
      <form
        onSubmit={handleManualClock}
        className="mt-6 rounded-lg border border-gray-200 bg-white p-4"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            Manual entry — exception use only
          </span>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Use this when a supervisor&apos;s tablet or connection is down. This
          entry will be clearly logged as admin-entered, separate from
          face-matched clock events.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="siteSelect"
              className="mb-1.5 block text-sm font-medium text-gray-950"
            >
              Job site
            </label>
            <select
              id="siteSelect"
              required
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setEmployeeId(""); // reset employee choice when site changes
              }}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">Select a site…</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="employeeSelect"
              className="mb-1.5 block text-sm font-medium text-gray-950"
            >
              Employee
            </label>
            <select
              id="employeeSelect"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!siteId}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:bg-gray-50 disabled:text-gray-600"
            >
              <option value="">
                {siteId ? "Select an employee…" : "Select a site first"}
              </option>
              {eligibleEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-gray-950">
            Clock direction
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("in")}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                type === "in"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              Clock in
            </button>
            <button
              type="button"
              onClick={() => setType("out")}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                type === "out"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              Clock out
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="note"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Reason (required)
          </label>
          <input
            id="note"
            type="text"
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="e.g. Supervisor tablet was offline"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-3 text-sm text-green-700">{success}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isSubmitting ? "Recording…" : "Record clock event"}
        </button>
      </form>

      {/* Recent events log */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-950">
            Recent clock events
          </h2>
        </div>
        {loadingEvents ? (
          <p className="p-4 text-sm text-gray-600">Loading…</p>
        ) : events.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No clock events yet. Once employees start clocking in on mobile,
            or you record a manual entry above, they&apos;ll show up here.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Site</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const badge = sourceLabel(event.source);
                return (
                  <tr
                    key={event.id}
                    className="border-b border-gray-200 last:border-0"
                  >
                    <td className="px-4 py-2.5 text-gray-950">
                      {event.employeeName}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {event.siteName}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`font-medium ${
                          event.type === "in"
                            ? "text-green-700"
                            : "text-gray-600"
                        }`}
                      >
                        {event.type === "in" ? "Clock in" : "Clock out"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                      {event.timestamp
                        ? event.timestamp.toDate().toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.text}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {event.note || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}