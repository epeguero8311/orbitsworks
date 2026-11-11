"use client";

import { useState, FormEvent } from "react";
import { AddressAutocomplete, type PickedAddress } from "@/components/dashboard/sites/AddressAutocomplete";
import { AddressNotVerifiedError, type PickedLocation } from "@/lib/hooks/useSites";
import { jobSiteSchema, type JobSiteInput } from "@/lib/validators/site";
import { joinCodeCreateSchema, joinCodeUpdateSchema, withActiveCap, type JoinCodeCreateInput } from "@/lib/validators/joinCode";
import { companyLocalToIso, msToCompanyLocal } from "@/lib/joinCodes/time";
import type { JobSite, JoinCodeListItem, Subcontractor } from "@/lib/types";
import { JoinCodeGeofence, GEOFENCE_DRAFT_OFF, geofenceDraftChanged, geofenceDraftFor, type GeofenceDraft } from "@/components/dashboard/sites/JoinCodeGeofence";

const NEW_SITE = "__new__";
const NO_SITE = "__none__";
const inputClass =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-950";

interface JoinCodeModalProps {
  code: JoinCodeListItem | null; // null = create
  sites: JobSite[];
  subcontractors: Subcontractor[];
  activeCap: number | null;
  seatsLeft: number | null;
  addSite: (input: JobSiteInput, location: PickedLocation | null) => Promise<string | undefined>;
  // Phase 8 (D2): the code's site geofence is saved onto the site itself.
  updateSite: (siteId: string, input: JobSiteInput, location: PickedLocation | null) => Promise<void>;
  onSave: (input: JoinCodeCreateInput, token: string | null) => Promise<void>;
  onClose: () => void;
}

