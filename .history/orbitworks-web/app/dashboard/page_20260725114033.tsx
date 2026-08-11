import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview — OrbitWorks",
};

export default function DashboardOverviewPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Overview</h1>
      <p className="mt-1 text-sm text-gray-600">
        Who&apos;s clocked in right now, across all job sites.
      </p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">
          No activity yet — this will show currently clocked-in employees
          once time tracking is wired up.
        </p>
      </div>
    </div>
  );
}