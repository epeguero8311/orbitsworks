"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { employeeInviteConverter } from "@/lib/firebase/converters";
import { employeeInviteCreateSchema, employeeInviteTokenSchema, type EmployeeInviteCreateInput } from "@/lib/validators/employeeInvite";
import { employeeInviteLink, latestInviteByEmployee } from "@/lib/employeeInvites/status";
import type { EmployeeInvite } from "@/lib/types";

// Employee App email invites (Phase 3B) for the Employees page.
// - invites: live list for the caller's company (firestore.rules lets
//   admins/owners read their own company's invites; the query MUST filter
//   on companyId or it is denied)
// - byEmployee: the invite to show on each employee row's status pill
// - create / resend / revoke / remove: the server callables (no client
//   writes - every input is checked here first, then again on the server)
// - copyLink: same idea as the supervisor invites' Copy invite link
// Results are { ok: true } or { ok: false, message } with a plain message
// from the server - never thrown.

export type InviteActionResult = { ok: true; token?: string } | { ok: false; message: string };

function messageOf(err: unknown, fallback: string): string {
  const m = err instanceof Error ? err.message : "";
  // Callable errors carry the server's plain message; "internal" alone
  // means the request never got a real answer.
  return m && m !== "internal" ? m : fallback;
}

function linkBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
}

const createFn = httpsCallable(functions, "createEmployeeInvite");
const resendFn = httpsCallable(functions, "resendEmployeeInvite");
const revokeFn = httpsCallable(functions, "revokeEmployeeInvite");
const removeFn = httpsCallable(functions, "removeEmployeeInvite");

export function useEmployeeInvites() {
  const { userData } = useAuth();
  const companyId = userData?.companyId;
  const [invites, setInvites] = useState<EmployeeInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const ref = collection(db, "employeeInvites").withConverter(employeeInviteConverter);
    const q = query(ref, where("companyId", "==", companyId));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data());
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) - (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER));
        setInvites(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Employee invites listener error:", err.code);
        setError("Couldn't load app invites. Refresh the page.");
        setLoading(false);
      }
    );
  }, [companyId]);

  const byEmployee = useMemo(() => latestInviteByEmployee(invites), [invites]);

  const create = useCallback(async (input: EmployeeInviteCreateInput): Promise<InviteActionResult> => {
    const parsed = employeeInviteCreateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "Check the email and try again." };
    try {
      const res = await createFn(parsed.data);
      const token = (res.data as { token?: unknown } | null)?.token;
      return { ok: true, token: typeof token === "string" ? token : undefined };
    } catch (err) {
      return { ok: false, message: messageOf(err, "Couldn't create the invite. Try again.") };
    }
  }, []);

  const runTokenAction = useCallback(
    async (fn: typeof resendFn, token: string, fallback: string): Promise<InviteActionResult> => {
      const parsed = employeeInviteTokenSchema.safeParse({ token });
      if (!parsed.success) return { ok: false, message: fallback };
      try {
        await fn(parsed.data);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: messageOf(err, fallback) };
      }
    },
    []
  );

  const resend = useCallback((token: string) => runTokenAction(resendFn, token, "Couldn't resend the invite."), [runTokenAction]);
  const revoke = useCallback((token: string) => runTokenAction(revokeFn, token, "Couldn't revoke the invite."), [runTokenAction]);
  const remove = useCallback((token: string) => runTokenAction(removeFn, token, "Couldn't remove the invite."), [runTokenAction]);

  const linkFor = useCallback((token: string) => employeeInviteLink(token, linkBase()), []);

  const copyLink = useCallback(
    async (token: string): Promise<InviteActionResult> => {
      try {
        await navigator.clipboard.writeText(linkFor(token));
        return { ok: true };
      } catch {
        return { ok: false, message: "Couldn't copy the link." };
      }
    },
    [linkFor]
  );

  return { invites, byEmployee, loading, error, create, resend, revoke, remove, copyLink, linkFor };
}
