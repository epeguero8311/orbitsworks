"use client";

import { useEffect, useState } from "react";
import { jobSiteSchema, type JobSiteInput } from "@/lib/validators/site";
import { AddressNotVerifiedError, type PickedLocation } from "@/lib/hooks/useSites";
import { radiusInputFromSite, DEFAULT_GEOFENCE_RADIUS_FT } from "@/lib/geo";
import type { JobSite } from "@/lib/types";
import type { PickedAddress } from "@/components/dashboard/sites/AddressAutocomplete";

interface EditSiteFormState {
  name: string;
  address: string;
  requireGeofence: boolean;
  radiusValue: string;
  radiusUnit: "ft" | "mi";
}

function stateFromSite(site: JobSite): EditSiteFormState {
  const radius = radiusInputFromSite(site);
  return {
    name: site.name,
    address: site.address ?? "",
    requireGeofence: site.requireGeofence ?? false,
    radiusValue: radius.value,
    radiusUnit: radius.unit,
  };
}

export function useEditSiteModal({
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
  // Captured once, on mount - this is the "did anything change" baseline,
  // not re-derived from `site` if the live doc updates underneath the
  // open modal (e.g. someone else edits it). Re-syncing mid-edit would
  // either clobber what the admin is typing or make isDirty lie.
  const [initial] = useState(() => stateFromSite(site));

  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  // A pre-existing saved address is grandfathered as already acceptable
  // (see AddressNotVerifiedError below) - the moment the admin edits that
  // text, this flips false and they have to re-pick from suggestions.
  const [addressVerified, setAddressVerified] = useState(!!initial.address);
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const [requireGeofence, setRequireGeofenceState] = useState(initial.requireGeofence);
  const [radiusValue, setRadiusValue] = useState(initial.radiusValue);
  const [radiusUnit, setRadiusUnit] = useState<"ft" | "mi">(initial.radiusUnit);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  function setRequireGeofence(value: boolean) {
    if (!isPro) return;
    setRequireGeofenceState(value);
    if (value && !radiusValue) {
      setRadiusValue(String(DEFAULT_GEOFENCE_RADIUS_FT));
    }
  }

  function handleAddressTextChange(text: string) {
    setAddress(text);
    setAddressVerified(false);
    setPickedLocation(null);
  }

  function handleAddressSelect(picked: PickedAddress) {
    setAddress(picked.address);
    setAddressVerified(true);
    setPickedLocation({ placeId: picked.placeId, lat: picked.lat, lng: picked.lng, geocodedAddress: picked.address });
  }

  const isDirty =
    name !== initial.name ||
    address !== initial.address ||
    requireGeofence !== initial.requireGeofence ||
    radiusValue !== initial.radiusValue ||
    radiusUnit !== initial.radiusUnit;

  const parsed = jobSiteSchema.safeParse({
    name,
    address,
    requireGeofence,
    radiusValue: Number(radiusValue),
    radiusUnit,
  });
  const fieldErrors = parsed.success ? {} : parsed.error.flatten().fieldErrors;
  const isValid = parsed.success;

  function requestClose() {
    if (isDirty) {
      setConfirmingDiscard(true);
    } else {
      onClose();
    }
  }

  // Esc closes the topmost layer: dismisses the discard prompt if it's
  // open, otherwise attempts to close the modal itself (which may open
  // that same prompt).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmingDiscard) {
        setConfirmingDiscard(false);
        return;
      }
      if (isDirty) {
        setConfirmingDiscard(true);
      } else {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, confirmingDiscard, onClose]);

  function confirmDiscard() {
    setConfirmingDiscard(false);
    onClose();
  }

  function cancelDiscard() {
    setConfirmingDiscard(false);
  }

  async function handleSave() {
    if (!parsed.success) return;
    if (isPro && address.trim() && !addressVerified) {
      setSaveError("Pick an address from the suggestions.");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      await updateSite(site.id, parsed.data, pickedLocation);
      onClose();
    } catch (err) {
      console.error("Edit site error:", err);
      setSaveError(
        err instanceof AddressNotVerifiedError ? err.message : "Couldn't save changes. Try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteSite(site.id);
      onClose();
    } catch (err) {
      console.error("Delete site error:", err);
      setDeleteError("Couldn't delete the site. Try again.");
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return {
    name,
    setName,
    address,
    addressVerified,
    handleAddressTextChange,
    handleAddressSelect,
    requireGeofence,
    setRequireGeofence,
    radiusValue,
    setRadiusValue,
    radiusUnit,
    setRadiusUnit,
    fieldErrors,
    isValid,
    isSaving,
    saveError,
    handleSave,
    confirmingDelete,
    setConfirmingDelete,
    isDeleting,
    deleteError,
    handleDelete,
    confirmingDiscard,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  };
}
