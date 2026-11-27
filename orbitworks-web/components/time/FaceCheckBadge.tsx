"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { ClockEvent } from "@/lib/types";
import { faceCheckLabel, isBreakEvent, photoStatus } from "@/lib/clockStatus";

// Face Verification (Pro) - shown in the Time Tracking log (both the
// search-results table and the day view), same placement convention as
// GeofenceBadge. Unlike GeofenceBadge, "not checked" is always rendered
// as an explicit gray badge rather than nothing - per spec, that state
// (no pfp, feature off, Core plan, or predates this feature) should look
// the same everywhere, not just be silent.
//
// A photo still uploading from the phone shows "Pending" instead: the
// check runs server-side the moment the photo arrives.
//
// Non-Pro companies: "Not checked" is faded with a lock; hover (or tap)
// shows a small upgrade note with a Billing link. A real result saved
// while the company was on Pro still shows as-is.
export function FaceCheckBadge({ event, isPro = true }: { event: ClockEvent; isPro?: boolean }) {
  if (isBreakEvent(event.type)) return <span className="text-gray-600">-</span>;
  const pending = !event.faceCheck && photoStatus(event) === "pending";
  if (!isPro && !event.faceCheck && !pending) return <LockedFaceBadge />;
  const { text, className } = pending
    ? { text: "Pending", className: "bg-blue-50 text-blue-700" }
    : faceCheckLabel(event.faceCheck);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {text}
    </span>
  );
}

// The popover is position: fixed so the table's overflow-x-auto wrapper
// can't clip it on the first/last row.
function LockedFaceBadge() {
  const ref = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);

  const open = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.bottom + 72 < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : r.top - 6, left: r.left, below });
  };
  // Short delay so the pointer can move from the badge onto the popover.
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setPos(null), 150);
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPos(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [pos]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <span ref={ref} className="inline-flex" onMouseEnter={open} onMouseLeave={closeSoon}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (pos) setPos(null);
          else open();
        }}
        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 opacity-60 hover:opacity-100"
        aria-label="Not checked. Face recognition is a Pro feature."
      >
        <Lock className="h-3 w-3" aria-hidden />
        Not checked
      </button>
      {pos && (
        <span
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{ top: pos.top, left: pos.left, transform: pos.below ? undefined : "translateY(-100%)" }}
          className="fixed z-50 w-52 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow-lg"
        >
          Upgrade to Pro to get face recognition.{" "}
          <Link href="/dashboard/billing" className="font-medium text-accent hover:underline">
            Go to Billing
          </Link>
        </span>
      )}
    </span>
  );
}
