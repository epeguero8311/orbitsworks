"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { Invite } from "@/lib/types";

export function useInvites() {
  const { userData } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;

    const invitesRef = collection(db, "invites");
    const q = query(invitesRef, where("companyId", "==", userData.companyId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setInvites(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Invite, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Invites listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  return { invites, loading };
}