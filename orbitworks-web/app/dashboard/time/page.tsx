"use client";

import ManualClockForm from "@/components/dashboard/time/ManualClockForm";
import ClockEventLookup from "@/components/dashboard/time/ClockEventLookup";

export default function TimeTrackingPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Time Tracking</h1>
      <p className="mt-1 text-sm text-gray-600">
        View clock events, and manually clock an employee in, out, or on a
        break when the normal selfie or app flow isn't available.
      </p>

      <ManualClockForm />
      <ClockEventLookup />
    </div>
  );
}
