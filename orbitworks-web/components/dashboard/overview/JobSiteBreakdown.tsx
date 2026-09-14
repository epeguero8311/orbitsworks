import Link from "next/link";

export default function JobSiteBreakdown({
  activeSites,
  totalActive,
  loading,
}: {
  activeSites: [string, number][];
  totalActive: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-950">
          Job site breakdown
        </h2>
        <Link
          href="/dashboard/sites"
          className="text-sm font-medium text-accent hover:underline"
        >
          View all
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Live headcount per location.
      </p>
      <div className="mt-6 space-y-5">
        {loading ? (
          <p className="text-sm text-gray-600">Loading...</p>
        ) : activeSites.length === 0 ? (
          <p className="text-sm text-gray-600">
            No sites currently staffed.
          </p>
        ) : (
          activeSites.map(([siteName, count]) => {
            const pct = totalActive
              ? Math.round((count / totalActive) * 100)
              : 0;
            return (
              <div key={siteName}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-950">
                    {siteName}
                  </span>
                  <span className="text-gray-600">
                    {count} {count === 1 ? "person" : "people"}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
