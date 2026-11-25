"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useSites } from "@/lib/hooks/useSites";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import {
  NO_PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  UNASSIGNED_SITE,
  resolveAdminAccess,
  type Permissions,
} from "@/lib/adminAccess";
import { setAdminAccessSchema } from "@/lib/validators/adminAccess";

// Admin Permissions (Task 4): Team -> admin -> Permissions. Saves through
// setAdminAccess (the only way to change access; the server enforces the
// hierarchy: only the owner gives / edits / removes Full access, Full access
// sets regular Admins, nobody edits themselves or the owner).
export default function PermissionsModal({
  targetUid,
  targetName,
  onClose,
}: {
  targetUid: string;
  targetName: string;
  onClose: () => void;
}) {
  const me = useAdminAccess();
  const { sites } = useSites();
  const activeSites = sites.filter((s) => s.active);
  const [loaded, setLoaded] = useState(false);
  const [full, setFull] = useState(false);
  const [allSites, setAllSites] = useState(true);
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permissions>(NO_PERMISSIONS);
  const [targetIsFull, setTargetIsFull] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "users", targetUid))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.data() as { role?: string; adminAccess?: unknown } | undefined;
        const a = resolveAdminAccess(data?.role ?? "admin", data?.adminAccess);
        setFull(a.level === "full");
        setTargetIsFull(a.level === "full");
        setAllSites(a.sites === "all");
        setSiteIds(a.sites === "all" ? [] : a.sites);
        setPermissions(a.permissions);
        setLoaded(true);
      })
      .catch((err) => {
        console.error("Load admin access error:", err);
        if (!cancelled) {
          setError("Couldn't load this admin's permissions.");
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [targetUid]);

  // Only the owner touches Full access (D5) - a Full access admin sees a
  // Full access admin read-only.
  const canEdit = me.isOwner || (me.isFull && !targetIsFull);
  const fullLocked = !me.isOwner;

  function toggleSite(id: string) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleSave() {
    setError(null);
    const parsed = setAdminAccessSchema.safeParse({
      targetUid,
      level: full ? "full" : "admin",
      sites: allSites ? "all" : siteIds,
      permissions,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the permissions.");
      return;
    }
    setSaving(true);
    try {
      await httpsCallable(functions, "setAdminAccess")(parsed.data);
      onClose();
    } catch (err) {
      console.error("Save admin access error:", err);
      setError(err instanceof Error ? err.message : "Couldn't save the permissions.");
      setSaving(false);
    }
  }

  const box = "h-4 w-4 rounded border-gray-300 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="permissions-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 id="permissions-title" className="text-base font-semibold text-gray-950">
            Permissions - {targetName}
          </h2>
          {!canEdit && loaded && (
            <p className="mt-1 text-xs text-gray-600">Only the owner can change a Full access admin.</p>
          )}
        </div>

        {!loaded ? (
          <p className="px-6 py-6 text-sm text-gray-600">Loading...</p>
        ) : (
          <fieldset disabled={!canEdit || saving} className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className={`${box} mt-0.5`}
                checked={full}
                disabled={fullLocked}
                onChange={(e) => setFull(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-gray-950">Full access</span>
                <span className="block text-xs text-gray-600">
                  Acts like the owner: every site and permission, incl. billing and setting admin permissions.
                  {fullLocked && " Only the owner can change this."}
                </span>
              </span>
            </label>

            <div className={full ? "opacity-50" : ""}>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Job sites</p>
              <label className="mt-2 flex items-center gap-2 text-sm text-gray-950">
                <input type="radio" name="sites" checked={full || allSites} disabled={full} onChange={() => setAllSites(true)} />
                All sites (includes new ones automatically)
              </label>
              <label className="mt-1 flex items-center gap-2 text-sm text-gray-950">
                <input type="radio" name="sites" checked={!full && !allSites} disabled={full} onChange={() => setAllSites(false)} />
                Only these:
              </label>
              {!full && !allSites && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 pl-6">
                  {activeSites.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-gray-950">
                      <input type="checkbox" className={box} checked={siteIds.includes(s.id)} onChange={() => toggleSite(s.id)} />
                      <span className="truncate">{s.name}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-gray-950">
                    <input
                      type="checkbox"
                      className={box}
                      checked={siteIds.includes(UNASSIGNED_SITE)}
                      onChange={() => toggleSite(UNASSIGNED_SITE)}
                    />
                    Unassigned
                  </label>
                </div>
              )}
            </div>

            <div className={full ? "opacity-50" : ""}>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Can</p>
              <div className="mt-2 space-y-1.5">
                {PERMISSION_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-gray-950">
                    <input
                      type="checkbox"
                      className={box}
                      checked={full || permissions[k]}
                      disabled={full}
                      onChange={(e) => setPermissions((prev) => ({ ...prev, [k]: e.target.checked }))}
                    />
                    {PERMISSION_LABELS[k]}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
          {error && <p className="mr-auto text-xs text-red-600">{error}</p>}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
          >
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit && (
            <button
              type="button"
              disabled={saving || !loaded}
              onClick={handleSave}
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
