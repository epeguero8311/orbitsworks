import { appTypeOf, type AppType } from "@/lib/accountType";
import type { EmployeeRoleTagKind } from "@/lib/employeeRoleTag";

// Task 5 v2 (2): every tag an account shows in Invites - its app type plus
// Admin on top (Employee app + Admin = two tags). Kiosk is always alone.
// Website-only employees (no login) get none.
export function accountTags(employee: {
  kiosk?: boolean;
  isAdmin?: boolean;
  isSupervisor?: boolean;
  appAccess?: boolean;
  appType?: AppType;
  linkedUserId?: string | null;
}): EmployeeRoleTagKind[] {
  if (employee.kiosk === true) return ["kiosk"];
  if (!employee.linkedUserId) return employee.isSupervisor ? ["supervisor"] : [];
  const t = appTypeOf(employee);
  const tags: EmployeeRoleTagKind[] = [];
  if (t === "employee" || t === "supervisor") tags.push(t);
  if (employee.isAdmin) tags.push("admin");
  return tags;
}
