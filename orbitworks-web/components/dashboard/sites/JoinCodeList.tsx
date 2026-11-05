"use client";

import { Copy, Info } from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { useJoinCodeLink } from "@/lib/hooks/useJoinCodeLink";
import { formatGeofenceRadius } from "@/lib/geo";
import { formatCompanyDateTime } from "@/lib/joinCodes/time";
import { Pagination } from "@/components/dashboard/Pagination";
import { JoinCodeStatusBadge } from "@/components/dashboard/sites/JoinCodeStatusBadge";
import type { JobSite, JoinCodeListItem } from "@/lib/types";

const PAGE_SIZE = 15;

export function formatUses(code: JoinCodeListItem): string {
  return code.userLimit === null ? String(code.joinedCount) : `${code.joinedCount} / ${code.userLimit}`;
}

interface JoinCodeListProps {
  codes: JoinCodeListItem[];
  sites: JobSite[];
  onInfo: (code: JoinCodeListItem) => void;
}

// Phase 9 (H11 a): the code's job site geofence, from the site itself
// (the crew code modal edits that same setting - Phase 8 D2).
function geofenceText(site: JobSite | undefined): string {
  if (!site) return "-";
  if (!site.requireGeofence) return "Off";
  return `On - ${formatGeofenceRadius(site.radiusMeters ?? 0, site.radiusUnit)}`;
}

// Phase 9 (H11 a): copy the sign-up link right from the list (active codes
// only) - same link and clipboard handling as the info modal.
function CopyLinkButton({ code }: { code: JoinCodeListItem }) {
  const l = useJoinCodeLink(code);
  return (
    <button
      onClick={l.copy}
      aria-label={`Copy link for ${code.name}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-950 transition-colors hover:border-gray-300"
    >
      <Copy className="h-3.5 w-3.5" /> {l.copied ? "Copied" : "Copy link"}
    </button>
  );
}

// Every crew code, newest first (server order), 15 per page. Copy link on
// active codes; every other action lives in the info modal.
export function JoinCodeList({ codes, sites, onInfo }: JoinCodeListProps) {
  const p = usePagination(codes, PAGE_SIZE);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs text-gray-600">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Job site</th>
              <th className="px-4 py-2.5 font-medium">Geofence</th>
              <th className="px-4 py-2.5 font-medium">Uses</th>
              <th className="px-4 py-2.5 font-medium">Expires</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {p.pageItems.map((c) => (
              <tr key={c.token} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 text-gray-950">{c.name}</td>
                <td className="px-4 py-2.5 text-gray-950">{c.siteName}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{geofenceText(sites.find((s) => s.id === c.siteId))}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-gray-950">{formatUses(c)}</td>
                <td className="px-4 py-2.5 text-gray-600">{c.expiresAt === null ? "Never" : formatCompanyDateTime(c.expiresAt)}</td>
                <td className="px-4 py-2.5">
                  <JoinCodeStatusBadge status={c.status} />
                </td>
                <td className="space-x-2 whitespace-nowrap px-4 py-2.5 text-right">
                  {c.status === "active" && <CopyLinkButton code={c} />}
                  <button
                    onClick={() => onInfo(c)}
                    aria-label={`Info for ${c.name}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-950 transition-colors hover:border-gray-300"
                  >
                    <Info className="h-3.5 w-3.5" /> Info
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination start={p.start} end={p.end} total={p.total} hasPrev={p.hasPrev} hasNext={p.hasNext} onPrev={p.prev} onNext={p.next} />
    </div>
  );
}
