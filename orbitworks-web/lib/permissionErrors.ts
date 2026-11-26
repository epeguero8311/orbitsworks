// iPad round 1, item 6: when the server or the rules refuse an action for a
// Task 4 permission, the admin gets a TOAST that says exactly why:
//   "You don't have permission to add employees. Ask the owner or a Full access admin."
// instead of "Couldn't add the employee. Try again." Real network / other
// errors keep their generic retry text (the caller's own message).
//
// One place for every page:
//   catch (err) {
//     if (toastIfPermissionDenied(err, { action: "add employees", permission: "employees" })) return;
//     setError("Couldn't add the employee. Try again.");
//   }
// Where the refusal comes from:
//  - callables (functions/permission-denied): requirePermission sends
//    details { reason: "permission", permission } -> named from that key;
//    requireSite sends { reason: "notYourSite" } -> its own message; other
//    specific server messages (owner / Full access rules) are shown as-is.
//  - Firestore rules (permission-denied) and Storage (storage/unauthorized)
//    carry no reason -> named from the caller's `permission` / `action`.
// No React here (plain Node tests); components/PermissionToastHost.tsx
// shows the toast.

import { PERMISSION_KEYS, type PermissionKey } from "@/lib/adminAccess";

export const ASK_FOR_ACCESS = "Ask the owner or a Full access admin.";

// What each permission lets you do, as "You don't have permission to ___."
export const PERMISSION_ACTIONS: Record<PermissionKey, string> = {
  approveHours: "approve hours or edit time",
  employees: "create or edit employees",
  editPay: "edit pay rates and wages",
  exportPayroll: "export payroll",
  analytics: "view analytics",
  billing: "manage billing",
  settings: "change settings",
  invites: "invite admins or supervisors",
};

export type PermissionContext = {
  // "add employees", "approve hours", ... (falls back to the permission's own text)
  action?: string;
  permission?: PermissionKey;
};

type ErrLike = { code?: unknown; message?: unknown; details?: unknown } | null | undefined;

const DENIED_CODES = new Set(["permission-denied", "functions/permission-denied", "storage/unauthorized"]);
// Server texts that say nothing useful - replaced by the named message.
const GENERIC_MESSAGES = new Set([
  "",
  "not authorized.",
  "permission_denied",
  "permission denied.",
  "missing or insufficient permissions.",
]);

export function isPermissionDenied(err: unknown): boolean {
  const code = (err as ErrLike)?.code;
  return typeof code === "string" && DENIED_CODES.has(code);
}

function isPermissionKey(v: unknown): v is PermissionKey {
  return typeof v === "string" && (PERMISSION_KEYS as readonly string[]).includes(v);
}

function named(action: string): string {
  return `You don't have permission to ${action}. ${ASK_FOR_ACCESS}`;
}

// The toast text for a refused action, or null when it isn't a permission
// refusal (the caller then shows its normal error).
export function permissionDeniedMessage(err: unknown, ctx: PermissionContext = {}): string | null {
  if (!isPermissionDenied(err)) return null;
  const e = err as ErrLike;
  const details = (e?.details && typeof e.details === "object" ? e.details : {}) as { reason?: unknown; permission?: unknown };
  const message = typeof e?.message === "string" ? e.message.trim() : "";

  if (details.reason === "permission" && isPermissionKey(details.permission)) {
    const action = ctx.permission === details.permission && ctx.action ? ctx.action : PERMISSION_ACTIONS[details.permission];
    return named(action);
  }
  if (details.reason === "notYourSite" && message) return `${message} ${ASK_FOR_ACCESS}`;
  const isCallable = e?.code === "functions/permission-denied";
  if (isCallable && !GENERIC_MESSAGES.has(message.toLowerCase())) return message;
  if (ctx.action) return named(ctx.action);
  if (ctx.permission) return named(PERMISSION_ACTIONS[ctx.permission]);
  return named("do this");
}

// A save that may need several permissions (e.g. an employee edit that
// also changes the pay rate): the first one the admin doesn't have, so the
// toast names the one that actually blocked it. can = useAdminAccess().can.
export function firstMissingPermission(keys: PermissionKey[], can: (k: PermissionKey) => boolean): PermissionKey {
  return keys.find((k) => !can(k)) ?? keys[keys.length - 1];
}

// ---- the toast itself (shown by PermissionToastHost) ----
type Listener = (message: string) => void;
const listeners = new Set<Listener>();

export function subscribePermissionToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showPermissionToast(message: string): void {
  for (const l of listeners) l(message);
}

// true = it was a permission refusal and the toast is up (skip the inline
// error); false = something else, show the usual retry message.
export function toastIfPermissionDenied(err: unknown, ctx: PermissionContext = {}): boolean {
  const message = permissionDeniedMessage(err, ctx);
  if (!message) return false;
  showPermissionToast(message);
  return true;
}
