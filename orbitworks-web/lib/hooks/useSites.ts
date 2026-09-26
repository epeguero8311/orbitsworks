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
import type { JobSite } from "@/lib/types";

interface GeocodeResult {
  found: boolean;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
}

// Best-effort, Pro only - the callable itself re-checks Pro server-side
// (see geocodeJobSiteAddress), this is just to skip the call entirely for
// Core companies. A failed/not-found lookup is swallowed: the site is
// still saved with its typed address, just without lat/lng, same as any
// site created before this feature existed - distance simply doesn't
// show for it yet (see JobSite in lib/types.ts).
async function geocodeAddress(address: string): Promise<Partial<JobSite>> {
  if (!address) return {};
  try {
    const geocodeFn = httpsCallable(functions, "geocodeJobSiteAddress");
    const result = await geocodeFn({ address });
    const data = result.data as GeocodeResult;
    if (!data.found || data.lat == null || data.lng == null) return {};
    return { lat: data.lat, lng: data.lng, geocodedAddress: data.formattedAddress };
  } catch (err) {
    console.error("Job site geocoding failed:", err);
    return {};
  }
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

  async function addSite(name: string, address: string) {
    if (!userData?.companyId) return;
    const trimmedAddress = address.trim();
    const geocoded = isProPlan(planTier) ? await geocodeAddress(trimmedAddress) : {};

    const sitesRef = collection(
      db,
      "companies",
      userData.companyId,
      "jobSites"
    );
    await addDoc(sitesRef, {
      name: name.trim(),
      address: trimmedAddress,
      active: true,
      createdAt: serverTimestamp(),
      ...geocoded,
    });
  }

  async function updateSite(siteId: string, name: string, address: string) {
    if (!userData?.companyId) return;
    const trimmedAddress = address.trim();
    const geocoded = isProPlan(planTier) ? await geocodeAddress(trimmedAddress) : {};

    const siteRef = doc(db, "companies", userData.companyId, "jobSites", siteId);
    await updateDoc(siteRef, {
      name: name.trim(),
      address: trimmedAddress,
      // A cleared address means no coordinates either - don't leave a
      // stale lat/lng pointing at whatever the address used to be.
      lat: geocoded.lat ?? null,
      lng: geocoded.lng ?? null,
      geocodedAddress: geocoded.geocodedAddress ?? null,
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

  return { sites, loading, addSite, updateSite, toggleSiteActive, deleteSite };
}
