// Which role tag an employee row shows. One tag at most, highest role wins:
// Kiosk (Task 5 - a shared iPad, exclusive with every other access), then
// Admin, then Supervisor, then the grey Employee tag for an employee-app
// login (appAccess - server-written only, see lib/types.ts). Employees
// created on the website with no app login get no tag.

export type EmployeeRoleTagKind = "kiosk" | "admin" | "supervisor" | "employee";

export interface EmployeeRoleFlags {
  kiosk?: boolean;
  isAdmin?: boolean;
  isSupervisor?: boolean;
  appAccess?: boolean;
}

export function employeeRoleTag(employee: EmployeeRoleFlags): EmployeeRoleTagKind | null {
  if (employee.kiosk === true) return "kiosk";
  if (employee.isAdmin === true) return "admin";
  if (employee.isSupervisor === true) return "supervisor";
  if (employee.appAccess === true) return "employee";
  return null;
}
