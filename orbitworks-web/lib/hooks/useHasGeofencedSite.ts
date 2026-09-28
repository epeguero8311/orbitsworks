"use client";

import { useEffect, useState } from "react";
import { collection, query, where, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

// Whether any of this company's job sites currently have geofencing on -
// used to show a hint in Settings > Geofencing when there's nothing yet
// for the enforcement mode to apply to (see JobSite.requireGeofence).
export function useHasGeofencedSite(): boolean {
  const { userData } = useAuth();
  const [hasGeofencedSite, setHasGeofencedSite] = useState(false);

  useEffect(() => {
    if (!userData?.companyId) return;
    const sitesRef = collection(db, "companies", userData.companyId, "jobSites");
    const q = query(sitesRef, where("requireGeofence", "==", true), limit(1));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setHasGeofencedSite(!snapshot.empty),
      (err) => console.error("Geofenced site check error:", err)
    );
    return unsubscribe;
  }, [userData?.companyId]);

  return hasGeofencedSite;
}
