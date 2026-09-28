"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { isProPlan } from "@/lib/stripe/tiers";
import { feetToMeters, milesToMeters } from "@/lib/geo";
import type { JobSite } from "@/lib/types";
import type { JobSiteInput } from "@/lib/validators/site";

interface GeocodeResult {
  found: boolean;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
}

// Thrown by addSite/updateSite when requireGeofence is on and the address
// couldn't be geocoded - callers (SitesSection.tsx) show err.message
// directly, same pattern as ClockValidationError in useClockEvents.ts.
export class AddressNotFoundError extends Error {}

async function callGeocode(address: string): Promise<GeocodeResult | null> {
  try {
    const geocodeFn = httpsCallable(functions, "geocodeJobSiteAddress");
    const result = await geocodeFn({ address });
    return result.data as GeocodeResult;
  } catch (err) {
    console.error("Job site geocoding failed:", err);
    return null;
  }
}

// Best-effort, Pro only - the callable itself re-checks Pro server-side
// (see geocodeJobSiteAddress), this is just to skip the call entirely for
// Core companies. A failed/not-found lookup is swallowed: the site is
// still saved with its typed address, just without lat/lng, same as any
// site created before this feature existed - distance simply doesn't
// show for it yet (see JobSite in lib/types.ts).
interface GeocodedLocation {
  lat?: number;
  lng?: number;
  geocodedAddress?: string;
}

async function geocodeAddress(address: string): Promise<GeocodedLocation> {
  if (!address) return {};
  const data = await callGeocode(address);
  if (!data?.found || data.lat == null || data.lng == null) return {};
  return { lat: data.lat, lng: data.lng, geocodedAddress: data.formattedAddress };
}

// Geofencing requires a resolved location - unlike geocodeAddress above,
// a not-found/failed lookup here blocks the save (see AddressNotFoundError)
// instead of silently saving without coordinates.
async function geocodeAddressForGeofence(address: string): Promise<GeocodedLocation> {
  const data = await callGeocode(address);
  if (!data?.found || data.lat == null || data.lng == null) {
    throw new AddressNotFoundError("Couldn't find that address");
  }
  return { lat: data.lat, lng: data.lng, geocodedAddress: data.formattedAddress };
}

function radiusMetersFrom(input: JobSiteInput): number {
  return input.radiusUnit === "mi"
    ? milesToMeters(input.radiusValue)
    : feetToMeters(input.radiusValue);
}

export function useSites() {
  const { userData } = useAuth();
  const [sites, setSites] = useState<JobSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [planTier, setPlanTier] = useState<string | null>(null);

  useEffect(() => {
    if (!userData?.companyId) return;

    const sitesRef = collection(
      db,
      "companies",
      userData.companyId,
      "jobSites"
    );
    const q = query(sitesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSites(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<JobSite, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Sites listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      setPlanTier(snapshot.exists() ? snapshot.data().planTier ?? null : null);
    });
    return unsubscribe;
  }, [userData?.companyId]);

  type GeofenceFields =
    | {
        requireGeofence: true;
        radiusMeters: number;
        radiusUnit: "ft" | "mi";
        lat?: number;
        lng?: number;
        geocodedAddress?: string;
      }
    | { requireGeofence: false; lat?: number; lng?: number; geocodedAddress?: string };

  // Core companies can never actually submit requireGeofence: true (the
  // toggle is disabled in SitesSection.tsx), but the hook re-checks Pro
  // itself rather than trusting the caller, same spirit as the callable
  // re-checking Pro server-side in geocodeJobSiteAddress. Deliberately
  // omits radiusMeters/radiusUnit from the off-branch (rather than
  // setting them to a default) - see updateSite for why.
  async function resolveGeofenceFields(
    input: JobSiteInput,
    trimmedAddress: string
  ): Promise<GeofenceFields> {
    const requireGeofence = input.requireGeofence && isProPlan(planTier);

    if (requireGeofence) {
      const geocoded = await geocodeAddressForGeofence(trimmedAddress);
      return {
        requireGeofence: true,
        radiusMeters: radiusMetersFrom(input),
        radiusUnit: input.radiusUnit,
        ...geocoded,
      };
    }

    const geocoded = isProPlan(planTier) ? await geocodeAddress(trimmedAddress) : {};
    return { requireGeofence: false, ...geocoded };
  }

  async function addSite(input: JobSiteInput) {
    if (!userData?.companyId) return;
    const trimmedAddress = (input.address ?? "").trim();
    const geofenceFields = await resolveGeofenceFields(input, trimmedAddress);

    const sitesRef = collection(
      db,
      "companies",
      userData.companyId,
      "jobSites"
    );
    await addDoc(sitesRef, {
      name: input.name.trim(),
      address: trimmedAddress,
      active: true,
      createdAt: serverTimestamp(),
      ...geofenceFields,
    });
  }

  async function updateSite(siteId: string, input: JobSiteInput) {
    if (!userData?.companyId) return;
    const trimmedAddress = (input.address ?? "").trim();
    const geofenceFields = await resolveGeofenceFields(input, trimmedAddress);

    const siteRef = doc(db, "companies", userData.companyId, "jobSites", siteId);
    await updateDoc(siteRef, {
      name: input.name.trim(),
      address: trimmedAddress,
      // A cleared address means no coordinates either - don't leave a
      // stale lat/lng pointing at whatever the address used to be.
      lat: geofenceFields.lat ?? null,
      lng: geofenceFields.lng ?? null,
      geocodedAddress: geofenceFields.geocodedAddress ?? null,
      requireGeofence: geofenceFields.requireGeofence,
      // Only written when geofencing is on. Omitting the keys entirely
      // when it's off - rather than nulling them - is what makes turning
      // it off keep the saved radius (Firestore's updateDoc leaves out
      // fields untouched), and what stops a site that's simply never had
      // geofencing on from picking up a radius it doesn't use (that
      // radius silently affects this site's proximity labels in Time
      // Tracking even with geofencing off - see EventLocation.tsx).
      ...(geofenceFields.requireGeofence
        ? { radiusMeters: geofenceFields.radiusMeters, radiusUnit: geofenceFields.radiusUnit }
        : {}),
    });
  }

  async function toggleSiteActive(site: JobSite) {
    if (!userData?.companyId) return;
    const siteRef = doc(db, "companies", userData.companyId, "jobSites", site.id);
    await updateDoc(siteRef, { active: !site.active });
  }

  async function deleteSite(siteId: string) {
    if (!userData?.companyId) return;
    const siteRef = doc(db, "companies", userData.companyId, "jobSites", siteId);
    await deleteDoc(siteRef);
  }

  return {
    sites,
    loading,
    isPro: isProPlan(planTier),
    addSite,
    updateSite,
    toggleSiteActive,
    deleteSite,
  };
}
