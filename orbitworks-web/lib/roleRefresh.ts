// RC1 follow-up: keeps a signed-in website's ID token in step with
// users/{uid}, so a role change or deactivation takes effect within
// seconds instead of when the token expires (up to 1 h).
//
// AuthContext watches users/{uid}. On every snapshot it asks
// tokenRefreshReason; anything but "none" forces a token refresh:
//   roleMismatch  - the doc's role/companyId differ from the token's
//                   (role changed: setEmployeeRole sets claims first)
//   roleChanged   - roleChangedAt is newer than the token (same role
//                   again, e.g. admin -> supervisor -> admin)
//   accessRevoked - accessRevokedAt is newer than the token (deactivated:
//                   the refresh fails for a disabled login -> sign out)
// Firestore rules check the token, so the website must never show a role
// its token doesn't have. Plain functions: test/roleRefresh.test.mjs.

export type TokenRoleInfo = {
  role?: unknown;
  companyId?: unknown;
  // ID token "iat" (seconds).
  iat?: unknown;
};

export type UsersDocRoleInfo = {
  role?: string;
  companyId?: string;
  roleChangedAt?: { toMillis(): number } | null;
  accessRevokedAt?: { toMillis(): number } | null;
};

export type RefreshReason = "none" | "roleMismatch" | "roleChanged" | "accessRevoked";

function ms(ts: { toMillis(): number } | null | undefined): number | null {
  if (!ts || typeof ts.toMillis !== "function") return null;
  const v = ts.toMillis();
  return Number.isFinite(v) ? v : null;
}

export function tokenRefreshReason(token: TokenRoleInfo, usersDoc: UsersDocRoleInfo): RefreshReason {
  // iat is whole seconds, rounded down: a token minted in the same second
  // as the stamp counts as newer (it can only be off by < 1 s).
  const issuedAtMs = typeof token.iat === "number" ? token.iat * 1000 + 999 : 0;
  const revokedMs = ms(usersDoc.accessRevokedAt);
  if (revokedMs !== null && revokedMs > issuedAtMs) return "accessRevoked";
  if (token.role !== usersDoc.role || token.companyId !== usersDoc.companyId) return "roleMismatch";
  const changedMs = ms(usersDoc.roleChangedAt);
  if (changedMs !== null && changedMs > issuedAtMs) return "roleChanged";
  return "none";
}

// A refresh error that means this login can't get a token any more -
// sign the website out. Anything else (network) keeps the session; the
// next snapshot or the SDK's own hourly refresh tries again.
const FATAL_AUTH_CODES = new Set([
  "auth/user-disabled",
  "auth/user-token-expired",
  "auth/user-not-found",
  "auth/invalid-user-token",
]);

export function isFatalRefreshError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && FATAL_AUTH_CODES.has(code);
}
