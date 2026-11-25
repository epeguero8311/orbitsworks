"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { resolveAdminAccess } from "@/lib/adminAccess";
import { setSiteAdminsSchema } from "@/lib/validators/adminAccess";

// Admin Permissions (Task 4, D6 / D17): right after a new job site is
// created, the owner / a Full access admin picks which admins limited to
// some sites can see it. "All sites" and Full access admins see it anyway.
// Saved by setSiteAdmins (server: owner / Full access only).
type Candidate = { uid: string; name: string };

export default function SiteAdminsPicker({
  siteId,
  siteName,
  onClose,
}: {
  siteId: string;
  siteName: string;
  onClose: () => void;
}) {
  const { userData } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userData?.companyId) return;
    let cancelled = false;
    getDocs(query(collection(db, "users"), where("companyId", "==", userData.companyId), where("role", "==", "admin")))
      .then((snap) => {
        if (cancelled) return;
        const list = snap.docs
          .map((d) => ({ uid: d.id, data: d.data() as { name?: string; adminAccess?: unknown } }))
          .filter(({ data }) => {
            const a = resolveAdminAccess("admin", data.adminAccess);
            return a.level === "admin" && a.sites !== "all";
          })
          .map(({ uid, data }) => ({ uid, name: data.name || "Admin" }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCandidates(list);
      })
      .catch((err) => {
        console.error("Load admins error:", err);
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userData?.companyId]);

  // Nobody to pick (no admin is limited to some sites): nothing to ask.
  useEffect(() => {
    if (candidates && candidates.length === 0) onClose();
  }, [candidates, onClose]);

  async function handleSave() {
    const parsed = setSiteAdminsSchema.safeParse({ siteId, adminUids: picked });
    if (!parsed.success) {
      setError("Check the admins and try again.");
      return;
    }
    if (picked.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await httpsCallable(functions, "setSiteAdmins")(parsed.data);
      onClose();
    } catch (err) {
      console.error("Save site admins error:", err);
      setError("Couldn't save. Try again.");
      setSaving(false);
    }
  }

  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-admins-title"
        className="w-full max-w-sm rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="site-admins-title" className="text-base font-semibold text-gray-950">
          Which admins can see {siteName}?
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          Admins with &quot;All sites&quot; or Full access see it automatically.
        </p>
        <div className="mt-4 space-y-2">
          {candidates.map((c) => (
            <label key={c.uid} className="flex items-center gap-2 text-sm text-gray-950">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={picked.includes(c.uid)}
                onChange={() => setPicked((prev) => (prev.includes(c.uid) ? prev.filter((u) => u !== c.uid) : [...prev, c.uid]))}
              />
              {c.name}
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
