"use client";

import { useRef } from "react";
import { Calendar } from "lucide-react";

export function ApprovalsHeader({
  mode,
  onModeChange,
  date,
  minDate,
  weekStart,
  weekEnd,
  atMin,
  pendingCount,
  onShiftRange,
  onSetDate,
}: {
  mode: "day" | "week";
  onModeChange: (mode: "day" | "week") => void;
  date: string;
  minDate: string;
  weekStart: string;
  weekEnd: string;
  atMin: boolean;
  pendingCount: number;
  onShiftRange: (steps: number) => void;
  onSetDate: (date: string) => void;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  const dayLabel = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const weekLabel = `${new Date(`${weekStart}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${new Date(`${weekEnd}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
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
        <p className="mt-1 text-sm text-gray-600">
          {pendingCount} pending {mode === "week" ? "this week" : "today"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-gray-200 p-0.5">
          <button
            type="button"
            onClick={() => onModeChange("day")}
            className={`rounded px-3 py-1 text-sm font-medium ${
              mode === "day" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => onModeChange("week")}
            className={`rounded px-3 py-1 text-sm font-medium ${
              mode === "week" ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Week
          </button>
        </div>
        <button
          onClick={() => onSetDate(todayKey())}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-300"
        >
          Today
        </button>
        <button
          onClick={() => onShiftRange(-1)}
          disabled={atMin}
          className="rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-600 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200"
        >
          {"<"}
        </button>
        <span className="text-sm font-medium text-gray-950">
          {mode === "week" ? weekLabel : dayLabel}
        </span>
        <button
          onClick={() => onShiftRange(1)}
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
