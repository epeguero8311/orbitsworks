"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type JobSite = {
  id: string;
  name: string;
  active: boolean;
};

type Invite = {
  id: string;
  email: string;
  assignedSiteIds: string[];
  status: "pending" | "accepted";
};

export default function SettingsPage() {
  const { currentUser, userData } = useAuth();
  const [sites, setSites] = useState<JobSite[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  const [email, setEmail] = useState("");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!userData?.companyId) return;
    const sitesRef = collection(
      db,
      "companies",
      userData.companyId,
      "jobSites"
    );
    const unsubscribe = onSnapshot(sitesRef, (snapshot) => {
      setSites(
        snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<JobSite, "id">) }))
          .filter((s) => s.active)
      );
    });
    return unsubscribe;
  }, [userData?.companyId]);

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
        setLoadingInvites(false);
      },
      (err) => {
        console.error("Invites listener error:", err);
        setLoadingInvites(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  function toggleSite(siteId: string) {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId]
    );
  }

  function siteNames(ids: string[]) {
    if (ids.length === 0) return "All sites (none specified)";
    return ids
      .map((id) => sites.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId || !currentUser) return;
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Prevent duplicate pending invites for the same email
      const existing = invites.find(
        (inv) => inv.email.toLowerCase() === normalizedEmail && inv.status === "pending"
      );
      if (existing) {
        setError("There's already a pending invite for that email.");
        setIsSubmitting(false);
        return;
      }

      await addDoc(collection(db, "invites"), {
        email: normalizedEmail,
        companyId: userData.companyId,
        role: "supervisor",
        assignedSiteIds: selectedSiteIds,
        status: "pending",
        invitedByUid: currentUser.uid,
        createdAt: serverTimestamp(),
      });

      setSuccess(`Invite sent to ${normalizedEmail}.`);
      setEmail("");
      setSelectedSiteIds([]);
    } catch (err) {
      console.error("Invite error:", err);
      setError("Couldn't create the invite. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Settings</h1>
      <p className="mt-1 text-sm text-gray-600">
        Manage your team and company settings.
      </p>

      {/* Invite supervisor form */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-950">
          Invite a supervisor
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          They&apos;ll create their own password at sign-up — just enter
          their email and which job sites they should have access to.
        </p>

        <form onSubmit={handleInvite} className="mt-4">
          <label
            htmlFor="inviteEmail"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Email
          </label>
          <input
            id="inviteEmail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full max-w-sm rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="supervisor@company.com"
          />

          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-gray-950">
              Assign to job sites
            </span>
            {sites.length === 0 ? (
              <p className="text-sm text-gray-600">
                No active job sites yet — add one on the Job Sites page first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sites.map((site) => (
                  <label
                    key={site.id}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors ${
                      selectedSiteIds.includes(site.id)
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={selectedSiteIds.includes(site.id)}
                      onChange={() => toggleSite(site.id)}
                    />
                    {site.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-3 text-sm text-green-700">{success}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isSubmitting ? "Sending…" : "Send invite"}
          </button>
        </form>
      </div>

      {/* Invite list */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-950">
            Supervisor invites
          </h2>
        </div>
        {loadingInvites ? (
          <p className="p-4 text-sm text-gray-600">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No invites sent yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Job sites</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr
                  key={invite.id}
                  className="border-b border-gray-200 last:border-0"
                >
                  <td className="px-4 py-2.5 text-gray-950">
                    {invite.email}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {siteNames(invite.assignedSiteIds)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        invite.status === "accepted"
                          ? "bg-green-50 text-green-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {invite.status === "accepted" ? "Accepted" : "Pending"}
                    </span>
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