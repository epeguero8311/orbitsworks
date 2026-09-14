"use client";

import Link from "next/link";
import { Download, UserPlus } from "lucide-react";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { useDashboardStatus } from "@/lib/hooks/useDashboardStatus";
import StatCardsRow from "@/components/dashboard/overview/StatCardsRow";
import WeeklyAttendanceChart from "@/components/dashboard/overview/WeeklyAttendanceChart";
import JobSiteBreakdown from "@/components/dashboard/overview/JobSiteBreakdown";
import AlertsPanel from "@/components/dashboard/overview/AlertsPanel";
import EmployeesClockedInTable from "@/components/dashboard/overview/EmployeesClockedInTable";
import OnBreakTable from "@/components/dashboard/overview/OnBreakTable";

export default function DashboardOverviewPage() {
  const { settings } = useCompanySettings();
  const status = useDashboardStatus();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950">
            Welcome, {settings.name ?? "..."}
          </h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Here's what's happening across your job sites today.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/reports"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-950 transition-colors hover:border-gray-300"
          >
            <Download className="h-4 w-4" />
            Download Report
          </Link>
          <Link
            href="/dashboard/employees"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <UserPlus className="h-4 w-4" />
            Add Employee
          </Link>
        </div>
      </div>

      <StatCardsRow
        loading={status.loading}
        activeSitesCount={status.activeSites.length}
        totalActive={status.totalActive}
        onBreakCount={status.currentlyOnBreak.length}
        avgHoursWorked={status.avgHoursWorked}
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <WeeklyAttendanceChart
          data={status.weeklyAttendance}
          loading={status.loadingChart}
        />
        <JobSiteBreakdown
          activeSites={status.activeSites}
          totalActive={status.totalActive}
          loading={status.loading}
        />
      </div>

      <AlertsPanel
        loading={status.loading}
        currentlyActive={status.currentlyActive}
        currentlyOnBreak={status.currentlyOnBreak}
        weeklyHoursByEmployee={status.weeklyHoursByEmployee}
        workedMsByEmployee={status.workedMsByEmployee}
      />

      <EmployeesClockedInTable
        loading={status.loading}
        activeDisplay={status.activeDisplay}
        activeOverflow={status.activeOverflow}
        workedMsByEmployee={status.workedMsByEmployee}
      />

      <OnBreakTable
        loading={status.loading}
        onBreakDisplay={status.onBreakDisplay}
        onBreakOverflow={status.onBreakOverflow}
      />
    </div>
  );
}