export function JoinCodeModal({ code, sites, subcontractors, activeCap, seatsLeft, addSite, updateSite, onSave, onClose }: JoinCodeModalProps) {
  const [name, setName] = useState(code?.name ?? "");
  // "" = not picked yet (new code); NO_SITE = "No job site" picked on purpose.
  const [siteId, setSiteId] = useState(code ? code.siteId ?? NO_SITE : "");
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newSiteLocation, setNewSiteLocation] = useState<PickedLocation | null>(null);
  const [subIds, setSubIds] = useState<string[]>(code?.subcontractorIds ?? []);
  // The job site's own geofence (D2), reset whenever another site is picked.
  const [geofence, setGeofence] = useState<GeofenceDraft>(() => geofenceDraftFor(sites.find((s) => s.id === code?.siteId)));
  const [userLimit, setUserLimit] = useState(code?.userLimit != null ? String(code.userLimit) : "");
  const [expiresLocal, setExpiresLocal] = useState(code?.expiresAt != null ? msToCompanyLocal(code.expiresAt) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Active sites/subs, plus whatever an edited code already points at.
  const siteOptions = sites.filter((s) => s.active || s.id === code?.siteId);
  const subOptions = subcontractors.filter((s) => s.active || code?.subcontractorIds.includes(s.id));

  function toggleSub(id: string) {
    setSubIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const pickedSite = sites.find((s) => s.id === siteId);

  function pickSite(id: string) {
    setSiteId(id);
    setGeofence(id === NEW_SITE ? GEOFENCE_DRAFT_OFF : geofenceDraftFor(sites.find((s) => s.id === id)));
  }

  // An existing site whose geofence the admin changed: saved onto the site
  // (same useSites().updateSite path as the Sites page) before the code.
  async function saveSiteGeofence(site: JobSite) {
    if (!geofenceDraftChanged(site, geofence)) return;
    const parsed = jobSiteSchema.safeParse({
      name: site.name,
      address: site.address ?? "",
      requireGeofence: geofence.on,
      radiusValue: Number(geofence.radiusValue),
      radiusUnit: geofence.radiusUnit,
    });
    if (!parsed.success) throw new AddressNotVerifiedError(parsed.error.issues[0]?.message ?? "Invalid geofence.");
    await updateSite(site.id, parsed.data, null);
  }

  function handleAddressSelect(picked: PickedAddress) {
    setNewSiteAddress(picked.address);
    setNewSiteLocation({ placeId: picked.placeId, lat: picked.lat, lng: picked.lng, geocodedAddress: picked.address });
  }

  // Inline site creation goes through the same useSites().addSite path as
  // the Sites form, with the geofence set here (Phase 8, D2).
  async function createSiteInline(): Promise<string> {
    if (newSiteAddress.trim() && !newSiteLocation) throw new AddressNotVerifiedError("Pick an address from the suggestions.");
    const parsed = jobSiteSchema.safeParse({
      name: newSiteName,
      address: newSiteAddress,
      requireGeofence: geofence.on,
      radiusValue: Number(geofence.radiusValue),
      radiusUnit: geofence.radiusUnit,
    });
    if (!parsed.success) throw new AddressNotVerifiedError(parsed.error.issues[0]?.message ?? "Invalid site.");
    const id = await addSite(parsed.data, newSiteLocation);
    if (!id) throw new Error("Couldn't create the job site.");
    // Select it, so a retry after a failed save doesn't create it twice.
    setSiteId(id);
    return id;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const expiresAt = expiresLocal ? companyLocalToIso(expiresLocal) : null;
    if (expiresLocal && !expiresAt) return setError("Pick a valid expiry date and time.");
    const limitText = userLimit.trim();
    const limit = limitText === "" ? null : Number(limitText);
    if (siteId === "") return setError("Pick a job site, or choose No job site.");
    const draft = { name, siteId: siteId === NEW_SITE ? "pending" : siteId === NO_SITE ? null : siteId, subcontractorIds: subIds, userLimit: limit, expiresAt };

    const schema = code ? withActiveCap(joinCodeUpdateSchema, activeCap) : withActiveCap(joinCodeCreateSchema, activeCap);
    const check = schema.safeParse(code ? { ...draft, token: code.token } : draft);
    if (!check.success) return setError(check.error.issues[0]?.message ?? "Invalid input.");

    setSaving(true);
    try {
      if (siteId !== NEW_SITE && pickedSite) await saveSiteGeofence(pickedSite);
      const finalSiteId = siteId === NEW_SITE ? await createSiteInline() : draft.siteId;
      await onSave({ ...draft, siteId: finalSiteId }, code?.token ?? null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the crew code. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={saving ? undefined : onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
      >
        <div className="mb-5 flex items-start justify-between">
          <h2 className="text-xl font-semibold text-gray-950">{code ? "Edit crew code" : "Create crew code"}</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-950" aria-label="Close">
            Close
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="jcName" className={labelClass}>Name</label>
            <input id="jcName" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Front gate" />
          </div>

          <div>
            <label htmlFor="jcSite" className={labelClass}>Job site (optional)</label>
            <select id="jcSite" required value={siteId} onChange={(e) => pickSite(e.target.value)} className={inputClass}>
              <option value="" disabled>Pick a job site</option>
              <option value={NO_SITE}>No job site</option>
              {siteOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (inactive)"}</option>
              ))}
              <option value={NEW_SITE}>+ New job site</option>
            </select>
            {siteId === NO_SITE && (
              <p className="mt-1 text-xs text-gray-600">People who join get no assigned job site. You can assign one later on the Employees page.</p>
            )}
            {siteId === NEW_SITE && (
              <div className="mt-3 flex flex-col gap-3 rounded-md border border-gray-200 p-3">
                <div>
                  <label htmlFor="jcNewSiteName" className={labelClass}>New site name</label>
                  <input id="jcNewSiteName" required value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} className={inputClass} placeholder="Downtown Warehouse" />
                </div>
                <div>
                  <label htmlFor="jcNewSiteAddress" className={labelClass}>Address (optional)</label>
                  <AddressAutocomplete
                    id="jcNewSiteAddress"
                    value={newSiteAddress}
                    verified={newSiteLocation !== null}
                    placeholder="123 Main St"
                    onTextChange={(t) => {
                      setNewSiteAddress(t);
                      setNewSiteLocation(null);
                    }}
                    onSelect={handleAddressSelect}
                  />
                </div>
              </div>
            )}
          </div>

          <fieldset>
            <legend className={labelClass}>Subcontractors (optional)</legend>
            <p className="mb-2 text-xs text-gray-600">
              None picked = in-house employees only. Picked = in-house or one of these.
            </p>
            {subOptions.length === 0 ? (
              <p className="text-sm text-gray-600">No active subcontractors.</p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-md border border-gray-200 p-3">
                {subOptions.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-gray-950">
                    <input type="checkbox" checked={subIds.includes(s.id)} onChange={() => toggleSub(s.id)} />
                    {s.name}{s.active ? "" : " (inactive)"}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {siteId !== "" && siteId !== NO_SITE && (
            <JoinCodeGeofence
              draft={geofence}
              onChange={setGeofence}
              hasPlace={siteId === NEW_SITE ? newSiteLocation !== null : pickedSite?.lat != null && pickedSite?.lng != null}
              isNewSite={siteId === NEW_SITE}
            />
          )}

          <div>
            <label htmlFor="jcLimit" className={labelClass}>User limit (optional)</label>
            <input
              id="jcLimit"
              type="number"
              min={1}
              max={activeCap ?? undefined}
              step={1}
              value={userLimit}
              onChange={(e) => setUserLimit(e.target.value)}
              className={inputClass}
              placeholder="Blank = no limit"
            />
            <p className="mt-1.5 text-xs text-gray-600">
              {activeCap === null ? "Your plan has no active employee cap." : `${seatsLeft ?? 0} of ${activeCap} active seats left`}
            </p>
          </div>

          <div>
            <label htmlFor="jcExpires" className={labelClass}>Expires (optional, Central time)</label>
            <input id="jcExpires" type="datetime-local" value={expiresLocal} onChange={(e) => setExpiresLocal(e.target.value)} className={inputClass} />
            <p className="mt-1.5 text-xs text-gray-600">Blank = never expires.</p>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-950 hover:border-gray-300 disabled:opacity-60">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
            {saving ? "Saving..." : code ? "Save changes" : "Create crew code"}
          </button>
        </div>
      </form>
    </div>
  );
}
