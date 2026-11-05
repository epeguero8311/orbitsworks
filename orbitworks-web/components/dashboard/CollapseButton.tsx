"use client";

import { ChevronDown } from "lucide-react";

// Phase 10 (W2, D11 a): the title of an Overview card as a button that
// opens / closes it. Every card starts open on every visit (no memory).
// count = shown next to the title while closed, so a closed card still says
// how many are in it.
export function CollapseButton({
  title,
  open,
  onToggle,
  count,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-2 text-left text-base font-semibold text-gray-950"
    >
      <ChevronDown className={`h-4 w-4 text-gray-600 transition-transform ${open ? "" : "-rotate-90"}`} />
      <span>{title}</span>
      {!open && count != null && <span className="font-normal text-gray-600">({count})</span>}
    </button>
  );
}
