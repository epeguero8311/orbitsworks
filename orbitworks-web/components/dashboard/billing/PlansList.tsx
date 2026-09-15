"use client";

import { PRICE_TIERS } from "@/lib/stripe/tiers";

export function PlansList({
  currentPlanTier,
  busy,
  onTierClick,
}: {
  currentPlanTier: string;
  busy: string | null;
  onTierClick: (tierKey: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">Plans</h2>
      <p className="mt-1 text-xs text-gray-600">
        Pricing is based on your total number of employees, including
        supervisors.
      </p>

      <div className="mt-5 divide-y divide-gray-100">
        {PRICE_TIERS.map((tier) => {
          const isCurrent = currentPlanTier === tier.key;
          return (
            <div
              key={tier.key}
              className={`flex items-center justify-between rounded-lg py-3.5 px-3 ${
                isCurrent ? "ring-2 ring-accent bg-accent/5" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isCurrent && (
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent" />
                )}
                <p className="text-sm font-medium text-gray-950">
                  {tier.label}
                  <span className="ml-2 font-normal text-gray-600">
                    {tier.priceLabel}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={isCurrent || busy === tier.key}
                onClick={() => onTierClick(tier.key)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isCurrent
                    ? "border-gray-200 text-gray-600"
                    : "border-accent text-accent hover:bg-accent/10"
                }`}
              >
                {isCurrent
                  ? "Current plan"
                  : busy === tier.key
                  ? "Loading..."
                  : "Upgrade"}
              </button>
            </div>
          );
        })}

        <div className="flex items-center justify-between py-3.5">
          <p className="text-sm font-medium text-gray-950">
            101+ employees
          </p>
          <span className="text-sm text-gray-600">Contact us</span>
        </div>
      </div>
    </div>
  );
}
