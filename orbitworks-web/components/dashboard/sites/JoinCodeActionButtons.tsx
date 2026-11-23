"use client";

import type { ReactNode } from "react";
import { Ban, Check, Copy, Download, Pencil, RefreshCw } from "lucide-react";
import type { JoinCodeListItem } from "@/lib/types";

// What the parent handles. Copy / download run inside useJoinCodeLink.
export type JoinCodeAction = "edit" | "regenerate" | "revoke";

interface JoinCodeActionButtonsProps {
  code: JoinCodeListItem;
  copied: boolean;
  note: string;
  showRegenerate: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onAction: (action: JoinCodeAction, code: JoinCodeListItem) => void;
}

const base = "flex h-9 w-9 items-center justify-center rounded-md border transition-colors";
const normal = `${base} border-gray-200 text-gray-950 hover:border-gray-300 hover:text-accent`;
const danger = `${base} border-gray-200 text-red-600 hover:border-red-300 hover:bg-red-50`;

function IconButton({ label, className, onClick, children }: { label: string; className: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={className}>
      {children}
    </button>
  );
}

// Icon row shared by the active cards and the info modal. Revoked codes
// get no actions (same as before).
export function JoinCodeActionButtons({ code, copied, note, showRegenerate, onCopy, onDownload, onAction }: JoinCodeActionButtonsProps) {
  if (code.status === "revoked") return <p className="text-xs text-gray-500">No actions for a revoked crew code.</p>;
  const icon = "h-4 w-4";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconButton label="Download QR" className={normal} onClick={onDownload}>
        <Download className={icon} />
      </IconButton>
      <IconButton label={copied ? "Copied" : "Copy link"} className={normal} onClick={onCopy}>
        {copied ? <Check className={`${icon} text-green-600`} /> : <Copy className={icon} />}
      </IconButton>
      <IconButton label="Edit" className={normal} onClick={() => onAction("edit", code)}>
        <Pencil className={icon} />
      </IconButton>
      {showRegenerate && (
        <IconButton label="Regenerate" className={normal} onClick={() => onAction("regenerate", code)}>
          <RefreshCw className={icon} />
        </IconButton>
      )}
      <IconButton label="Revoke" className={danger} onClick={() => onAction("revoke", code)}>
        <Ban className={icon} />
      </IconButton>
      {note && (
        <span role="status" className="text-xs text-gray-600">
          {note}
        </span>
      )}
    </div>
  );
}
