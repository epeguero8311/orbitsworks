import Link from "next/link";
import { BarChart3 } from "lucide-react";

export default function AnalyticsLockedUpsell() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
        <BarChart3 className="h-6 w-6 text-accent" />
      </div>
      <span className="mb-2 inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
        PRO
      </span>
      <h1 className="text-xl font-semibold text-gray-950">
        See where your labor money is going
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-600">
        Analytics breaks down labor cost by job site, overtime, and
        in-house vs. subcontractor spend - upgrade to Pro to unlock it.
      </p>
      <Link
        href="/dashboard/billing"
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Upgrade to Pro
      </Link>
    </div>
  );
}
