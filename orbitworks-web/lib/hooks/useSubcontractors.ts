"use client";
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { Subcontractor } from "@/lib/types";

export interface SubcontractorInput {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
}

export function useSubcontractors() {
  const { userData } = useAuth();
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userData?.companyId) return;
    const subcontractorsRef = collection(
      db,
      "companies",
      userData.companyId,
      "subcontractors"
    );
    const unsubscribe = onSnapshot(
      subcontractorsRef,
      (snapshot) => {
        setSubcontractors(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Subcontractor, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Subcontractors listener error:", err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [userData?.companyId]);

  async function addSubcontractor(input: SubcontractorInput) {
    if (!userData?.companyId) return;
    const subcontractorsRef = collection(
      db,
      "companies",
      userData.companyId,
      "subcontractors"
    );
    await addDoc(subcontractorsRef, {
      name: input.name.trim(),
      contactName: input.contactName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      active: true,
      createdAt: serverTimestamp(),
    });
  }

  async function updateSubcontractor(
    subcontractorId: string,
    input: SubcontractorInput
  ) {
    if (!userData?.companyId) return;
    const subRef = doc(
      db,
      "companies",
      userData.companyId,
      "subcontractors",
      subcontractorId
    );
    await updateDoc(subRef, {
      name: input.name.trim(),
      contactName: input.contactName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
    });
  }

  async function toggleSubcontractorActive(subcontractor: Subcontractor) {
    if (!userData?.companyId) return;
    const subRef = doc(
      db,
      "companies",
      userData.companyId,
      "subcontractors",
      subcontractor.id
    );
    await updateDoc(subRef, { active: !subcontractor.active });
  }

  return {
    subcontractors,
    loading,
    addSubcontractor,
    updateSubcontractor,
    toggleSubcontractorActive,
  };
}
