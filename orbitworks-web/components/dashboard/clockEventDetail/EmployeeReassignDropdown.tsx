"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Check } from "lucide-react";

export function EmployeeReassignDropdown({
  currentEmployeeId,
  employees,
  onPick,
}: {
  currentEmployeeId: string;
  employees: { id: string; name: string }[];
  onPick: (employeeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-accent hover:border-accent hover:bg-blue-50"
      >
        <Pencil className="h-3 w-3" />
        Change
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {employees.map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(emp.id);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-950 hover:bg-gray-50"
            >
              {emp.name}
              {emp.id === currentEmployeeId && (
                <Check className="h-3.5 w-3.5 text-accent" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
