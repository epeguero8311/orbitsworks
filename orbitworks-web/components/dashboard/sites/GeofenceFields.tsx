"use client";

import Link from "next/link";

// D1 (Phase 8): one toggle drives both flags - a clock-in outside the
// radius, and (Employee App) leaving the radius while clocked in. It never
// blocks anything. Shared by the Sites page, the edit modal and the crew
// code modal so all three say the same thing.
export const GEOFENCE_TOGGLE_LABEL = "Require geofence";
export const GEOFENCE_TOGGLE_DESCRIPTION =
  "Flags clock-ins outside the radius below, and employees who leave it while clocked in (Employee App). Never blocks a punch.";

export function geofenceRadiusHint(value: string, unit: "ft" | "mi"): string {
  return `Clock-ins farther than ${value || 0} ${unit} from this address are flagged, and so is leaving that area during a shift. Nobody is ever stopped from clocking in or out.`;
}

// Shared between the Add form (SitesSection.tsx) and the Edit modal
// (EditSiteModal.tsx) so the Pro-gating affordance and radius inputs look
// and behave identically in both places.
export function ProBadgeLink() {
  return (
    <Link
      href="/dashboard/billing"
      className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent hover:bg-accent/20"
    >
      PRO
    </Link>
  );
}

interface RadiusFieldsProps {
  radiusValue: string;
  radiusUnit: "ft" | "mi";
  onRadiusValueChange: (value: string) => void;
  onRadiusUnitChange: (value: "ft" | "mi") => void;
}

export function RadiusFields({
  radiusValue,
  radiusUnit,
  onRadiusValueChange,
  onRadiusUnitChange,
}: RadiusFieldsProps) {
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-950">
          Radius
        </label>
        <input
          type="number"
          step="any"
          value={radiusValue}
          onChange={(e) => onRadiusValueChange(e.target.value)}
          className="w-28 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-950">
          Unit
        </label>
        <select
          value={radiusUnit}
          onChange={(e) => onRadiusUnitChange(e.target.value as "ft" | "mi")}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="ft">ft</option>
          <option value="mi">mi</option>
        </select>
      </div>
      <p className="pb-2 text-xs text-gray-500">100 ft&ndash;5 mi</p>
    </div>
  );
}
