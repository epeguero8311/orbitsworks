import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DayAttendance } from "@/lib/dashboardOverviewUtils";

export default function WeeklyAttendanceChart({
  data,
  loading,
}: {
  data: DayAttendance[];
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
      <h2 className="text-base font-semibold text-gray-950">
        Weekly attendance
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Unique employees clocked in each day, last 7 days.
      </p>
      <div className="mt-6 h-64">
        {loading ? (
          <p className="text-sm text-gray-600">Loading...</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 13, fill: "#6b7280" }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 13, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                cursor={{ fill: "#fafafa" }}
                contentStyle={{
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                }}
              />
              <Bar dataKey="count" fill="#3b6fe0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
