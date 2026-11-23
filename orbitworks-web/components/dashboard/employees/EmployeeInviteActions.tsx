"use client";

import { useEffect, useRef, useState } from "react";
import { inviteDisplayStatus } from "@/lib/employeeInvites/status";
import type { InviteActionResult } from "@/lib/hooks/useEmployeeInvites";
import type { EmployeeInvite } from "@/lib/types";

// Copy link / Resend / Revoke / Remove for one Employee App invite. Same
// buttons and feel as the supervisor invites (InviteManager.tsx): Copied!
// for 2 s, Resend locked for 60 s after a try, a confirm step before the
// destructive one. Used by the App invites card and the Edit employee
// window.
//   pending  -> Copy link, Resend, Revoke
//   expired  -> Resend (fresh 7 days, same link), Revoke, Remove
//   revoked / accepted -> Remove

const RESEND_COOLDOWN_MS = 60_000;

export interface InviteActionsApi {
  resend: (token: string) => Promise<InviteActionResult>;
  revoke: (token: string) => Promise<InviteActionResult>;
  remove: (token: string) => Promise<InviteActionResult>;
  copyLink: (token: string) => Promise<InviteActionResult>;
}

export function EmployeeInviteActions({ invite, api }: { invite: EmployeeInvite; api: InviteActionsApi }) {
  const status = inviteDisplayStatus(invite);
  const [busy, setBusy] = useState<"resend" | "revoke" | "remove" | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const [confirm, setConfirm] = useState<"revoke" | "remove" | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  async function run(kind: "resend" | "revoke" | "remove") {
    setBusy(kind);
    setMessage(null);
    const res = await api[kind](invite.id);
    setBusy(null);
    setConfirm(null);
    if (kind === "resend") {
      setCoolingDown(true);
      later(() => setCoolingDown(false), RESEND_COOLDOWN_MS);
      setMessage(res.ok ? { text: "Sent!", isError: false } : { text: res.message, isError: true });
    } else if (!res.ok) {
      setMessage({ text: res.message, isError: true });
    }
  }

  async function copy() {
    const res = await api.copyLink(invite.id);
    if (!res.ok) {
      setMessage({ text: res.message, isError: true });
      return;
    }
    setCopied(true);
    later(() => setCopied(false), 2000);
  }

  if (confirm) {
    return (
      <span className="inline-flex items-center gap-3">
        <span className="text-xs text-gray-600">{confirm === "revoke" ? "Revoke this invite? The link stops working." : "Remove from this list?"}</span>
        <button onClick={() => run(confirm)} disabled={busy !== null} className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60">
          {busy ? "Working..." : "Confirm"}
        </button>
        <button onClick={() => setConfirm(null)} className="text-sm font-medium text-gray-600 hover:underline">
          Keep
        </button>
      </span>
    );
  }

  const pendingOrExpired = status === "pending" || status === "expired";
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-4">
      {message && <span className={`text-xs font-medium ${message.isError ? "text-red-600" : "text-green-700"}`}>{message.text}</span>}
      {status === "pending" && (
        <button onClick={copy} className="text-sm font-medium text-accent hover:underline">
          {copied ? "Copied!" : "Copy link"}
        </button>
      )}
      {pendingOrExpired && (
        <button
          onClick={() => run("resend")}
          disabled={busy !== null || coolingDown}
          className="text-sm font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "resend" ? "Resending..." : "Resend"}
        </button>
      )}
      {pendingOrExpired && (
        <button onClick={() => setConfirm("revoke")} className="text-sm font-medium text-gray-600 hover:text-red-600 hover:underline">
          Revoke
        </button>
      )}
      {status !== "pending" && (
        <button onClick={() => setConfirm("remove")} className="text-sm font-medium text-gray-600 hover:text-red-600 hover:underline">
          Remove
        </button>
      )}
    </span>
  );
}
