export default function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  loading,
  changePercent,
  changeLabel,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  loading: boolean;
  // Optional "up/down X% vs <period>" line - only Analytics passes this
  // today, every other caller leaves it unset and renders unchanged.
  changePercent?: number | null;
  changeLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-2xl font-semibold text-gray-950">
            {loading ? "-" : value}
          </p>
          {!loading && changeLabel && changePercent != null && (
            <p
              className={`mt-0.5 text-xs font-medium ${
                changePercent >= 0 ? "text-red-600" : "text-green-700"
              }`}
            >
              {changePercent >= 0 ? "up" : "down"} {Math.abs(changePercent).toFixed(0)}%{" "}
              {changeLabel}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
