"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { ClockEvent, Employee, JobSite } from "@/lib/types";
import { deriveStatus, ClockStatus, typeLabel, sourceLabel } from "@/lib/clockStatus";
import ClockEventDetailModal from "@/components/dashboard/ClockEventDetailModal";
import ClockEventsDayView from "@/components/dashboard/ClockEventsDayView";

type ClockDirection = "in" | "out" | "breakStart" | "breakEnd";

export default function TimeTrackingPage() {
  const { currentUser, userData } = useAuth();
  const { settings } = useCompanySettings();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<JobSite[]>([]);

  const [recentEventsForStatus, setRecentEventsForStatus] = useState<ClockEvent[]>([]);

  const [employeeId, setEmployeeId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [type, setType] = useState<ClockDirection>("in");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [lookupEmployeeId, setLookupEmployeeId] = useState("");
  const [lookupSiteId, setLookupSiteId] = useState("");
  const [lookupFromDate, setLookupFromDate] = useState("");
  const [lookupToDate, setLookupToDate] = useState("");
  const [lookupResults, setLookupResults] = useState<ClockEvent[] | null>(
    null
  );
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const [selectedEvent, setSelectedEvent] = useState<ClockEvent | null>(null);

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
        setRecentEventsForStatus(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ClockEvent, "id">),
          }))
        );
      },
      (err) => {
        console.error("Clock events status listener error:", err);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  const employeeStatusMap = useMemo(() => {
    const map: Record<string, ClockStatus> = {};
    for (const ev of recentEventsForStatus) {
      if (!(ev.employeeId in map)) {
        map[ev.employeeId] = deriveStatus(ev.type);
      }
    }
    return map;
  }, [recentEventsForStatus]);

  function statusOf(id: string): ClockStatus {
    return employeeStatusMap[id] ?? "out";
  }

  function isEligibleFor(id: string, direction: ClockDirection) {
    const status = statusOf(id);
    if (direction === "in") return status === "out";
    if (direction === "out") return status === "in" || status === "break";
    if (direction === "breakStart") return status === "in";
    return status === "break"; // breakEnd
  }

  const filteredEmployees = employees
    .filter((e) => (siteId ? e.assignedSiteIds?.includes(siteId) : true))
    .filter((e) =>
      searchQuery.trim()
        ? e.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
        : true
    )
    .filter((e) => isEligibleFor(e.id, type));

  useEffect(() => {
    if (employeeId && !filteredEmployees.some((e) => e.id === employeeId)) {
      setEmployeeId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, searchQuery]);

  // Only auto-correct the direction if the currently selected one isn't
  // valid for this employee. This is what preserves an explicit "Start
  // break" click - without this check, picking a clocked-in employee would
  // always snap the direction back to "out" since that's the most common
  // case for someone with status "in".
  function handleSelectEmployee(id: string) {
    setEmployeeId(id);
    if (!id) return;
    if (isEligibleFor(id, type)) return;

    const status = statusOf(id);
    if (status === "out") setType("in");
    else if (status === "break") setType("breakEnd");
    else setType("out");
  }

  function handleSelectType(next: ClockDirection) {
    if (employeeId && !isEligibleFor(employeeId, next)) return;
    setType(next);
  }

  function emptyMessageFor(direction: ClockDirection) {
    switch (direction) {
      case "in":
        return "No employees available to clock in";
      case "out":
        return "No employees available to clock out";
      case "breakStart":
        return "No employees available to start a break";
      case "breakEnd":
        return "No employees currently on break";
    }
  }

  function alreadyMessageFor(direction: ClockDirection, name: string) {
    switch (direction) {
      case "in":
        return `${name} is already clocked in.`;
      case "out":
        return `${name} is already clocked out.`;
      case "breakStart":
        return `${name} is not currently clocked in.`;
      case "breakEnd":
        return `${name} is not currently on break.`;
    }
  }

  function successMessageFor(direction: ClockDirection, name: string) {
    switch (direction) {
      case "in":
        return `Clocked in: ${name}`;
      case "out":
        return `Clocked out: ${name}`;
      case "breakStart":
        return `Started break: ${name}`;
      case "breakEnd":
        return `Ended break: ${name}`;
    }
  }

  async function handleManualClock(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId || !currentUser) return;
    setError("");
    setSuccess("");

    setIsSubmitting(true);
    try {
      const employee = employees.find((emp) => emp.id === employeeId);
      const site = sites.find((s) => s.id === siteId);
      if (!employee) {
        setError("Select an employee.");
        setIsSubmitting(false);
        return;
      }

      if (!isEligibleFor(employee.id, type)) {
        setError(alreadyMessageFor(type, employee.name));
        setIsSubmitting(false);
        return;
      }

      const now = new Date();

      if (type === "in" || type === "out") {
        const [openH, openM] = settings.businessHours.open.split(":").map(Number);
        const [closeH, closeM] = settings.businessHours.close.split(":").map(Number);
        const businessOpenToday = new Date(now);
        businessOpenToday.setHours(openH, openM, 0, 0);
        const businessCloseToday = new Date(now);
        businessCloseToday.setHours(closeH, closeM, 0, 0);

        if (
          type === "in" &&
          !settings.attendanceRules.allowEarlyClockIn &&
          now < businessOpenToday
        ) {
          setError(
            `Early clock-in isn't allowed before ${settings.businessHours.open}. Enable it in Settings if needed.`
          );
          setIsSubmitting(false);
          return;
        }

        if (
          type === "out" &&
          !settings.attendanceRules.allowLateClockOut &&
          now > businessCloseToday
        ) {
          setError(
            `Late clock-out isn't allowed after ${settings.businessHours.close}. Enable it in Settings if needed.`
          );
          setIsSubmitting(false);
          return;
        }
      }

      const eventsRef = collection(
        db,
        "companies",
        userData.companyId,
        "clockEvents"
      );

      if (type === "out" && statusOf(employee.id) === "break") {
        await addDoc(eventsRef, {
          employeeId: employee.id,
          employeeName: employee.name,
          siteId: site?.id ?? null,
          siteName: site?.name ?? "Not specified",
          type: "breakEnd",
          source: "autoBreakEnd",
          createdByUid: currentUser.uid,
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }

      await addDoc(eventsRef, {
        employeeId: employee.id,
        employeeName: employee.name,
        siteId: site?.id ?? null,
        siteName: site?.name ?? "Not specified",
        type,
        source: "adminManual",
        note: note.trim(),
        createdByUid: currentUser.uid,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      setSuccess(successMessageFor(type, employee.name));
      setEmployeeId("");
      setSiteId("");
      setSearchQuery("");
      setNote("");
    } catch (err) {
      console.error("Manual clock event error:", err);
      setError("Couldn't record the clock event. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLookupSearch(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId) return;
    setLookupError("");
    setLookupLoading(true);

    try {
      const eventsRef = collection(
        db,
        "companies",
        userData.companyId,
        "clockEvents"
      );

      const constraints: QueryConstraint[] = [];
      if (lookupEmployeeId) {
        constraints.push(where("employeeId", "==", lookupEmployeeId));
      }
      if (lookupSiteId) {
        constraints.push(where("siteId", "==", lookupSiteId));
      }
      if (lookupFromDate) {
        constraints.push(
          where(
            "timestamp",
            ">=",
            Timestamp.fromDate(new Date(`${lookupFromDate}T00:00:00`))
          )
        );
      }
      if (lookupToDate) {
        constraints.push(
          where(
            "timestamp",
            "<=",
            Timestamp.fromDate(new Date(`${lookupToDate}T23:59:59`))
          )
        );
      }
      constraints.push(orderBy("timestamp", "desc"));
      constraints.push(limit(100));

      const q = query(eventsRef, ...constraints);
      const snapshot = await getDocs(q);
      setLookupResults(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ClockEvent, "id">),
        }))
      );
    } catch (err) {
      console.error("Clock event lookup error:", err);
      setLookupError(
        "Search failed. If this keeps happening, check the browser console - Firestore may need a composite index (it will log a link to create one)."
      );
    } finally {
      setLookupLoading(false);
    }
  }

  function clearLookup() {
    setLookupEmployeeId("");
    setLookupSiteId("");
    setLookupFromDate("");
    setLookupToDate("");
    setLookupResults(null);
    setLookupError("");
  }

  const isPairable = (t: ClockEvent["type"]) => t === "in" || t === "out";

  const inDisabled = !!employeeId && !isEligibleFor(employeeId, "in");
  const outDisabled = !!employeeId && !isEligibleFor(employeeId, "out");
  const breakStartDisabled = !!employeeId && !isEligibleFor(employeeId, "breakStart");
  const breakEndDisabled = !!employeeId && !isEligibleFor(employeeId, "breakEnd");

  function directionButtonClass(direction: ClockDirection, disabled: boolean) {
    if (type === direction) return "border-accent bg-accent/10 text-accent";
    if (disabled) return "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400";
    return "border-gray-200 text-gray-600 hover:border-gray-300";
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Time Tracking</h1>
      <p className="mt-1 text-sm text-gray-600">
        View clock events, and manually clock an employee in, out, or on a
        break when the normal selfie or app flow isn't available.
      </p>

      <form
        onSubmit={handleManualClock}
        className="mt-6 rounded-lg border border-gray-200 bg-white p-4"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            Manual entry - exception use only
          </span>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Use this when a supervisor's tablet or connection is down. This
          entry will be clearly logged as admin-entered, separate from
          face-matched clock events.
        </p>

        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-medium text-gray-950">
            Clock direction
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSelectType("in")}
              disabled={inDisabled}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${directionButtonClass("in", inDisabled)}`}
            >
              Clock in
            </button>
            <button
              type="button"
              onClick={() => handleSelectType("out")}
              disabled={outDisabled}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${directionButtonClass("out", outDisabled)}`}
            >
              Clock out
            </button>
            <button
              type="button"
              onClick={() => handleSelectType("breakStart")}
              disabled={breakStartDisabled}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${directionButtonClass("breakStart", breakStartDisabled)}`}
            >
              Start break
            </button>
            <button
              type="button"
              onClick={() => handleSelectType("breakEnd")}
              disabled={breakEndDisabled}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${directionButtonClass("breakEnd", breakEndDisabled)}`}
            >
              End break
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-600">
            {employeeId
              ? "Options are limited to this employee's current status."
              : "Select an action, then the employee list below narrows to who's eligible."}
          </p>
        </div>

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
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-600">
              Narrows the employee list below - not required.
            </p>
          </div>

          <div>
            <label
              htmlFor="employeeSearch"
              className="mb-1.5 block text-sm font-medium text-gray-950"
            >
              Search by name
            </label>
            <input
              id="employeeSearch"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="Start typing a name..."
            />
          </div>
        </div>

        <div className="mt-4">
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
            onChange={(e) => handleSelectEmployee(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">
              {filteredEmployees.length === 0
                ? emptyMessageFor(type)
                : "Select an employee..."}
            </option>
            {filteredEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label
            htmlFor="note"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Reason (optional)
          </label>
          <input
            id="note"
            type="text"
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
          disabled={isSubmitting || !employeeId}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isSubmitting ? "Recording..." : "Record clock event"}
        </button>
      </form>

      <form
        onSubmit={handleLookupSearch}
        className="mt-6 rounded-lg border border-gray-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold text-gray-950">
          Look up a clock event
        </h2>
        <p className="mt-1 mb-4 text-sm text-gray-600">
          Search by employee, site, and date to review the proof photo and
          time for a specific clock-in or clock-out.
        </p>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label
              htmlFor="lookupEmployee"
              className="mb-1.5 block text-sm font-medium text-gray-950"
            >
              Employee
            </label>
            <select
              id="lookupEmployee"
              value={lookupEmployeeId}
              onChange={(e) => setLookupEmployeeId(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">All employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="lookupSite"
              className="mb-1.5 block text-sm font-medium text-gray-950"
            >
              Job site
            </label>
            <select
              id="lookupSite"
              value={lookupSiteId}
              onChange={(e) => setLookupSiteId(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="lookupFrom"
              className="mb-1.5 block text-sm font-medium text-gray-950"
            >
              From date
            </label>
            <input
              id="lookupFrom"
              type="date"
              value={lookupFromDate}
              onChange={(e) => setLookupFromDate(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label
              htmlFor="lookupTo"
              className="mb-1.5 block text-sm font-medium text-gray-950"
            >
              To date
            </label>
            <input
              id="lookupTo"
              type="date"
              value={lookupToDate}
              onChange={(e) => setLookupToDate(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {lookupError && (
          <p className="mt-3 text-sm text-red-600">{lookupError}</p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={lookupLoading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {lookupLoading ? "Searching..." : "Search"}
          </button>
          {lookupResults !== null && (
            <button
              type="button"
              onClick={clearLookup}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {lookupResults !== null ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-950">
              Search results
            </h2>
          </div>
          {lookupResults.length === 0 ? (
            <p className="p-4 text-sm text-gray-600">
              No clock events match that search.
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
                  <th className="px-4 py-2 font-medium">Authorized by</th>
                  <th className="px-4 py-2 font-medium">Photo</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {lookupResults.map((event) => {
                  const badge = sourceLabel(event.source);
                  const typeBadge = typeLabel(event.type);
                  const pairable = isPairable(event.type);
                  return (
                    <tr
                      key={event.id}
                      onClick={() => pairable && setSelectedEvent(event)}
                      className={`border-b border-gray-200 last:border-0 ${
                        pairable ? "cursor-pointer hover:bg-gray-50" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 text-gray-950">
                        {event.employeeName}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {event.siteName}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${typeBadge.className}`}>
                          {typeBadge.text}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                        {event.timestamp
                          ? event.timestamp.toDate().toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {badge.text}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {event.authorizedByName || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {event.photoUrl ? "View" : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {event.note || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <ClockEventsDayView companyId={userData?.companyId} />
      )}

      {selectedEvent && (
        <ClockEventDetailModal
          event={selectedEvent}
          allEvents={lookupResults ?? []}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}