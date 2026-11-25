// Login role helpers, pure (no Firebase), so both client code and server
// API routes can use them.

// Task 5 (K9): owner/admin/supervisor. An ALLOWLIST - never "not employee",
// which a new role (kiosk) would pass.
export function isStaffRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "supervisor";
}

// Logins that only use the app and never get the dashboard: Employee App
// and Kiosk (Task 5). They stay signed in on /use-app.
export function isAppOnlyRole(role: string | null | undefined): boolean {
  return role === "employee" || role === "kiosk";
}
