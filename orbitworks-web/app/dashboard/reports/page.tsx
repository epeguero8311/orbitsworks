"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useReports } from "@/lib/hooks/useReports";
import { dateKey, startOfWeek } from "@/lib/reportUtils";
import AttendanceCards from "@/components/reports/AttendanceCards";
import TimeTrendsCharts from "@/components/reports/TimeTrendsCharts";
import PayrollTable from "@/components/reports/PayrollTable";
import ExportMenu from "@/components/reports/ExportMenu";

export default function ReportsPage() {
  const { userData } = useAuth();
  const [companyName, setCompanyName] = useState("OrbitWorks");

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      if (snapshot.exists() && snapshot.data().name) {
        setCompanyName(snapshot.data().name);
      }
    });
    return unsubscribe;
  }, [userData?.companyId]);

  const today = dateKey(new Date());
  const weekStart = dateKey(startOfWeek(new Date()));

  const [startDate, setStartDate] = useState(weekStart);
  const [endDate, setEndDate] = useState(today);

  const {
    loading,
    error,
    summaries,
    attendance,
    hoursPerWeek,
    employeesPerDay,
    avgHoursPerEmployee,
    sessions,
    employeeRecords,
    attendanceRecords,
    runReport,
  } = useReports();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    runReport(startDate, endDate);
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Reports</h1>
      <p className="mt-1 text-sm text-gray-600">
        Attendance, time trends, and payroll.
      </p>

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end">
        <div>
          <label htmlFor="startDate" className="mb-1.5 block text-sm font-medium text-gray-950">
            Start date
          </label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label htmlFor="endDate" className="mb-1.5 block text-sm font-medium text-gray-950">
            End date
          </label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <button
          onClick={() => runReport(startDate, endDate)}
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? "Calculating..." : "Refresh"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {summaries && (
        <div className="mt-6 space-y-8">
          <ExportMenu
            summaries={summaries}
            sessions={sessions}
            employeeRecords={employeeRecords}
            attendanceRecords={attendanceRecords}
            startDate={startDate}
            endDate={endDate}
            companyName={companyName}
          />
          <AttendanceCards attendance={attendance} />
          <TimeTrendsCharts
            hoursPerWeek={hoursPerWeek}
            employeesPerDay={employeesPerDay}
            avgHoursPerEmployee={avgHoursPerEmployee}
          />
          <PayrollTable summaries={summaries} startDate={startDate} endDate={endDate} />
        </div>
      )}
    </div>
  );
}
