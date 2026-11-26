"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { toastIfPermissionDenied } from "@/lib/permissionErrors";
import type { Invite } from "@/lib/types";

const RESEND_COOLDOWN_MS = 60_000;

// Resend / Copy invite link / Cancel-Remove for one supervisor, admin or
// kiosk invite (was inline in InviteManager.tsx). Remove on an Accepted
// row only takes the invite off the list - the account stays; Deactivate
// removes access.
export function StaffInviteActions({ invite, onCancel }: { invite: Invite; onCancel: (id: string) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const pending = invite.status === "pending";

  async function copyLink() {
    const kiosk = invite.role === "kiosk" ? "&kiosk=1" : "";
    const link = `${window.location.origin}/join?email=${encodeURIComponent(invite.email)}&invite=${encodeURIComponent(invite.id)}${kiosk}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function resend() {
    setResending(true);
    setMessage(null);
    try {
      await httpsCallable(functions, "resendInviteEmail")({ inviteId: invite.id });
      setMessage({ text: "Sent!", isError: false });
    } catch (err) {
      if (!toastIfPermissionDenied(err, { action: "resend invites", permission: "invites" })) {
        setMessage({ text: err instanceof Error ? err.message : "Couldn't resend the invite.", isError: true });
      }
    } finally {
      setResending(false);
      setCoolingDown(true);
      setTimeout(() => setCoolingDown(false), RESEND_COOLDOWN_MS);
    }
  }

  async function remove() {
    setDeleting(true);
    setMessage(null);
    try {
      await onCancel(invite.id);
    } catch (err) {
      console.error("Cancel invite error:", err);
      if (!toastIfPermissionDenied(err, { action: "remove invites", permission: "invites" })) {
        setMessage({ text: "Couldn't remove that invite. Try again.", isError: true });
      }
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-3">
        <span className="text-xs text-gray-600">{pending ? "Cancel this invite?" : "Remove from this list? The account stays."}</span>
        <button onClick={remove} disabled={deleting} className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60">
          {deleting ? "Removing..." : "Confirm"}
        </button>
        <button onClick={() => setConfirming(false)} className="text-sm font-medium text-gray-600 hover:underline">Keep</button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-4">
      {message && <span className={`text-xs font-medium ${message.isError ? "text-red-600" : "text-green-700"}`}>{message.text}</span>}
      {pending && invite.emailStatus !== "sent" && (
        <button onClick={resend} disabled={resending || coolingDown} className="text-sm font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-60">
          {resending ? "Resending..." : "Resend"}
        </button>
      )}
      {pending && (
        <button onClick={copyLink} className="text-sm font-medium text-accent hover:underline">{copied ? "Copied!" : "Copy invite link"}</button>
      )}
      <button onClick={() => setConfirming(true)} className="text-sm font-medium text-gray-600 hover:text-red-600 hover:underline">
        {pending ? "Cancel invite" : "Remove"}
      </button>
    </span>
  );
}
