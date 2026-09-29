"use client";

import { useEditSiteModal } from "@/lib/hooks/useEditSiteModal";
import { Toggle } from "@/components/dashboard/settings/Toggle";
import { ProBadgeLink, RadiusFields } from "@/components/dashboard/sites/GeofenceFields";
import { AddressAutocomplete } from "@/components/dashboard/sites/AddressAutocomplete";
import ConfirmModal from "@/components/dashboard/billing/ConfirmModal";
import { buildGoogleMapsUrl, buildGoogleMapsSearchUrl } from "@/lib/geo";
import type { JobSite } from "@/lib/types";
import type { JobSiteInput } from "@/lib/validators/site";
import type { PickedLocation } from "@/lib/hooks/useSites";

export function EditSiteModal({
  site,
  isPro,
  updateSite,
  deleteSite,
  onClose,
}: {
  site: JobSite;
  isPro: boolean;
  updateSite: (siteId: string, input: JobSiteInput, location: PickedLocation | null) => Promise<void>;
  deleteSite: (siteId: string) => Promise<void>;
  onClose: () => void;
}) {
  const m = useEditSiteModal({ site, isPro, updateSite, deleteSite, onClose });

  // Reflects the site's saved address/coordinates, not whatever's
  // currently typed in the (possibly unsaved) form fields below.
  const mapsUrl = site.address
    ? site.lat != null && site.lng != null
      ? buildGoogleMapsUrl(site.lat, site.lng)
      : buildGoogleMapsSearchUrl(site.address)
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
        onClick={m.requestClose}
      >
        <div
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-start justify-between">
            <h2 className="text-xl font-semibold text-gray-950">Edit site</h2>
            <button
              onClick={m.requestClose}
              className="text-sm text-gray-600 hover:text-gray-950"
              aria-label="Close"
            >
              Close
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="editSiteName"
                className="mb-1.5 block text-sm font-medium text-gray-950"
              >
                Site name
              </label>
              <input
                id="editSiteName"
                type="text"
                value={m.name}
                onChange={(e) => m.setName(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              {m.fieldErrors.name?.[0] && (
                <p className="mt-1 text-xs text-red-600">{m.fieldErrors.name[0]}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="editSiteAddress"
                className="mb-1.5 block text-sm font-medium text-gray-950"
              >
                Address{!m.requireGeofence && " (optional)"}
              </label>
              {isPro ? (
                <AddressAutocomplete
                  id="editSiteAddress"
                  value={m.address}
                  verified={m.addressVerified}
                  required={m.requireGeofence}
                  onTextChange={m.handleAddressTextChange}
                  onSelect={m.handleAddressSelect}
                />
              ) : (
                <input
                  id="editSiteAddress"
                  type="text"
                  value={m.address}
                  onChange={(e) => m.handleAddressTextChange(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              )}
              {m.fieldErrors.address?.[0] && (
                <p className="mt-1 text-xs text-red-600">{m.fieldErrors.address[0]}</p>
              )}
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-xs font-medium text-accent hover:underline"
                >
                  View on map
                </a>
              )}
            </div>

            <div className="border-t border-gray-200 pt-1">
              <Toggle
                label="Require geofence"
                description="Employees must be within the radius below to clock in at this site."
                checked={m.requireGeofence}
                onChange={m.setRequireGeofence}
                disabled={!isPro}
                badge={!isPro && <ProBadgeLink />}
              />
              {m.requireGeofence && (
                <>
                  <RadiusFields
                    radiusValue={m.radiusValue}
                    radiusUnit={m.radiusUnit}
                    onRadiusValueChange={m.setRadiusValue}
                    onRadiusUnitChange={m.setRadiusUnit}
                  />
                  {m.fieldErrors.radiusValue?.[0] && (
                    <p className="mt-1 text-xs text-red-600">{m.fieldErrors.radiusValue[0]}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    Workers must be within {m.radiusValue || 0} {m.radiusUnit} of this address to
                    clock in.
                  </p>
                </>
              )}
            </div>
          </div>

          {m.saveError && <p className="mt-4 text-sm text-red-600">{m.saveError}</p>}

          <div className="mt-6 flex items-center justify-between gap-3">
            <div>
              {!m.confirmingDelete ? (
                <button
                  onClick={() => m.setConfirmingDelete(true)}
                  className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:border-red-300 hover:bg-red-50"
                >
                  Delete site
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
                  <span className="text-xs text-red-800">
                    Delete this site? This can&apos;t be undone.
                  </span>
                  <button
                    onClick={() => m.setConfirmingDelete(false)}
                    disabled={m.isDeleting}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-950 hover:border-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={m.handleDelete}
                    disabled={m.isDeleting}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {m.isDeleting ? "Deleting..." : "Yes, delete"}
                  </button>
                </div>
              )}
              {m.deleteError && <p className="mt-2 text-xs text-red-600">{m.deleteError}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={m.requestClose}
                className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-950 hover:border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={m.handleSave}
                disabled={!m.isValid || m.isSaving}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {m.isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {m.confirmingDiscard && (
        <ConfirmModal
          title="Discard changes?"
          message="You have unsaved changes. Are you sure you want to discard them?"
          confirmLabel="Discard"
          onCancel={m.cancelDiscard}
          onConfirm={m.confirmDiscard}
          isDanger
        />
      )}
    </>
  );
}
