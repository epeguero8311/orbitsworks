import Link from "next/link";
import type { AnalyticsSummary } from "@/lib/types";

export default function AnalyticsNotes({ summary }: { summary: AnalyticsSummary }) {
  const notes: string[] = [];
  if (summary.unapprovedHoursIncluded > 0) {
    notes.push(
      `Includes ${summary.unapprovedHoursIncluded.toFixed(1)} unapproved hrs.`
    );
  }
  if (summary.missingClockOutsExcluded > 0) {
    notes.push(
      `${summary.missingClockOutsExcluded} missing clock-out${
        summary.missingClockOutsExcluded === 1 ? "" : "s"
      } from past days excluded.`
    );
  }
  if (notes.length === 0 && summary.employeesMissingRateCount === 0) return null;

  return (
    <div className="space-y-1.5">
      {notes.map((note) => (
        <p key={note} className="text-xs text-gray-600">
          {note}
        </p>
      ))}
      {summary.employeesMissingRateCount > 0 && (
        <p className="text-xs text-amber-700">
          {summary.employeesMissingRateCount} employee
          {summary.employeesMissingRateCount === 1 ? "" : "s"} missing a rate -
          their hours count but cost shows $0.{" "}
          <Link href="/dashboard/employees" className="font-medium hover:underline">
            Fix rates
          </Link>
        </p>
      )}
    </div>
  );
}
