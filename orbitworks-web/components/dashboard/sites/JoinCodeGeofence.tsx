"use client";

import { Toggle } from "@/components/dashboard/settings/Toggle";
import { GEOFENCE_TOGGLE_DESCRIPTION, GEOFENCE_TOGGLE_LABEL, geofenceRadiusHint, RadiusFields } from "@/components/dashboard/sites/GeofenceFields";
import { DEFAULT_GEOFENCE_RADIUS_FT, radiusInputFromSite } from "@/lib/geo";
import type { JobSite } from "@/lib/types";

// Phase 8 (D2): the crew code modal shows the geofence of the code's job
// site - the SAME requireGeofence + radius as the Sites page, saved onto
// the site itself (one source of truth, never a separate per-code fence).
// Crew codes are Pro only, so there is no Pro gate here.

export interface GeofenceDraft {
  on: boolean;
  radiusValue: string;
  radiusUnit: "ft" | "mi";
}

export const GEOFENCE_DRAFT_OFF: GeofenceDraft = { on: false, radiusValue: String(DEFAULT_GEOFENCE_RADIUS_FT), radiusUnit: "ft" };

// The draft a site starts with (its saved toggle and radius).
export function geofenceDraftFor(site: JobSite | undefined): GeofenceDraft {
  if (!site) return GEOFENCE_DRAFT_OFF;
  const { value, unit } = radiusInputFromSite(site);
  return { on: site.requireGeofence === true, radiusValue: value, radiusUnit: unit };
}

// Did the admin change anything on an existing site.
export function geofenceDraftChanged(site: JobSite, draft: GeofenceDraft): boolean {
  const saved = geofenceDraftFor(site);
  if (saved.on !== draft.on) return true;
  return draft.on && (saved.radiusValue !== draft.radiusValue || saved.radiusUnit !== draft.radiusUnit);
}

interface JoinCodeGeofenceProps {
  draft: GeofenceDraft;
  onChange: (draft: GeofenceDraft) => void;
  // false = the site has no verified place yet (an address picked from the
  // suggestions), so the geofence can't be turned on here.
  hasPlace: boolean;
  isNewSite: boolean;
}

export function JoinCodeGeofence({ draft, onChange, hasPlace, isNewSite }: JoinCodeGeofenceProps) {
  const blocked = !hasPlace && !draft.on;
  return (
    <div className="rounded-md border border-gray-200 px-3">
      <Toggle
        label={GEOFENCE_TOGGLE_LABEL}
        description={GEOFENCE_TOGGLE_DESCRIPTION}
        checked={draft.on}
        onChange={(on) => onChange({ ...draft, on })}
        disabled={blocked}
      />
      {blocked && (
        <p className="pb-3 text-xs text-gray-600">
          {isNewSite ? "Pick the address from the suggestions above to turn this on." : "This site has no verified address yet. Add one on the Sites page to turn this on."}
        </p>
      )}
      {draft.on && (
        <div className="pb-3">
          <RadiusFields
            radiusValue={draft.radiusValue}
            radiusUnit={draft.radiusUnit}
            onRadiusValueChange={(radiusValue) => onChange({ ...draft, radiusValue })}
            onRadiusUnitChange={(radiusUnit) => onChange({ ...draft, radiusUnit })}
          />
          <p className="mt-2 text-xs text-gray-500">{geofenceRadiusHint(draft.radiusValue, draft.radiusUnit)}</p>
          {!isNewSite && <p className="mt-1 text-xs text-gray-500">Saved on the job site - the Sites page shows the same setting.</p>}
        </div>
      )}
    </div>
  );
}
