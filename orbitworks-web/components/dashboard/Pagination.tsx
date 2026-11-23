"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  start: number; // 0-based index of the first item on the page
  end: number; // exclusive
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

const btn =
  "flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-950 transition-colors hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50";

export function Pagination({ start, end, total, hasPrev, hasNext, onPrev, onNext }: PaginationProps) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5">
      <p className="text-xs text-gray-600">
        {start + 1}-{end} of {total}
      </p>
      <div className="flex gap-2">
        <button onClick={onPrev} disabled={!hasPrev} className={btn}>
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </button>
        <button onClick={onNext} disabled={!hasNext} className={btn}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
