"use client";

import { Info } from "lucide-react";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatCompanyDateTime } from "@/lib/joinCodes/time";
import { Pagination } from "@/components/dashboard/Pagination";
import { JoinCodeStatusBadge } from "@/components/dashboard/sites/JoinCodeStatusBadge";
import type { JoinCodeListItem } from "@/lib/types";

const PAGE_SIZE = 15;

export function formatUses(code: JoinCodeListItem): string {
  return code.userLimit === null ? String(code.joinedCount) : `${code.joinedCount} / ${code.userLimit}`;
}

interface JoinCodeListProps {
  codes: JoinCodeListItem[];
  onInfo: (code: JoinCodeListItem) => void;
}

// Every crew code, newest first (server order), 15 per page. All actions
// live in the info modal.
export function JoinCodeList({ codes, onInfo }: JoinCodeListProps) {
  const p = usePagination(codes, PAGE_SIZE);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs text-gray-600">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Job site</th>
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
                <td className="whitespace-nowrap px-4 py-2.5 text-gray-950">{formatUses(c)}</td>
                <td className="px-4 py-2.5 text-gray-600">{c.expiresAt === null ? "Never" : formatCompanyDateTime(c.expiresAt)}</td>
                <td className="px-4 py-2.5">
                  <JoinCodeStatusBadge status={c.status} />
                </td>
                <td className="px-4 py-2.5 text-right">
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
