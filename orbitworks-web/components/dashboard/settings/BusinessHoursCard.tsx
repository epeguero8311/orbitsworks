"use client";

export function BusinessHoursCard({
  businessOpen,
  onBusinessOpenChange,
  businessClose,
  onBusinessCloseChange,
  gracePeriodMinutes,
  onGracePeriodMinutesChange,
}: {
  businessOpen: string;
  onBusinessOpenChange: (value: string) => void;
  businessClose: string;
  onBusinessCloseChange: (value: string) => void;
  gracePeriodMinutes: number;
  onGracePeriodMinutesChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">
        Business hours
      </h2>
      <p className="mt-1 text-xs text-gray-600">
        Applies company-wide for now.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <input
          type="time"
          value={businessOpen}
          onChange={(e) => onBusinessOpenChange(e.target.value)}
          className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <span className="text-sm text-gray-600">to</span>
        <input
          type="time"
          value={businessClose}
          onChange={(e) => onBusinessCloseChange(e.target.value)}
          className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="mt-5">
        <label
          htmlFor="gracePeriod"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Grace period (minutes)
        </label>
        <input
          id="gracePeriod"
          type="number"
          min="0"
          step="1"
          value={gracePeriodMinutes}
          onChange={(e) =>
            onGracePeriodMinutesChange(
              e.target.value ? parseInt(e.target.value, 10) : 0
            )
          }
          className="w-32 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <p className="mt-2 text-xs text-gray-600">
          Minutes after the scheduled start time before a clock-in
          counts as late. E.g. a 5 minute grace period on an 8:00 start
          means 8:05 still counts as on time, 8:06 counts as late.
        </p>
      </div>
    </div>
  );
}
