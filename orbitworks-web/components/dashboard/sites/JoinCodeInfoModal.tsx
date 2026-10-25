"use client";

import type { ReactNode } from "react";
import { useJoinCodeLink } from "@/lib/hooks/useJoinCodeLink";
import { formatCompanyDateTime } from "@/lib/joinCodes/time";
import { JoinCodeQr } from "@/components/dashboard/sites/JoinCodeQr";
import { JoinCodeStatusBadge } from "@/components/dashboard/sites/JoinCodeStatusBadge";
import { JoinCodeActionButtons, type JoinCodeAction } from "@/components/dashboard/sites/JoinCodeActionButtons";
import type { JoinCodeListItem } from "@/lib/types";

interface JoinCodeInfoModalProps {
  code: JoinCodeListItem;
  onAction: (action: JoinCodeAction, code: JoinCodeListItem) => void;
  onClose: () => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0">
      <dt className="shrink-0 text-gray-600">{label}</dt>
      <dd className="text-right text-gray-950">{children}</dd>
    </div>
  );
}

// Everything about one crew code, with its actions along the bottom.
export function JoinCodeInfoModal({ code, onAction, onClose }: JoinCodeInfoModalProps) {
  const l = useJoinCodeLink(code);
  const revoked = code.status === "revoked";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="jcInfoTitle"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="jcInfoTitle" className="text-xl font-semibold text-gray-950">{code.name}</h2>
            <div className="mt-1">
              <JoinCodeStatusBadge status={code.status} />
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-950" aria-label="Close">
            Close
          </button>
        </div>

        {!revoked && (
          <div className="flex flex-col items-center gap-3">
            <JoinCodeQr link={l.link} size={176} />
            <p className="w-full break-all rounded-md bg-gray-50 px-3 py-2 text-center text-xs text-gray-950">{l.link}</p>
          </div>
        )}

        <dl className="mt-4 text-sm">
          <Row label="Job site">{code.siteName}</Row>
          <Row label="User limit">{code.userLimit === null ? `No limit (${code.joinedCount} joined)` : `${code.joinedCount} / ${code.userLimit} joined`}</Row>
          <Row label="Time limit">{code.expiresAt === null ? "Never expires" : `Expires ${formatCompanyDateTime(code.expiresAt)}`}</Row>
          <Row label="Created">{code.createdAt === null ? "-" : formatCompanyDateTime(code.createdAt)}</Row>
          <Row label="Location required">{code.locationRequired ? "Yes" : "No"}</Row>
          <Row label="Subcontractors">{code.subcontractorNames.length === 0 ? "In-house only" : code.subcontractorNames.join(", ")}</Row>
        </dl>

        <div className="mt-5 border-t border-gray-200 pt-4">
          <JoinCodeActionButtons
            code={code}
            copied={l.copied}
            note={l.note}
            showRegenerate
            onCopy={l.copy}
            onDownload={l.download}
            onAction={onAction}
          />
        </div>
      </div>
    </div>
  );
}
