"use client";

import { useRef } from "react";
import { Calendar } from "lucide-react";
import { localDateKey } from "@/lib/reportUtils";

export function ApprovalsDayHeader({
  date,
  minDate,
  pendingCount,
  onShiftDay,
  onSetDate,
}: {
  date: string;
  minDate: string;
  pendingCount: number;
  onShiftDay: (days: number) => void;
  onSetDate: (date: string) => void;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const atMinDate = date <= minDate;

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  function todayKey() {
    return localDateKey(new Date());
  }

  function openPicker() {
    const el = dateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (el?.showPicker) el.showPicker();
    else el?.focus();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-gray-950">Timesheet Approvals</h1>
        <p className="mt-1 text-sm text-gray-600">{pendingCount} pending today</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSetDate(todayKey())}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-300"
        >
          Today
        </button>
        <button
          onClick={() => onShiftDay(-1)}
          disabled={atMinDate}
          className="rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-600 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200"
        >
          {"<"}
        </button>
        <span className="text-sm font-medium text-gray-950">{dateLabel}</span>
        <button
          onClick={() => onShiftDay(1)}
          className="rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-600 hover:border-gray-300"
        >
          {">"}
        </button>
        <button
          type="button"
          onClick={openPicker}
          className="relative rounded-md border border-gray-200 p-1.5 text-gray-600 hover:border-gray-300"
          aria-label="Pick a date"
        >
          <Calendar className="h-4 w-4" />
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            min={minDate}
            onChange={(e) => e.target.value && onSetDate(e.target.value)}
            className="absolute inset-0 h-full w-full opacity-0"
          />
        </button>
      </div>
    </div>
  );
}