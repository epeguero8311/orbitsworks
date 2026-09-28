"use client";

import Link from "next/link";
import { ENFORCEMENT_MODE_OPTIONS, type EnforcementMode } from "@/lib/hooks/useCompanySettings";
import { useHasGeofencedSite } from "@/lib/hooks/useHasGeofencedSite";
import { ProBadgeLink } from "@/components/dashboard/sites/GeofenceFields";

export function GeofencingCard({
  isPro,
  enforcementMode,
  onEnforcementModeChange,
}: {
  isPro: boolean;
  enforcementMode: EnforcementMode;
  onEnforcementModeChange: (mode: EnforcementMode) => void;
}) {
  const hasGeofencedSite = useHasGeofencedSite();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-950">Geofencing</h2>
        {!isPro && <ProBadgeLink />}
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Choose what happens when a worker clocks in outside a site&apos;s geofence.
      </p>

      {!isPro ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center">
          <p className="text-sm text-gray-600">Geofencing enforcement is a Pro feature.</p>
          <Link
            href="/dashboard/billing"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {ENFORCEMENT_MODE_OPTIONS.map((option) => {
              const isSelected = enforcementMode === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    isSelected
                      ? "border-accent bg-accent/5 ring-1 ring-accent"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="geofenceEnforcementMode"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => onEnforcementModeChange(option.value)}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-950">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-600">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Clock-outs are never blocked, only flagged, so no one gets stuck on the clock.
          </p>

          {!hasGeofencedSite && (
            <p className="mt-2 text-xs text-gray-500">
              Turn on geofencing for a site in Jobs to start using this.
            </p>
          )}
        </>
      )}
    </div>
  );
}
