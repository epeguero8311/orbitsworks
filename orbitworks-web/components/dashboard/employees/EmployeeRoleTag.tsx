import { employeeRoleTag, type EmployeeRoleFlags, type EmployeeRoleTagKind } from "@/lib/employeeRoleTag";

const TAGS: Record<EmployeeRoleTagKind, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-purple-50 text-purple-700" },
  supervisor: { label: "Supervisor", className: "bg-blue-50 text-blue-700" },
  employee: { label: "Employee", className: "bg-gray-100 text-gray-700" },
};

// The Admin / Supervisor / Employee pill shown next to an employee's name
// (Employees table, billing Downgrade/Delete windows). Renders nothing for
// a website-only employee.
export function EmployeeRoleTag({ employee, className = "" }: { employee: EmployeeRoleFlags; className?: string }) {
  const kind = employeeRoleTag(employee);
  if (!kind) return null;
  const tag = TAGS[kind];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tag.className} ${className}`.trim()}>
      {tag.label}
    </span>
  );
}
