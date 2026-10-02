"use client";

import { useState, FormEvent } from "react";
import { useSites, AddressNotVerifiedError, type PickedLocation } from "@/lib/hooks/useSites";
import { Toggle } from "@/components/dashboard/settings/Toggle";
import { EditSiteModal } from "@/components/dashboard/sites/EditSiteModal";
import { ProBadgeLink, RadiusFields } from "@/components/dashboard/sites/GeofenceFields";
import { AddressAutocomplete, type PickedAddress } from "@/components/dashboard/sites/AddressAutocomplete";
import { jobSiteSchema } from "@/lib/validators/site";
import { formatGeofenceRadius, DEFAULT_GEOFENCE_RADIUS_FT } from "@/lib/geo";
import type { JobSite } from "@/lib/types";

export default function SitesSection() {
  const {
    sites,
    loading: sitesLoading,
    isPro,
    addSite,
    updateSite,
    toggleSiteActive,
    deleteSite,
  } = useSites();

  const sortedSites = [...sites].sort(
    (a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0)
  );

  // Auto-detection (clockEvents.ts's detectSite) compares a clock-in's
  // location against every active site that has saved coordinates,
  // geofenced or not - geofencing only controls whether being outside a
  // site's radius blocks/flags the clock-in, not whether the site can be
  // matched at all. A site with no saved lat/lng (a typed address that was
  // never picked from the autocomplete suggestions, or a pre-Places-era
  // legacy address) is the one case that's still invisible to detection.
  const sitesMissingCoordinates = sites.filter(
    (s) => s.active && s.address && (s.lat == null || s.lng == null)
  );
  const hasMixedGeofencing = isPro && sitesMissingCoordinates.length > 0;

  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [addressVerified, setAddressVerified] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const [requireGeofence, setRequireGeofence] = useState(false);
  const [radiusValue, setRadiusValue] = useState(String(DEFAULT_GEOFENCE_RADIUS_FT));
  const [radiusUnit, setRadiusUnit] = useState<"ft" | "mi">("ft");
  const [isSubmittingSite, setIsSubmittingSite] = useState(false);
  const [siteError, setSiteError] = useState("");

  const [editingSiteRef, setEditingSiteRef] = useState<JobSite | null>(null);
  // Re-resolved against the live list on every render so the modal stays
  // in sync if the doc changes underneath it (e.g. Deactivate clicked in
  // the row while the modal happens to be open); falls back to the
  // captured reference for the brief window right after a delete, before
  // onClose has cleared editingSiteRef.
  const siteForModal = editingSiteRef
    ? sites.find((s) => s.id === editingSiteRef.id) ?? editingSiteRef
    : null;

  function handleAddressTextChange(text: string) {
    setSiteAddress(text);
    setAddressVerified(false);
    setPickedLocation(null);
  }

  function handleAddressSelect(picked: PickedAddress) {
    setSiteAddress(picked.address);
    setAddressVerified(true);
    setPickedLocation({ placeId: picked.placeId, lat: picked.lat, lng: picked.lng, geocodedAddress: picked.address });
  }

  async function handleAddSite(e: FormEvent) {
    e.preventDefault();
    setSiteError("");

    if (isPro && siteAddress.trim() && !addressVerified) {
      setSiteError("Pick an address from the suggestions.");
      return;
    }

    const parsed = jobSiteSchema.safeParse({
      name: siteName,
      address: siteAddress,
      requireGeofence,
      radiusValue: Number(radiusValue),
      radiusUnit,
    });
    if (!parsed.success) {
      setSiteError(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }

    setIsSubmittingSite(true);
    try {
      await addSite(parsed.data, pickedLocation);
      setSiteName("");
      setSiteAddress("");
      setAddressVerified(false);
      setPickedLocation(null);
      setRequireGeofence(false);
      setRadiusValue(String(DEFAULT_GEOFENCE_RADIUS_FT));
      setRadiusUnit("ft");
    } catch (err) {
      console.error("Add site error:", err);
      setSiteError(
        err instanceof AddressNotVerifiedError ? err.message : "Couldn't add the site. Try again."
      );
    } finally {
      setIsSubmittingSite(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-gray-950">Sites</h2>
      <p className="mt-1 text-sm text-gray-600">
        The locations employees can be assigned to.
      </p>

      <form
        onSubmit={handleAddSite}
        className="mt-4 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="siteName" className="mb-1.5 block text-sm font-medium text-gray-950">
              Site name
            </label>
            <input
              id="siteName"
              type="text"
              required
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="Downtown Warehouse"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="siteAddress" className="mb-1.5 block text-sm font-medium text-gray-950">
              Address{!requireGeofence && " (optional)"}
            </label>
            {isPro ? (
              <AddressAutocomplete
                id="siteAddress"
                value={siteAddress}
                verified={addressVerified}
                required={requireGeofence}
                placeholder="123 Main St"
                onTextChange={handleAddressTextChange}
                onSelect={handleAddressSelect}
              />
            ) : (
              <input
                id="siteAddress"
                type="text"
                required={requireGeofence}
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="123 Main St"
              />
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-1">
          <Toggle
            label="Require geofence"
            description="Employees must be within the radius below to clock in at this site."
            checked={requireGeofence}
            onChange={isPro ? setRequireGeofence : () => {}}
            disabled={!isPro}
            badge={!isPro && <ProBadgeLink />}
          />
          {requireGeofence && (
            <RadiusFields
              radiusValue={radiusValue}
              radiusUnit={radiusUnit}
              onRadiusValueChange={setRadiusValue}
              onRadiusUnitChange={setRadiusUnit}
            />
          )}
        </div>

        <div>
          <button
            type="submit"
            disabled={isSubmittingSite}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isSubmittingSite ? "Adding..." : "Add site"}
          </button>
        </div>
      </form>
      {siteError && <p className="mt-2 text-sm text-red-600">{siteError}</p>}

      {hasMixedGeofencing && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <p className="font-medium">Some active sites are missing saved coordinates</p>
          <p className="mt-1 text-amber-800">
            Clock-ins are matched to a site automatically by location, which needs a verified
            address - a typed address that was never picked from the suggestions can&apos;t be
            matched this way. Re-save the address for{" "}
            {sitesMissingCoordinates.map((s) => s.name).join(", ")} by picking it from the
            suggestions to fix this.
          </p>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {sitesLoading ? (
          <p className="p-4 text-sm text-gray-600">Loading...</p>
        ) : sites.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No sites yet. Add one above to get started.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Geofence</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sortedSites.map((site) => (
                <tr key={site.id} className="border-b border-gray-200 last:border-0">
                  <td className="px-4 py-2.5 text-gray-950">{site.name}</td>
                  <td
                    className={
                      site.active && site.address && (site.lat == null || site.lng == null)
                        ? "px-4 py-2.5 font-medium text-amber-700"
                        : "px-4 py-2.5 text-gray-600"
                    }
                  >
                    {site.address || "-"}
                    {site.active && site.address && (site.lat == null || site.lng == null)
                      ? " - no saved coordinates"
                      : ""}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        site.active
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {site.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {site.requireGeofence
                      ? `On - ${formatGeofenceRadius(site.radiusMeters ?? 0, site.radiusUnit)}`
                      : "Off"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setEditingSiteRef(site)}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleSiteActive(site)}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        {site.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {siteForModal && (
        <EditSiteModal
          site={siteForModal}
          isPro={isPro}
          updateSite={updateSite}
          deleteSite={deleteSite}
          onClose={() => setEditingSiteRef(null)}
        />
      )}
    </section>
  );
}
