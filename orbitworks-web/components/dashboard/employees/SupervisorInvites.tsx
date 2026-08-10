"use client";

import { useState, FormEvent } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useInvites } from "@/lib/hooks/useInvites";
import type { JobSite } from "@/lib/types";

export function SupervisorInvites({ sites }: { sites: JobSite[] }) {
  const { currentUser, userData } = useAuth();
  const { invites, loading: loadingInvites, cancelInvite } = useInvites();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSiteIds, setInviteSiteIds] = useState<string[]>([]);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  function toggleInviteSite(siteId: string) {
    setInviteSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId]
    );
  }

  function siteNames(ids: string[]) {
    if (ids.length === 0) return "None specified";
    return ids
      .map((id) => sites.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId || !currentUser) return;
    setInviteError("");
    setInviteSuccess("");
    setIsInviting(true);

    try {
      const normalizedEmail = inviteEmail.trim().toLowerCase();

      const existing = invites.find(
        (inv) =>
          inv.email.toLowerCase() === normalizedEmail &&
          inv.status === "pending"
      );
      if (existing) {
        setInviteError("There's already a pending invite for that email.");
        setIsInviting(false);
        return;
      }

      await addDoc(collection(db, "invites"), {
        email: normalizedEmail,
        companyId: userData.companyId,
        role: "supervisor",
        assignedSiteIds: inviteSiteIds,
        status: "pending",
        invitedByUid: currentUser.uid,
        createdAt: serverTimestamp(),
      });

      setInviteSuccess(`Invite sent to ${normalizedEmail}.`);
      setInviteEmail("");
      setInviteSiteIds([]);
    } catch (err) {
      console.error("Invite error:", err);
      setInviteError("Couldn't create the invite. Try again.");
    } finally {
      setIsInviting(false);
    }
  }

  async function copyInviteLink(email: string, inviteId: string) {
    const link = `${window.location.origin}/join?email=${encodeURIComponent(
      email
    )}`;
    await navigator.clipboard.writeText(link);
    setCopiedInviteId(inviteId);
    setTimeout(() => setCopiedInviteId(null), 2000);
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
      <h2 className="text-xl font-semibold text-gray-950">Supervisors</h2>
      <p className="mt-1.5 text-sm text-gray-600">
        Invite supervisors by email. Once they accept, they'll show up
        above in the employee list too - supervisors can clock in and out
        like anyone else, plus manage their assigned sites from the mobile
        app.
      </p>

      <form
        onSubmit={handleInvite}
        className="mt-5 rounded-xl border border-gray-200 bg-white p-6"
      >
        <label
          htmlFor="inviteEmail"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Email
        </label>
        <input
          id="inviteEmail"
          type="email"
          required
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          placeholder="supervisor@company.com"
        />

        <div className="mt-5">
          <span className="mb-2 block text-sm font-medium text-gray-950">
            Assign to job sites
          </span>
          {sites.length === 0 ? (
            <p className="text-sm text-gray-600">
              No active job sites yet - add one on the Job Sites page first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sites.map((site) => (
                <label
                  key={site.id}
                  className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    inviteSiteIds.includes(site.id)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={inviteSiteIds.includes(site.id)}
                    onChange={() => toggleInviteSite(site.id)}
                  />
                  {site.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {inviteError && (
          <p className="mt-4 text-sm text-red-600">{inviteError}</p>
        )}
        {inviteSuccess && (
          <p className="mt-4 text-sm text-green-700">{inviteSuccess}</p>
        )}

        <button
          type="submit"
          disabled={isInviting}
          className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isInviting ? "Sending..." : "Send invite"}
        </button>
      </form>

      <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-950">
            Supervisor invites
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
                <th className="px-6 py-3 font-medium">Job sites</th>
                <th className="px-6 py-3 font-medium">Status</th>
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
                  <td className="px-6 py-4 text-gray-600">
                    {siteNames(invite.assignedSiteIds)}
                  </td>
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
