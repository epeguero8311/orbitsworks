"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { httpsCallable } from "firebase/functions";
import { KeyRound } from "lucide-react";
import { functions } from "@/lib/firebase";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { formatKeyCountdown } from "@/lib/kiosk";
import { toastIfPermissionDenied } from "@/lib/permissionErrors";

type IssuedKey = { key: string; expiresAtMs: number };

// Task 5 (K16/K17): Settings -> Mobile app -> Kiosks. An admin makes a
// 4-digit exit key for ONE kiosk iPad: valid 10 minutes, single use. Typed
// on the iPad's Kiosk Settings pad it opens Kiosk Settings (where Exit Kiosk
// is). The key is shown here once - the server keeps only a salted hash.
// Owner / Full access / Settings permission (createKioskExitKey checks the
// same). Not Pro-gated: a company that downgraded still needs a way out.
export function KioskExitKeysCard() {
  const access = useAdminAccess();
  const { employees, loading } = useEmployees({ includeKiosks: true });
  const kiosks = employees.filter((e) => e.kiosk === true && e.active);
  const [issued, setIssued] = useState<Record<string, IssuedKey>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const anyLive = Object.values(issued).some((k) => k.expiresAtMs > now);
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyLive]);

  if (!access.can("settings")) return null;

  async function createKey(kioskEmployeeId: string) {
    setBusyId(kioskEmployeeId);
    setError(null);
    try {
      const fn = httpsCallable(functions, "createKioskExitKey");
      const res = await fn({ kioskEmployeeId });
      const data = res.data as IssuedKey;
      // The 1 s ticker below starts as soon as a key is live and moves `now`.
      setIssued((prev) => ({ ...prev, [kioskEmployeeId]: data }));
    } catch (err) {
      console.error("createKioskExitKey failed:", err);
      if (toastIfPermissionDenied(err, { action: "make kiosk exit keys", permission: "settings" })) return;
      setError((err as { message?: string })?.message || "Couldn't make a key. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div id="kiosks" className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">Kiosks</h2>
      <p className="mt-1 text-sm text-gray-600">
        To leave Kiosk mode on an iPad, make an exit key here and type it in the iPad&apos;s Kiosk Settings. A key works once, for 10 minutes.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="mt-4 text-sm text-gray-600">Loading...</p>
      ) : kiosks.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">
          No kiosks yet. Turn on Kiosk access for a record in{" "}
          <Link href="/dashboard/employees" className="font-medium text-accent hover:underline">
            Employees
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {kiosks.map((k) => {
            const key = issued[k.id];
            const msLeft = key ? key.expiresAtMs - now : 0;
            const live = !!key && msLeft > 0;
            return (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-950">{k.name}</p>
                  {live ? (
                    <p className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                      <span className="font-mono text-xl font-semibold tracking-[0.3em] text-gray-950">{key.key}</span>
                      <span>expires in {formatKeyCountdown(msLeft)}</span>
                    </p>
                  ) : key ? (
                    <p className="mt-1 text-xs text-gray-500">Key expired.</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => createKey(k.id)}
                  disabled={busyId !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-gray-50 disabled:opacity-50"
                >
                  <KeyRound className="h-4 w-4" />
                  {busyId === k.id ? "Making..." : live ? "New key" : "Make exit key"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
