"use client";

import { useState } from "react";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

// Phase 9 (H1 a): sending a supervisor or admin invite - moved here from
// InviteManager.tsx so the one invite form (InviteForm.tsx) uses the same
// path and the same checks. Unchanged behavior: a fresh query for any
// pending invite for this email company-wide (either role), then an
// invites doc (role, sites for a supervisor) - sendInviteEmail mails it,
// acceptInvite checks seats when it is accepted.
export type StaffInviteResult = { ok: true; email: string } | { ok: false; message: string };

export function useStaffInviteSend() {
  const { currentUser, userData } = useAuth();
  const [sending, setSending] = useState(false);

  async function send(role: "supervisor" | "admin", email: string, siteIds: string[]): Promise<StaffInviteResult> {
    if (!userData?.companyId || !currentUser) return { ok: false, message: "You must be signed in." };
    setSending(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await getDocs(
        query(
          collection(db, "invites"),
          where("companyId", "==", userData.companyId),
          where("email", "==", normalizedEmail),
          where("status", "==", "pending")
        )
      );
      if (!existing.empty) return { ok: false, message: "There's already a pending invite for that email." };
      await addDoc(collection(db, "invites"), {
        email: normalizedEmail,
        companyId: userData.companyId,
        role,
        assignedSiteIds: role === "supervisor" ? siteIds : [],
        status: "pending",
        invitedByUid: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      return { ok: true, email: normalizedEmail };
    } catch (err) {
      console.error("Invite error:", err);
      return { ok: false, message: "Couldn't create the invite. Try again." };
    } finally {
      setSending(false);
    }
  }

  return { send, sending };
}
