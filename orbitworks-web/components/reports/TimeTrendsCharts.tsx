"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TimeTrendsPoint, EmployeesPerDayPoint } from "@/lib/types";

export default function TimeTrendsCharts({
  hoursPerWeek,
  employeesPerDay,
  avgHoursPerEmployee,
}: {
  hoursPerWeek: TimeTrendsPoint[];
  employeesPerDay: EmployeesPerDayPoint[];
  avgHoursPerEmployee: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-950">Time Trends</h2>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-2">
          <p className="text-xs font-medium text-gray-600">Avg hours / employee</p>
          <p className="text-lg font-semibold text-gray-950">
            {avgHoursPerEmployee.toFixed(1)}h
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-950">Avg hours worked per week</p>
          <div className="mt-3 h-56">
            {hoursPerWeek.length === 0 ? (
              <p className="text-sm text-gray-600">No data in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hoursPerWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 12 }} stroke="#6b7280" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="avgHours"
                    stroke="#3b6fe0"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-950">Employees working per day</p>
          <div className="mt-3 h-56">
            {employeesPerDay.length === 0 ? (
              <p className="text-sm text-gray-600">No data in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeesPerDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#6b7280" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="employeeCount" fill="#3b6fe0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
