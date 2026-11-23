"use client";

import { showingText } from "@/lib/listPaging";

// Phase 10 (W3-W5, D7 a): under a long list - "Showing 20 of 57" and a
// "Show 20 more" button. Renders nothing once every row is shown.
export function ShowMoreButton({
  shown,
  total,
  nextStep,
  onShowMore,
}: {
  shown: number;
  total: number;
  nextStep: number;
  onShowMore: () => void;
}) {
  const text = showingText(shown, total);
  if (!text || nextStep <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5">
      <p className="text-xs text-gray-600">{text}</p>
      <button
        type="button"
        onClick={onShowMore}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-950 transition-colors hover:border-gray-300"
      >
        Show {nextStep} more
      </button>
    </div>
  );
}
