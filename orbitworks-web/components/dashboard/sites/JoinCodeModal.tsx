"use client";

import { useState, FormEvent } from "react";
import { AddressAutocomplete, type PickedAddress } from "@/components/dashboard/sites/AddressAutocomplete";
import { AddressNotVerifiedError, type PickedLocation } from "@/lib/hooks/useSites";
import { jobSiteSchema, type JobSiteInput } from "@/lib/validators/site";
import { joinCodeCreateSchema, joinCodeUpdateSchema, withActiveCap, type JoinCodeCreateInput } from "@/lib/validators/joinCode";
import { companyLocalToIso, msToCompanyLocal } from "@/lib/joinCodes/time";
import { DEFAULT_GEOFENCE_RADIUS_FT } from "@/lib/geo";
import type { JobSite, JoinCodeListItem, Subcontractor } from "@/lib/types";

const NEW_SITE = "__new__";
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
  onSave: (input: JoinCodeCreateInput, token: string | null) => Promise<void>;
  onClose: () => void;
}

export function JoinCodeModal({ code, sites, subcontractors, activeCap, seatsLeft, addSite, onSave, onClose }: JoinCodeModalProps) {
  const [name, setName] = useState(code?.name ?? "");
  const [siteId, setSiteId] = useState(code?.siteId ?? "");
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newSiteLocation, setNewSiteLocation] = useState<PickedLocation | null>(null);
  const [subIds, setSubIds] = useState<string[]>(code?.subcontractorIds ?? []);
  const [locationRequired, setLocationRequired] = useState(code?.locationRequired ?? false);
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

  function handleAddressSelect(picked: PickedAddress) {
    setNewSiteAddress(picked.address);
    setNewSiteLocation({ placeId: picked.placeId, lat: picked.lat, lng: picked.lng, geocodedAddress: picked.address });
  }

  // Inline site creation goes through the same useSites().addSite path as
  // the Sites form (geofencing off - that's Phase 8 for codes).
  async function createSiteInline(): Promise<string> {
    if (newSiteAddress.trim() && !newSiteLocation) throw new AddressNotVerifiedError("Pick an address from the suggestions.");
    const parsed = jobSiteSchema.safeParse({
      name: newSiteName,
      address: newSiteAddress,
      requireGeofence: false,
      radiusValue: DEFAULT_GEOFENCE_RADIUS_FT,
      radiusUnit: "ft",
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
    const draft = { name, siteId: siteId === NEW_SITE ? "pending" : siteId, subcontractorIds: subIds, locationRequired, userLimit: limit, expiresAt };

    const schema = code ? withActiveCap(joinCodeUpdateSchema, activeCap) : withActiveCap(joinCodeCreateSchema, activeCap);
    const check = schema.safeParse(code ? { ...draft, token: code.token } : draft);
    if (!check.success) return setError(check.error.issues[0]?.message ?? "Invalid input.");

    setSaving(true);
    try {
      const finalSiteId = siteId === NEW_SITE ? await createSiteInline() : siteId;
      await onSave({ ...draft, siteId: finalSiteId }, code?.token ?? null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the QR code. Try again.");
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
          <h2 className="text-xl font-semibold text-gray-950">{code ? "Edit QR code" : "Create QR code"}</h2>
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
            <label htmlFor="jcSite" className={labelClass}>Job site</label>
            <select id="jcSite" required value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputClass}>
              <option value="" disabled>Pick a job site</option>
              {siteOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (inactive)"}</option>
              ))}
              <option value={NEW_SITE}>+ New job site</option>
            </select>
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

          <fieldset>
            <legend className={labelClass}>Location</legend>
            <div className="flex gap-4 text-sm text-gray-950">
              <label className="flex items-center gap-2">
                <input type="radio" name="jcLocation" checked={locationRequired} onChange={() => setLocationRequired(true)} />
                Required
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="jcLocation" checked={!locationRequired} onChange={() => setLocationRequired(false)} />
                Optional
              </label>
            </div>
          </fieldset>

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
            {saving ? "Saving..." : code ? "Save changes" : "Create QR code"}
          </button>
        </div>
      </form>
    </div>
  );
}
