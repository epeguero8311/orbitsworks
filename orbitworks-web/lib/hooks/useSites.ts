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
import type { JobSite } from "@/lib/types";

export function useSites() {
  const { userData } = useAuth();
  const [sites, setSites] = useState<JobSite[]>([]);
  const [loading, setLoading] = useState(true);

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

  async function addSite(name: string, address: string) {
    if (!userData?.companyId) return;
    const sitesRef = collection(
      db,
      "companies",
      userData.companyId,
      "jobSites"
    );
    await addDoc(sitesRef, {
      name: name.trim(),
      address: address.trim(),
      active: true,
      createdAt: serverTimestamp(),
    });
  }

  async function updateSite(siteId: string, name: string, address: string) {
    if (!userData?.companyId) return;
    const siteRef = doc(db, "companies", userData.companyId, "jobSites", siteId);
    await updateDoc(siteRef, {
      name: name.trim(),
      address: address.trim(),
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
