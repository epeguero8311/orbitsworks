"use client";

import { useJoinCodeLink } from "@/lib/hooks/useJoinCodeLink";
import { formatCompanyDateTime } from "@/lib/joinCodes/time";
import { JoinCodeQr } from "@/components/dashboard/sites/JoinCodeQr";
import { JoinCodeStatusBadge } from "@/components/dashboard/sites/JoinCodeStatusBadge";
import { JoinCodeActionButtons, type JoinCodeAction } from "@/components/dashboard/sites/JoinCodeActionButtons";
import { formatUses } from "@/components/dashboard/sites/JoinCodeList";
import type { JoinCodeListItem } from "@/lib/types";

interface ActiveJoinCodesProps {
  codes: JoinCodeListItem[];
  onAction: (action: JoinCodeAction, code: JoinCodeListItem) => void;
}

function ActiveJoinCodeCard({ code, onAction }: { code: JoinCodeListItem; onAction: ActiveJoinCodesProps["onAction"] }) {
  const l = useJoinCodeLink(code);
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center">
      <JoinCodeQr link={l.link} size={112} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-semibold text-gray-950">{code.name}</h3>
          <JoinCodeStatusBadge status={code.status} />
        </div>
        <p className="mt-1 text-sm text-gray-600">{code.siteName}</p>
        <p className="mt-0.5 text-xs text-gray-600">
          {formatUses(code)} joined &middot; {code.expiresAt === null ? "Never expires" : `Expires ${formatCompanyDateTime(code.expiresAt)}`}
        </p>
        <div className="mt-3">
          <JoinCodeActionButtons
            code={code}
            copied={l.copied}
            note={l.note}
            showRegenerate={false}
            onCopy={l.copy}
            onDownload={l.download}
            onAction={onAction}
          />
        </div>
      </div>
    </div>
  );
}

// Top of the Crew onboarding tab: one card per active code, QR showing.
export function ActiveJoinCodes({ codes, onAction }: ActiveJoinCodesProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-950">Active crew codes</h2>
      {codes.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">No active crew codes right now.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {codes.map((c) => (
            <ActiveJoinCodeCard key={c.token} code={c} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}
