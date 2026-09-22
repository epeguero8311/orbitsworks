"use client";

import { useState } from "react";
import {
  getTierByKey,
  getTiersByProduct,
  PRO_PLAN_ENABLED,
  type PlanProduct,
  type PriceTier,
} from "@/lib/stripe/tiers";

const PLAN_DESCRIPTIONS: Record<PlanProduct, string> = {
  core: "Clock-in/out, timesheets, and approvals.",
  pro: "Everything in Core, plus geolocation, geofencing, device recognition, face recognition, job site cost analytics, and temporary clock-in links.",
};

function PlanToggle({
  selected,
  onSelect,
}: {
  selected: PlanProduct;
  onSelect: (product: PlanProduct) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      {(["core", "pro"] as const).map((product) => {
        const isSelected = selected === product;
        return (
          <button
            key={product}
            type="button"
            onClick={() => onSelect(product)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              isSelected
                ? "bg-accent text-white"
                : "text-gray-600 hover:text-gray-950"
            }`}
          >
            {product}
          </button>
        );
      })}
    </div>
  );
}

function PlanGroup({
  description,
  tiers,
  currentPlanTier,
  busy,
  onTierClick,
}: {
  description: string;
  tiers: PriceTier[];
  currentPlanTier: string;
  busy: string | null;
  onTierClick: (tierKey: string) => void;
}) {
  return (
    <div>
      <p className="text-xs text-gray-600">{description}</p>

      <div className="mt-3 divide-y divide-gray-100">
        {tiers.map((tier) => {
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
                  : "Choose plan"}
              </button>
            </div>
          );
        })}

        <div className="flex items-center justify-between py-3.5 px-3">
          <p className="text-sm font-medium text-gray-950">101+ employees</p>
          <span className="text-sm text-gray-600">Contact us</span>
        </div>
      </div>
    </div>
  );
}

export function PlansList({
  currentPlanTier,
  busy,
  onTierClick,
}: {
  currentPlanTier: string;
  busy: string | null;
  onTierClick: (tierKey: string) => void;
}) {
  const currentProduct = getTierByKey(currentPlanTier)?.product ?? "core";
  const [selected, setSelected] = useState<PlanProduct>(currentProduct);

  const tiers = getTiersByProduct(selected);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-950">Plans</h2>
          <p className="mt-1 text-xs text-gray-600">
            Pricing is based on your total number of employees, including
            supervisors.
          </p>
        </div>

        {PRO_PLAN_ENABLED && (
          <PlanToggle selected={selected} onSelect={setSelected} />
        )}
      </div>

      <div className="mt-5">
        <PlanGroup
          description={PLAN_DESCRIPTIONS[selected]}
          tiers={tiers}
          currentPlanTier={currentPlanTier}
          busy={busy}
          onTierClick={onTierClick}
        />
      </div>
    </div>
  );
}
