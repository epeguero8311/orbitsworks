"use client";

import { useState } from "react";
import type { ClockEvent } from "@/lib/types";
import { effectiveDate } from "@/lib/clockEventDetailUtils";
import { sessionFaceTag, sessionPhotoView, sessionSourceTag } from "@/lib/sessionReview";
import { ClockPhotoBlock } from "@/components/time/ClockPhotoBlock";
import { AdjustTimeControl, type AdjustTimeProps } from "@/components/dashboard/clockEventDetail/AdjustTimeControl";
import { AdjustmentHistoryList } from "@/components/dashboard/clockEventDetail/AdjustmentHistoryList";

function Tag({ text, className }: { text: string; className: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{text}</span>;
}

// One Clock In / Clock Out card: photo (or the gray "No face detected" /
// "No photo" box), time, source tag, face tag, audit history and - while
// the session is pending - "Adjust time".
export function SessionPhotoCard({
  label,
  event,
  canEdit,
  adjust,
}: {
  label: string;
  event: ClockEvent;
  canEdit: boolean;
  adjust: AdjustTimeProps;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [revealPhoto, setRevealPhoto] = useState(false);
  const view = sessionPhotoView(event);
  const source = sessionSourceTag(event.source);
  const face = sessionFaceTag(event);
  const when = effectiveDate(event);
  const history = event.adjustmentHistory ?? [];

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">{label}</p>
        {(event.adjustedTimestamp || history.length > 0) && (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Adjusted
          </button>
        )}
      </div>

      {view.kind === "placeholder" && !revealPhoto ? (
        <>
          <div className="mt-3 flex aspect-square w-full items-center justify-center rounded-md bg-gray-100 px-2 text-center text-sm text-gray-600">
            {view.text}
          </div>
          {/* Decision 3B: a no-face photo still has an image behind it. */}
          {event.photoUrl && (
            <button
              type="button"
              onClick={() => setRevealPhoto(true)}
              className="mt-1 text-xs font-medium text-accent hover:underline"
            >
              Show photo anyway
            </button>
          )}
        </>
      ) : (
        <ClockPhotoBlock event={event} label={label} showReferenceCompare={false} />
      )}

      <p className="mt-3 font-mono text-sm text-gray-950">{when ? when.toLocaleString() : "-"}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Tag {...source} />
        <Tag {...face} />
      </div>

      {showHistory && history.length > 0 && <AdjustmentHistoryList history={history} />}
      {canEdit && <AdjustTimeControl event={event} {...adjust} />}
    </div>
  );
}
