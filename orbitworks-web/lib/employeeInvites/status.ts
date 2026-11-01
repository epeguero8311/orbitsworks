import type { EmployeeInvite, EmployeeInviteDisplayStatus } from "@/lib/types";

// Pure helpers for the Employees page invite list (Phase 3B). No Firebase
// imports, so test/employeeInviteStatus.test.mjs runs them in plain Node.

// "expired" is never stored - a pending invite past expiresAt shows as
// Expired (same rule as inviteDisplayStatus in functions/src/
// employeeInviteTypes.ts).
export function inviteDisplayStatus(
  invite: Pick<EmployeeInvite, "status" | "expiresAt">,
  nowMs: number = Date.now()
): EmployeeInviteDisplayStatus {
  const expires = invite.expiresAt?.toMillis?.();
  if (invite.status === "pending" && typeof expires === "number" && expires <= nowMs) return "expired";
  return invite.status;
}

// The link Copy link puts on the clipboard. Same base the join code QR
// uses (useJoinCodes.ts): NEXT_PUBLIC_APP_URL on the dev/prod sites, else
// the page's own origin. The server's email link (functions/src/lib/
// appUrls.ts) picks the same site per project.
export function employeeInviteLink(token: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/i/${encodeURIComponent(token)}`;
}

// Live (blocks a new invite for the same person) = pending and not expired.
export function isLiveInvite(invite: Pick<EmployeeInvite, "status" | "expiresAt">, nowMs: number = Date.now()): boolean {
  return inviteDisplayStatus(invite, nowMs) === "pending";
}

// The invite to show on an employee row's status pill: a live one first,
// else the most recently created. Accepted rows show nothing (they have
// the app login tag instead), so callers skip "accepted".
export function latestInviteByEmployee(invites: EmployeeInvite[], nowMs: number = Date.now()): Map<string, EmployeeInvite> {
  const out = new Map<string, EmployeeInvite>();
  const created = (i: EmployeeInvite) => i.createdAt?.toMillis?.() ?? 0;
  for (const inv of invites) {
    if (!inv.employeeId) continue;
    const prev = out.get(inv.employeeId);
    if (!prev) {
      out.set(inv.employeeId, inv);
      continue;
    }
    const prevLive = isLiveInvite(prev, nowMs);
    const live = isLiveInvite(inv, nowMs);
    if ((live && !prevLive) || (live === prevLive && created(inv) > created(prev))) out.set(inv.employeeId, inv);
  }
  return out;
}
