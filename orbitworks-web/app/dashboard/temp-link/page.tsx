"use client";

import { useEffect, useState } from "react";
import { Copy, Check, X, Link2 } from "lucide-react";
import { useTempClockLinkPage, type TempLinkDuration } from "@/lib/hooks/useTempClockLinkPage";
import TempLinkLockedUpsell from "@/components/tempLink/TempLinkLockedUpsell";

const DURATIONS: TempLinkDuration[] = [10, 30, 60];

function useNow(tickMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "Expired";
  const totalSeconds = Math.ceil(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TempClockLinkPage() {
  const t = useTempClockLinkPage();
  const now = useNow(1000);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  if (t.planLoading) return <p className="text-sm text-gray-600">Loading...</p>;
  if (!t.isPro) return <TempLinkLockedUpsell />;

  function linkUrlFor(token: string): string {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/clock/${token}`;
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(linkUrlFor(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((c) => (c === token ? null : c)), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Temp Clock-In Link</h1>
      <p className="mt-1 text-sm text-gray-600">
        Generate a short-lived link for one job site. Anyone who opens it can
        clock in or out with their PIN and a photo - no app install needed.
        Hand the phone around; the link works for every employee at that site
        until it expires.
      </p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div>
            <label htmlFor="tempLinkSite" className="mb-1.5 block text-xs font-medium text-gray-950">
              Job site
            </label>
            <select
              id="tempLinkSite"
              value={t.siteId}
              onChange={(e) => t.setSiteId(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="none">No site</option>
              {t.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-950">Expires after</p>
            <div className="flex gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => t.setDurationMinutes(d)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    t.durationMinutes === d
                      ? "bg-accent text-white"
                      : "border border-gray-200 text-gray-950 hover:border-gray-300"
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={t.generateLink}
            disabled={t.generating || !t.siteId}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {t.generating ? "Generating..." : "Generate link"}
          </button>
        </div>
        {t.error && <p className="mt-3 text-sm text-red-600">{t.error}</p>}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-950">Active links</h2>
        {t.linksLoading ? (
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        ) : t.activeLinks.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No active links right now.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {t.activeLinks.map((link) => {
              const msRemaining = link.expiresAt - now;
              const expired = msRemaining <= 0;
              return (
                <div
                  key={link.token}
                  className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
                      <Link2 className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-950">{link.siteName}</p>
                      <p className="text-xs text-gray-600">
                        Authorized by {link.createdByName} &middot;{" "}
                        {expired ? "Expired" : `${formatCountdown(msRemaining)} left`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyLink(link.token)}
                      disabled={expired}
                      className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-950 transition-colors hover:border-gray-300 disabled:opacity-60"
                    >
                      {copiedToken === link.token ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy link
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => t.revokeLink(link.token)}
                      className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-300"
                    >
                      <X className="h-3.5 w-3.5" /> Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-gray-950">Link history</h2>
        <p className="mt-1 text-xs text-gray-600">
          Every link this company has ever generated - who authorized it, when, and when it
          expired. Permanent record, visible to every admin; nothing here can be edited or
          deleted.
        </p>
        {t.historyLoading ? (
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        ) : t.history.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No links generated yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-600">
                  <th className="px-4 py-2.5 font-medium">Site</th>
                  <th className="px-4 py-2.5 font-medium">Authorized by</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium">Expires</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {t.history.map((entry) => {
                  const expired = entry.expiresAt <= now;
                  const status = entry.revoked ? "Revoked" : expired ? "Expired" : "Active";
                  const statusClass =
                    status === "Active"
                      ? "bg-green-100 text-green-700"
                      : status === "Revoked"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600";
                  return (
                    <tr key={entry.token} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2.5 text-gray-950">{entry.siteName}</td>
                      <td className="px-4 py-2.5 text-gray-950">{entry.createdByName}</td>
                      <td className="px-4 py-2.5 text-gray-600">{formatDateTime(entry.createdAt)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{formatDateTime(entry.expiresAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
