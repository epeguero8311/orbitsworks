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
import { subcontractorFormSchema, type SubcontractorFormInput } from "@/lib/validators/subcontractor";
import type { Subcontractor } from "@/lib/types";

export type SubcontractorInput = SubcontractorFormInput;

// Throws the first validation message, so callers can show err.message.
export class SubcontractorInputError extends Error {}

function parseInput(input: SubcontractorFormInput) {
  const parsed = subcontractorFormSchema.safeParse(input);
  if (!parsed.success) {
    throw new SubcontractorInputError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const d = parsed.data;
  return {
    name: d.name,
    contactName: d.contactName ?? "",
    email: d.email ?? "",
    phone: d.phone ?? "",
    address: d.address ?? "",
  };
}

// Subcontractors are never hard-deleted (firestore.rules denies delete):
// removing one is active: false, so old employee records, clock events and
// exports keep resolving the name.
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
      ...parseInput(input),
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
    await updateDoc(subRef, parseInput(input));
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
