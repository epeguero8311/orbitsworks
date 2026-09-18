"use client";

import { useState, FormEvent } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useSites } from "@/lib/hooks/useSites";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { useEmployeeTimesheet } from "@/lib/hooks/useEmployeeTimesheet";
import { useClockEvents } from "@/lib/hooks/useClockEvents";
import { exportEmployeeHistoryExcel } from "@/lib/reportExcelUtils";
import { typeLabel, sourceLabel } from "@/lib/clockStatus";
import { ClockEvent } from "@/lib/types";
import ClockEventDetailModal from "@/components/dashboard/ClockEventDetailModal";
import ClockEventsDayView from "@/components/dashboard/ClockEventsDayView";

export default function ClockEventLookup() {
  const { userData } = useAuth();
  const { employees: allEmployees } = useEmployees();
  const { sites: allSites } = useSites();
  const { settings: timesheetSettings } = useCompanySettings();
  const { runTimesheet } = useEmployeeTimesheet();
  const { searchClockEvents } = useClockEvents();

  // Deactivated employees still need to be searchable/exportable here -
  // their historical clock events and timesheet don't go away when they
  // leave, so restricting this list to active employees would make a
  // departed employee's history permanently unreachable from this tool.
  const employees = allEmployees;
  const sites = allSites.filter((s) => s.active);

  const [lookupEmployeeId, setLookupEmployeeId] = useState("");
  const [lookupSiteId, setLookupSiteId] = useState("");
  const [lookupFromDate, setLookupFromDate] = useState("");
  const [lookupToDate, setLookupToDate] = useState("");
  const [lookupResults, setLookupResults] = useState<ClockEvent[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const [exportingTimesheet, setExportingTimesheet] = useState(false);
  const [exportError, setExportError] = useState("");

  const [selectedEvent, setSelectedEvent] = useState<ClockEvent | null>(null);

  async function handleLookupSearch(e: FormEvent) {
    e.preventDefault();
    setLookupError("");
    setLookupLoading(true);

    try {
      const results = await searchClockEvents({
        employeeId: lookupEmployeeId || undefined,
        siteId: lookupSiteId || undefined,
        fromDate: lookupFromDate || undefined,
        toDate: lookupToDate || undefined,
      });
      setLookupResults(results);
    } catch (err) {
      const isIndexError =
        err instanceof Error && (err as { code?: string }).code === "failed-precondition";
      console.error(
        isIndexError
          ? "Clock event lookup error: missing Firestore composite index. Check firestore.indexes.json and run `firebase deploy --only firestore:indexes`."
          : "Clock event lookup error:",
        err
      );
      setLookupError(
        "We couldn't complete that search. Try narrowing your filters, or contact support if this keeps happening."
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

  async function handleExportEmployeeExcel() {
    if (!lookupEmployeeId || !userData?.companyId) return;
    setExportingTimesheet(true);
    setExportError("");
    const todayLocal = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    try {
      const result = await runTimesheet(
        lookupEmployeeId,
        lookupFromDate || "2000-01-01",
        lookupToDate || todayLocal
      );
      if (!result) {
        setExportError("Couldn't build this employee's timesheet. Try again.");
        return;
      }
      const companySnap = await getDoc(doc(db, "companies", userData.companyId));
      const companyName = companySnap.exists()
        ? (companySnap.data() as { name?: string }).name ?? "Company"
        : "Company";
      await exportEmployeeHistoryExcel(
        result.employeeName,
        result.hourlyRate,
        result.defaultJobId,
        result.jobs,
        result.dayRows,
        result.weeklyTotals,
        timesheetSettings.weeklyOvertimeThreshold,
        companyName,
        lookupFromDate || "2000-01-01",
        lookupToDate || todayLocal
      );
    } catch (err) {
      console.error("Employee Excel export error:", err);
      setExportError("Couldn't export this employee's timesheet. Try again.");
    } finally {
      setExportingTimesheet(false);
    }
  }

  return (
    <>
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
                  {!emp.active ? " (Inactive)" : ""}
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
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-950">
              Search results
            </h2>
            {lookupEmployeeId && (
              <button
                type="button"
                onClick={handleExportEmployeeExcel}
                disabled={exportingTimesheet}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exportingTimesheet ? "Exporting..." : "Export to Excel"}
              </button>
            )}
          </div>
          {exportError && (
            <p className="border-b border-gray-200 bg-red-50 px-4 py-2 text-xs text-red-600">
              {exportError}
            </p>
          )}
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
                  const isAdjusted = !!event.adjustedTimestamp;
                  const adj = isAdjusted && event.adjustmentHistory && event.adjustmentHistory.length > 0
                    ? event.adjustmentHistory[event.adjustmentHistory.length - 1]
                    : null;
                  const displayTime = event.adjustedTimestamp ?? event.timestamp;
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
                        {displayTime
                          ? displayTime.toDate().toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-4 py-2.5">
                        {isAdjusted ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Adjusted
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                          >
                            {badge.text}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {isAdjusted
                          ? adj?.changedByName ?? "Admin"
                          : event.authorizedByName || "-"}
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
    </>
  );
}
