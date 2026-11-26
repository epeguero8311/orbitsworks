// Task 5 v2 (A): Team -> Edit employee -> account type. Mirrors
// functions/src/employeeAccess.ts appModeFor - the server is the gate.
export type AppType = "employee" | "supervisor" | "kiosk" | "none";

export const APP_TYPE_OPTIONS: ReadonlyArray<{ value: Exclude<AppType, "none">; label: string; help: string }> = [
  { value: "employee", label: "Employee app", help: "Uses the app on their own phone to clock in/out." },
  { value: "supervisor", label: "Supervisor app", help: "Can override clock-ins and manage breaks on mobile." },
  { value: "kiosk", label: "Kiosk", help: "Shared tablet. Employees clock in/out and take breaks with their own PIN." },
];

export const ADMIN_ACCESS_HELP = "Web dashboard access. New admins start with no access until you set their permissions.";

export function appTypeOf(employee: {
  kiosk?: boolean;
  isAdmin?: boolean;
  isSupervisor?: boolean;
  appAccess?: boolean;
  appType?: AppType;
}): AppType {
  if (employee.kiosk) return "kiosk";
  const t = employee.appType;
  if (t === "employee" || t === "supervisor") return t;
  if (t === "none" && employee.isAdmin) return "none";
  if (employee.isSupervisor || employee.isAdmin) return "supervisor";
  return employee.appAccess ? "employee" : "supervisor";
}

// null = OK to save; otherwise the message to show.
export function accountTypeError(appType: AppType, isAdmin: boolean): string | null {
  if (appType === "kiosk" && isAdmin) return "Kiosk can't have Admin access.";
  if (appType === "none" && !isAdmin) return "Pick an app type or turn on Admin access. To remove someone, deactivate them.";
  return null;
}
