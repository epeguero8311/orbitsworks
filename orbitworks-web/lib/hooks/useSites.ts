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
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { isProPlan } from "@/lib/stripe/tiers";
import { feetToMeters, milesToMeters } from "@/lib/geo";
import type { JobSite } from "@/lib/types";
import type { JobSiteInput } from "@/lib/validators/site";

// Produced only by a verified Google Places pick (AddressAutocomplete.tsx +
// app/api/places/details/route.ts) - never derived from free-typed text.
export interface PickedLocation {
  placeId: string;
  lat: number;
  lng: number;
  geocodedAddress: string;
}

// Thrown by addSite/updateSite when geofencing is being turned on but no
// verified location is available (the address was never picked from Places
// autocomplete, and - for an edit - the site doesn't already have saved
// coordinates from before this feature existed). Callers (SitesSection.tsx,
// useEditSiteModal.ts) show err.message directly.
export class AddressNotVerifiedError extends Error {}

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

  const isPro = isProPlan(planTier);

  async function addSite(input: JobSiteInput, location: PickedLocation | null) {
    if (!userData?.companyId) return;
    const trimmedAddress = (input.address ?? "").trim();
    const requireGeofence = input.requireGeofence && isPro;

    if (requireGeofence && !location) {
      throw new AddressNotVerifiedError("Pick a verified address to enable geofencing.");
    }

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
      requireGeofence,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      geocodedAddress: location?.geocodedAddress ?? null,
      placeId: location?.placeId ?? null,
      ...(requireGeofence
        ? { radiusMeters: radiusMetersFrom(input), radiusUnit: input.radiusUnit }
        : {}),
    });
  }

  async function updateSite(
    siteId: string,
    input: JobSiteInput,
    location: PickedLocation | null
  ) {
    if (!userData?.companyId) return;
    const trimmedAddress = (input.address ?? "").trim();
    const requireGeofence = input.requireGeofence && isPro;
    const existing = sites.find((s) => s.id === siteId);
    const hasExistingCoords = existing?.lat != null && existing?.lng != null;

    if (requireGeofence && !location && !hasExistingCoords) {
      throw new AddressNotVerifiedError("Pick a verified address to enable geofencing.");
    }

    const siteRef = doc(db, "companies", userData.companyId, "jobSites", siteId);
    await updateDoc(siteRef, {
      name: input.name.trim(),
      address: trimmedAddress,
      requireGeofence,
      // A fresh pick overwrites the saved location. No fresh pick and the
      // address was cleared - drop any stale coordinates so they don't keep
      // pointing at whatever the address used to be. No fresh pick and the
      // address is unchanged (including a legacy typed address that
      // predates verified picking) - leave whatever's already saved alone,
      // the same field-omission trick used for radiusMeters/radiusUnit
      // below (Firestore's updateDoc leaves out fields untouched).
      ...(location
        ? {
            lat: location.lat,
            lng: location.lng,
            geocodedAddress: location.geocodedAddress,
            placeId: location.placeId,
          }
        : trimmedAddress === ""
          ? { lat: null, lng: null, geocodedAddress: null, placeId: null }
          : {}),
      // Only written when geofencing is on. Omitting the keys entirely
      // when it's off - rather than nulling them - is what makes turning
      // it off keep the saved radius (Firestore's updateDoc leaves out
      // fields untouched), and what stops a site that's simply never had
      // geofencing on from picking up a radius it doesn't use (that
      // radius silently affects this site's proximity labels in Time
      // Tracking even with geofencing off - see EventLocation.tsx).
      ...(requireGeofence
        ? { radiusMeters: radiusMetersFrom(input), radiusUnit: input.radiusUnit }
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
    isPro,
    addSite,
    updateSite,
    toggleSiteActive,
    deleteSite,
  };
}
