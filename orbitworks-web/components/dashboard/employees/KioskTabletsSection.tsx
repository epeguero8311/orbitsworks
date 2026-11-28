"use client";

import { CollapsibleCard } from "@/components/dashboard/CollapsibleCard";
import { toastIfPermissionDenied } from "@/lib/permissionErrors";
import type { Employee } from "@/lib/types";

// Kiosk records (shared iPads) on the Employees page: their own folded
// list, out of "All employees" and its counts - a tablet isn't a person and
// never uses a seat (onEmployeeWrite leaves kiosks out of the plan counts).
// Clicking a row opens the same Edit window as before (PIN, Kiosk access).
export function KioskTabletsSection({
  kiosks,
  onSelect,
  onToggleActive,
}: {
  kiosks: Employee[];
  onSelect: (employee: Employee) => void;
  onToggleActive: (employeeId: string, active: boolean) => Promise<void>;
}) {
  if (kiosks.length === 0) return null;
  const rows = [...kiosks].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  async function toggle(k: Employee) {
    try {
      await onToggleActive(k.id, !k.active);
    } catch (err) {
      console.error("Toggle kiosk active error:", err);
      toastIfPermissionDenied(err, { action: k.active ? "deactivate employees" : "activate employees", permission: "employees" });
    }
  }

  return (
    <CollapsibleCard
      title="Kiosk tablets"
      count={rows.length}
      description="Shared iPads signed in as a kiosk. They don't count toward your employee limit."
    >
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-gray-600">
          <tr>
            <th className="py-2.5 pr-6 font-medium">Name</th>
            <th className="py-2.5 pr-6 font-medium">PIN</th>
            <th className="py-2.5 pr-6 font-medium">Status</th>
            <th className="py-2.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => (
            <tr
              key={k.id}
              onClick={() => onSelect(k)}
              className="cursor-pointer border-b border-gray-200 last:border-0 hover:bg-gray-50"
            >
              <td className="py-3 pr-6 font-medium text-gray-950">{k.name}</td>
              <td className="py-3 pr-6 font-mono text-gray-950">{k.pin ?? "-"}</td>
              <td className="py-3 pr-6">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                    k.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {k.active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="py-3 text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(k);
                  }}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {k.active ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </CollapsibleCard>
  );
}
