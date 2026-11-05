"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { Employee } from "@/lib/types";

// Phase 9 (H4 a / H5 a): the possible-duplicate flag sign-up writes when a
// new employee's name + birthday match someone already here (crew code or
// email invite sign-up only - functions/src/joinCompany.ts,
// acceptEmployeeInvite.ts). It never blocked anything. The row shows a
// badge; the Edit window shows who it may match, a link to open them, and
// Dismiss (dismissDuplicateFlag - the server removes the flag and keeps
// who dismissed it).

export function hasDuplicateFlag(employee: Employee): boolean {
  return Array.isArray(employee.possibleDuplicateOf) && employee.possibleDuplicateOf.length > 0;
}

export function DuplicateBadge({ employee }: { employee: Employee }) {
  if (!hasDuplicateFlag(employee)) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700" title="Same name and birthday as another employee. Open to check.">
      Possible duplicate
    </span>
  );
}

const dismissFn = httpsCallable(functions, "dismissDuplicateFlag");

export function DuplicateSection({ employee, employees, onOpenEmployee }: { employee: Employee; employees: Employee[]; onOpenEmployee: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!hasDuplicateFlag(employee)) return null;
  const matches = (employee.possibleDuplicateOf ?? []).map((id) => ({ id, other: employees.find((e) => e.id === id) }));

  async function dismiss() {
    setBusy(true);
    setError("");
    try {
      await dismissFn({ employeeId: employee.id });
    } catch {
      setError("Couldn't dismiss. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="font-medium text-amber-800">Possible duplicate</p>
      <p className="mt-1 text-amber-800">
        Same name and birthday as {matches.length === 1 ? "this employee" : "these employees"}. Check it is not the same person signing up twice.
      </p>
      <ul className="mt-2 space-y-1">
        {matches.map(({ id, other }) => (
          <li key={id}>
            {other ? (
              <button type="button" onClick={() => onOpenEmployee(id)} className="font-medium text-accent hover:underline">
                {other.name}{other.active ? "" : " (inactive)"} - open
              </button>
            ) : (
              <span className="text-gray-600">The other record no longer exists.</span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-red-600">{error}</p>}
      <button type="button" onClick={dismiss} disabled={busy} className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60">
        {busy ? "Dismissing..." : "Not a duplicate - dismiss"}
      </button>
    </div>
  );
}
