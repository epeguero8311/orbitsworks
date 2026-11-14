"use client";

import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { Employee } from "@/lib/types";

// Employee PINs for the Employees page (prod-readiness item 7). The PIN is
// moving off employees/{id} (every admin AND supervisor can read that doc)
// to the server-only employeePins/{id}; admins get it through the
// getEmployeePins callable (functions/src/pins.ts, admin/owner only).
//
// withPins() puts each employee's PIN back on `pin`, so the table and the
// Edit Employee modal read it exactly as before. Until the callable
// answers (or if it fails, e.g. functions not deployed yet) the old
// employee.pin field is used, so nothing shows "-" during the switch.
//
// Refetched whenever an employee is added/removed or any PIN changes (every
// PIN write also sets fieldEditedAt.pin on the employee doc, which the live
// employee list sees).

// Shape of functions/src/employeePinTypes.ts EmployeePinsResult.
type EmployeePinsResult = { pins: Record<string, string> };

const getEmployeePinsFn = httpsCallable<Record<string, never>, EmployeePinsResult>(functions, "getEmployeePins");

function pinSignature(employees: Employee[]): string {
  return employees
    .map((e) => `${e.id}:${e.fieldEditedAt?.pin?.toMillis?.() ?? ""}`)
    .sort()
    .join(",");
}

export function useEmployeePins(employees: Employee[], enabled: boolean) {
  const [pins, setPins] = useState<Record<string, string> | null>(null);
  const signature = pinSignature(employees);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getEmployeePinsFn({})
      .then((res) => {
        if (!cancelled) setPins(res.data.pins ?? {});
      })
      .catch(() => {
        // Keep the last answer (or the old field) - never blank the column.
      });
    return () => {
      cancelled = true;
    };
  }, [signature, enabled]);

  return useMemo(() => {
    if (!pins) return employees;
    return employees.map((e) => (pins[e.id] ? { ...e, pin: pins[e.id] } : e));
  }, [employees, pins]);
}
