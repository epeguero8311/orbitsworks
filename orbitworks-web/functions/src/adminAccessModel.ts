// GENERATED COPY of lib/adminAccess.ts (website) - keep the two identical.
// test/adminAccessParity.test.mjs checks they match. Edit both together.

// Admin Permissions (Task 4, decisions D1-D18 in
// docs/plans/overtime-columns-tips-plan.md). No imports, so tests run it
// under plain Node and functions/src/adminAccess.ts can mirror it 1:1
// (keep the two in sync by hand).
//
// Source of truth: users/{uid}.adminAccess (server-written only, by
// setAdminAccess / acceptInvite / setEmployeeRole). Custom claims carry a
// small fixed-size mirror for firestore.rules: { lvl, allSites, perms, sup }.
//
// Roles:
//  - owner: everything, never restricted (role === "owner").
//  - full:  "Full access" admin - acts like the owner (incl. billing).
//  - admin: only the sites + permissions given to them.
// Missing adminAccess on an admin = a legacy admin from before Task 4:
// All sites + every permission EXCEPT Billing (D6/D8) - nothing changes at ship.

export const PERMISSION_KEYS = [
  "approveHours",
  "employees",
  "editPay",
  "exportPayroll",
  "analytics",
  "billing",
  "settings",
  "invites",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type Permissions = Record<PermissionKey, boolean>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  approveHours: "Approve hours",
  employees: "Create / edit employees",
  editPay: "Edit pay rates & wages",
  exportPayroll: "Export payroll",
  analytics: "Analytics",
  billing: "Billing",
  settings: "Settings",
  invites: "Invite admins / supervisors",
};

// "Unassigned" in an admin's site list = shifts with no job site.
export const UNASSIGNED_SITE = "unassigned";

export type AccessLevel = "owner" | "full" | "admin";

export type StoredAdminAccess = {
  level: "full" | "admin";
  sites: "all" | string[];
  permissions: Permissions;
};

export type AdminAccess = {
  level: AccessLevel;
  sites: "all" | string[];
  permissions: Permissions;
  // True when the admin has no stored adminAccess (pre-Task 4 admin).
  legacy: boolean;
};

function allPermissions(value: boolean): Permissions {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, value])) as Permissions;
}

export const NO_PERMISSIONS: Permissions = allPermissions(false);
export const EVERY_PERMISSION: Permissions = allPermissions(true);
// D8: a legacy admin keeps everything they have today - Billing was owner-only.
export const LEGACY_ADMIN_PERMISSIONS: Permissions = { ...EVERY_PERMISSION, billing: false };

// D9: what a NEW admin (invite / Make admin) starts with.
export const NEW_ADMIN_ACCESS: StoredAdminAccess = { level: "admin", sites: [], permissions: NO_PERMISSIONS };

function readPermissions(raw: unknown): Permissions {
  const out = { ...NO_PERMISSIONS };
  if (raw && typeof raw === "object") {
    for (const k of PERMISSION_KEYS) out[k] = (raw as Record<string, unknown>)[k] === true;
  }
  return out;
}

function readSites(raw: unknown): "all" | string[] {
  if (raw === "all") return "all";
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((s): s is string => typeof s === "string" && s.length > 0))];
}

// role + the raw users/{uid}.adminAccess -> the effective access. Non-admin
// roles (supervisor/employee) get no dashboard access here.
export function resolveAdminAccess(role: string | null | undefined, raw: unknown): AdminAccess {
  if (role === "owner") return { level: "owner", sites: "all", permissions: EVERY_PERMISSION, legacy: false };
  if (role !== "admin") return { level: "admin", sites: [], permissions: NO_PERMISSIONS, legacy: false };
  if (!raw || typeof raw !== "object") {
    return { level: "admin", sites: "all", permissions: LEGACY_ADMIN_PERMISSIONS, legacy: true };
  }
  const r = raw as Record<string, unknown>;
  if (r.level === "full") return { level: "full", sites: "all", permissions: EVERY_PERMISSION, legacy: false };
  return { level: "admin", sites: readSites(r.sites), permissions: readPermissions(r.permissions), legacy: false };
}

export function hasPermission(access: AdminAccess, key: PermissionKey): boolean {
  return access.level === "owner" || access.level === "full" || access.permissions[key];
}

export function hasAllSites(access: AdminAccess): boolean {
  return access.level !== "admin" || access.sites === "all";
}

// Rule 1: shift visibility goes by the SHIFT's site (its clock-in's site).
export function canAccessSite(access: AdminAccess, siteId: string | null | undefined): boolean {
  if (hasAllSites(access)) return true;
  const list = access.sites as string[];
  return list.includes(siteId ? siteId : UNASSIGNED_SITE);
}

// "No access yet" (D9): a restricted admin with no sites and no permissions.
export function hasNoAccess(access: AdminAccess): boolean {
  return (
    access.level === "admin" &&
    access.sites !== "all" &&
    access.sites.length === 0 &&
    PERMISSION_KEYS.every((k) => !access.permissions[k])
  );
}

// Short codes for the claims mirror (keeps the token small and fixed-size).
export const PERMISSION_CODES: Record<PermissionKey, string> = {
  approveHours: "ah",
  employees: "em",
  editPay: "pay",
  exportPayroll: "exp",
  analytics: "an",
  billing: "bil",
  settings: "set",
  invites: "inv",
};

export type AccessClaims = {
  lvl: AccessLevel;
  allSites: boolean;
  perms: string[];
};

export function accessClaimsFor(access: AdminAccess): AccessClaims {
  return {
    lvl: access.level,
    allSites: hasAllSites(access),
    perms: PERMISSION_KEYS.filter((k) => hasPermission(access, k)).map((k) => PERMISSION_CODES[k]),
  };
}

// D5 hierarchy: may `caller` change `target`'s admin access / role / active
// state? Nobody touches the owner; only the owner touches Full access (and
// grants it); Full access manages regular Admins; nobody edits themselves.
export function canManageAdmin(params: {
  callerUid: string;
  caller: AdminAccess;
  targetUid: string;
  target: AdminAccess;
  nextLevel?: "full" | "admin" | null;
}): { ok: true } | { ok: false; reason: string } {
  const { callerUid, caller, targetUid, target, nextLevel } = params;
  if (target.level === "owner") return { ok: false, reason: "Nobody can change the owner." };
  if (callerUid === targetUid) return { ok: false, reason: "You can't change your own access." };
  if (caller.level !== "owner" && caller.level !== "full") {
    return { ok: false, reason: "Only the owner or a Full access admin can set admin permissions." };
  }
  if (caller.level !== "owner" && (target.level === "full" || nextLevel === "full")) {
    return { ok: false, reason: "Only the owner can give, change or remove Full access." };
  }
  return { ok: true };
}
