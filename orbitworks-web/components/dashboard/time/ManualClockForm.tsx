"use client";

import { useEffect, useState, FormEvent } from "react";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useSites } from "@/lib/hooks/useSites";
import {
  useClockEvents,
  ClockValidationError,
  type ClockDirection,
} from "@/lib/hooks/useClockEvents";

export default function ManualClockForm() {
  const { employees: allEmployees } = useEmployees();
  const { sites: allSites } = useSites();
  const { statusOf, isEligibleFor, recordManualClockEvent } = useClockEvents();

  // Active employees are always eligible; an inactive one only shows up
  // here if they still have an open session (deactivation should have
  // auto-closed it, but this is the safety net for when that write
  // fails). isEligibleFor below already keeps them clock-out-only - an
  // inactive employee is never "eligible" for "in"/"breakStart" since
  // their last known status can't be "out" while their session is open.
  const employees = allEmployees.filter((e) => e.active || statusOf(e.id) !== "out");
  const sites = allSites.filter((s) => s.active);

  const [employeeId, setEmployeeId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [type, setType] = useState<ClockDirection>("in");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

      await recordManualClockEvent(employee, site, type, note);

      setSuccess(successMessageFor(type, employee.name));
      setEmployeeId("");
      setSiteId("");
      setSearchQuery("");
      setNote("");
    } catch (err) {
      console.error("Manual clock event error:", err);
      setError(
        err instanceof ClockValidationError
          ? err.message
          : "Couldn't record the clock event. Try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

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
              {!emp.active ? " (Inactive - clock out only)" : ""}
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
  );
}
