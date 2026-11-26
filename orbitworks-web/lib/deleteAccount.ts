// Website /delete-account (cleanup 2026-11-26): the only place an app
// account can be deleted. The page signs the person in, they confirm, and
// the server (functions/src/employeeAccount.ts deleteMyEmployeeAccount)
// deletes the login, photo, selfie and PIN. The employee row and every
// clock event / timesheet stay as the employer's records.

export type DeleteAccountLogin = "employeeApp" | "staff" | "kiosk";

// Only a plain Employee App login (role "employee") can delete itself here.
// An admin - even one whose app type is the Employee app - is "staff"
// (final audit B: it would also end their website admin access); the
// server (deleteMyEmployeeAccount) refuses them too.
export function deleteAccountLoginKind(claims: { role?: unknown; appMode?: unknown }): DeleteAccountLogin {
  if (claims.role === "employee") return "employeeApp";
  if (claims.role === "kiosk") return "kiosk";
  return "staff";
}

export const DELETE_ACCOUNT_OPEN_SHIFT = "Clock out first (and end any break) in the app, then try again.";
export const DELETE_ACCOUNT_FAILED = "Couldn't delete your account. Try again.";
export const DELETE_ACCOUNT_OFFLINE = "No connection. Check your internet and try again.";

// The callable's error -> what the page shows.
export function deleteAccountErrorMessage(err: unknown): string {
  const raw = (err as { code?: unknown } | null)?.code;
  const code = typeof raw === "string" ? raw.replace(/^functions\//, "") : "";
  if (code === "failed-precondition") return DELETE_ACCOUNT_OPEN_SHIFT;
  if (code === "unavailable" || code === "deadline-exceeded") return DELETE_ACCOUNT_OFFLINE;
  return DELETE_ACCOUNT_FAILED;
}
