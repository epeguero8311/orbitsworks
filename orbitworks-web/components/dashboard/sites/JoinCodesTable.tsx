"use client";

import { useEffect, useState } from "react";
import { isLocalLink, joinLink, LOCAL_QR_WARNING } from "@/lib/hooks/useJoinCodes";
import { downloadLabeledQr, qrPreviewDataUrl } from "@/lib/qrPng";
import { formatCompanyDateTime } from "@/lib/joinCodes/time";
import type { JoinCodeListItem, JoinCodeStatus } from "@/lib/types";

const STATUS_LABEL: Record<JoinCodeStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  full: "Full",
  noSeats: "No seats left",
};

const STATUS_CLASS: Record<JoinCodeStatus, string> = {
  active: "bg-green-50 text-green-700",
  expired: "bg-gray-100 text-gray-600",
  revoked: "bg-red-50 text-red-700",
  full: "bg-amber-50 text-amber-700",
  noSeats: "bg-amber-50 text-amber-700",
};

export type JoinCodeAction = "edit" | "regenerate" | "revoke";

interface JoinCodesTableProps {
  codes: JoinCodeListItem[];
  onAction: (action: JoinCodeAction, code: JoinCodeListItem) => void;
}

function QrPreview({ link }: { link: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    qrPreviewDataUrl(link).then((url) => alive && setSrc(url)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [link]);
  // A local data: URL - nothing for next/image to optimize.
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="QR code preview" width={120} height={120} className="rounded border border-gray-200" /> : null;
}

function RowActions({ code, onAction }: { code: JoinCodeListItem; onAction: JoinCodesTableProps["onAction"] }) {
  const [note, setNote] = useState("");
  const [showQr, setShowQr] = useState(false);
  const link = joinLink(code.token);
  const revoked = code.status === "revoked";
  const local = isLocalLink(link);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setNote("Crew code link copied");
    } catch {
      setNote("Couldn't copy");
    }
    setTimeout(() => setNote(""), 2000);
  }

  async function download() {
    if (local) {
      setNote(LOCAL_QR_WARNING);
      setTimeout(() => setNote(""), 3000);
      return;
    }
    try {
      await downloadLabeledQr(link, code.name, code.siteName);
    } catch {
      setNote("Couldn't download");
      setTimeout(() => setNote(""), 2000);
    }
  }

  const btn = "text-sm font-medium text-accent hover:underline";
  if (revoked) return <span className="text-xs text-gray-500">No actions</span>;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-3">
        <button onClick={() => setShowQr((v) => !v)} className={btn}>{showQr ? "Hide QR" : "QR"}</button>
        <button onClick={copy} className={btn}>Copy crew code link</button>
        <button onClick={download} className={btn}>Download</button>
        <button onClick={() => onAction("edit", code)} className={btn}>Edit</button>
        <button onClick={() => onAction("regenerate", code)} className={btn}>Regenerate</button>
        <button onClick={() => onAction("revoke", code)} className="text-sm font-medium text-red-600 hover:underline">Revoke</button>
      </div>
      {note && <span className="text-xs text-gray-600">{note}</span>}
      {showQr && (local ? <span className="text-xs text-amber-700">{LOCAL_QR_WARNING}</span> : <QrPreview link={link} />)}
    </div>
  );
}

export function JoinCodesTable({ codes, onAction }: JoinCodesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-gray-600">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Job site</th>
            <th className="px-4 py-2 font-medium">Subcontractors</th>
            <th className="px-4 py-2 font-medium">Joined</th>
            <th className="px-4 py-2 font-medium">Expires</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => (
            <tr key={c.token} className="border-b border-gray-200 last:border-0">
              <td className="px-4 py-2.5 align-top text-gray-950">
                {c.name}
                {c.locationRequired && <p className="text-xs text-gray-500">Location required</p>}
              </td>
              <td className="px-4 py-2.5 align-top text-gray-950">{c.siteName}</td>
              <td className="px-4 py-2.5 align-top text-gray-600">
                {c.subcontractorNames.length === 0 ? "In-house only" : c.subcontractorNames.join(", ")}
              </td>
              <td className="px-4 py-2.5 align-top text-gray-950">
                {c.userLimit === null ? c.joinedCount : `${c.joinedCount} / ${c.userLimit}`}
              </td>
              <td className="px-4 py-2.5 align-top text-gray-600">
                {c.expiresAt === null ? "Never" : formatCompanyDateTime(c.expiresAt)}
              </td>
              <td className="px-4 py-2.5 align-top">
                <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
              </td>
              <td className="px-4 py-2.5 align-top text-right">
                <RowActions code={c} onAction={onAction} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
