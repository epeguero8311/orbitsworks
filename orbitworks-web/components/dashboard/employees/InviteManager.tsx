"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useInvites } from "@/lib/hooks/useInvites";
import type { Invite, JobSite } from "@/lib/types";

const RESEND_COOLDOWN_MS = 60_000;

function emailStatusBadge(invite: Invite) {
  // Accepted invites are resolved regardless of emailStatus - this also
  // covers invites created before this field existed, which would
  // otherwise show a permanently stuck "Sending..." badge.
  if (invite.status === "accepted" || invite.emailStatus === "sent") {
    return { text: "Sent", className: "bg-green-50 text-green-700" };
  }
  if (invite.emailStatus === "failed") {
    return { text: "Failed", className: "bg-red-50 text-red-700" };
  }
  return { text: "Sending...", className: "bg-gray-100 text-gray-600" };
}

const ROLE_COPY = {
  supervisor: { listTitle: "Supervisors" },
  admin: { listTitle: "Admins" },
} as const;

// Renders the invite list for one role (resend / copy link / cancel).
// Phase 9 (H1 a): sending moved to the one invite form (InviteForm.tsx),
// which uses lib/hooks/useStaffInviteSend.ts - the same cross-role
// pending-invite check as before. Behavior is identical for supervisor
// and admin invites - only which invites are shown and whether job sites
// show differ.
export function InviteManager({
  role,
  sites,
}: {
  role: "supervisor" | "admin";
  sites?: JobSite[];
}) {
  const copy = ROLE_COPY[role];
  const { invites: allInvites, loading: loadingInvites, cancelInvite } = useInvites();
  const invites = allInvites.filter((inv) =>
    role === "admin" ? inv.role === "admin" : inv.role !== "admin"
  );

  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendCooldownIds, setResendCooldownIds] = useState<Set<string>>(new Set());
  const [resendMessages, setResendMessages] = useState<
    Record<string, { text: string; isError: boolean }>
  >({});

  function siteNames(ids: string[]) {
    if (ids.length === 0) return "None specified";
    return ids
      .map((id) => sites?.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  async function copyInviteLink(email: string, inviteId: string) {
    const link = `${window.location.origin}/join?email=${encodeURIComponent(
      email
    )}`;
    await navigator.clipboard.writeText(link);
    setCopiedInviteId(inviteId);
    setTimeout(() => setCopiedInviteId(null), 2000);
  }

  async function handleResend(inviteId: string) {
    setResendingId(inviteId);
    setResendMessages((prev) => {
      const next = { ...prev };
      delete next[inviteId];
      return next;
    });

    try {
      const resendInviteEmailFn = httpsCallable(functions, "resendInviteEmail");
      await resendInviteEmailFn({ inviteId });
      setResendMessages((prev) => ({
        ...prev,
        [inviteId]: { text: "Sent!", isError: false },
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't resend the invite.";
      setResendMessages((prev) => ({
        ...prev,
        [inviteId]: { text: message, isError: true },
      }));
    } finally {
      setResendingId(null);
      setResendCooldownIds((prev) => new Set(prev).add(inviteId));
      setTimeout(() => {
        setResendCooldownIds((prev) => {
          const next = new Set(prev);
          next.delete(inviteId);
          return next;
        });
      }, RESEND_COOLDOWN_MS);
    }
  }

  async function handleConfirmDelete(inviteId: string) {
    setDeleteError("");
    setDeletingId(inviteId);
    try {
      await cancelInvite(inviteId);
    } catch (err) {
      console.error("Cancel invite error:", err);
      setDeleteError("Couldn't remove that invite. Try again.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-950">
            {copy.listTitle}
          </h3>
        </div>
        {deleteError && (
          <p className="border-b border-gray-200 px-6 py-3 text-sm text-red-600">
            {deleteError}
          </p>
        )}
        {loadingInvites ? (
          <p className="p-6 text-sm text-gray-600">Loading...</p>
        ) : invites.length === 0 ? (
          <p className="p-6 text-sm text-gray-600">No invites sent yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-6 py-3 font-medium">Email</th>
                {role === "supervisor" && (
                  <th className="px-6 py-3 font-medium">Job sites</th>
                )}
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Email status</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr
                  key={invite.id}
                  className="border-b border-gray-200 last:border-0"
                >
                  <td className="px-6 py-4 text-gray-950">
                    {invite.email}
                  </td>
                  {role === "supervisor" && (
                    <td className="px-6 py-4 text-gray-600">
                      {siteNames(invite.assignedSiteIds)}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        invite.status === "accepted"
                          ? "bg-green-50 text-green-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {invite.status === "accepted" ? "Accepted" : "Pending"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        emailStatusBadge(invite).className
                      }`}
                    >
                      {emailStatusBadge(invite).text}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {confirmDeleteId === invite.id ? (
                      <span className="inline-flex items-center gap-3">
                        <span className="text-xs text-gray-600">
                          {invite.status === "pending"
                            ? "Cancel this invite?"
                            : "Remove from this list?"}
                        </span>
                        <button
                          onClick={() => handleConfirmDelete(invite.id)}
                          disabled={deletingId === invite.id}
                          className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
                        >
                          {deletingId === invite.id
                            ? "Removing..."
                            : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-sm font-medium text-gray-600 hover:underline"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-4">
                        {resendMessages[invite.id] && (
                          <span
                            className={`text-xs font-medium ${
                              resendMessages[invite.id].isError
                                ? "text-red-600"
                                : "text-green-700"
                            }`}
                          >
                            {resendMessages[invite.id].text}
                          </span>
                        )}
                        {invite.status === "pending" &&
                          invite.emailStatus !== "sent" && (
                          <button
                            onClick={() => handleResend(invite.id)}
                            disabled={
                              resendingId === invite.id ||
                              resendCooldownIds.has(invite.id)
                            }
                            className="text-sm font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {resendingId === invite.id
                              ? "Resending..."
                              : "Resend"}
                          </button>
                        )}
                        {invite.status === "pending" && (
                          <button
                            onClick={() =>
                              copyInviteLink(invite.email, invite.id)
                            }
                            className="text-sm font-medium text-accent hover:underline"
                          >
                            {copiedInviteId === invite.id
                              ? "Copied!"
                              : "Copy invite link"}
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDeleteId(invite.id)}
                          className="text-sm font-medium text-gray-600 hover:text-red-600 hover:underline"
                        >
                          {invite.status === "pending"
                            ? "Cancel invite"
                            : "Remove"}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
