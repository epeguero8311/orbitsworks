"use client";

import { ClockEvent } from "@/lib/types";
import { photoStatus } from "@/lib/clockStatus";
import { ClockPhoto } from "@/components/time/ClockPhoto";
import { clockPhotoState } from "@/lib/clockPhoto";
import { ReferencePhoto } from "@/components/time/ReferencePhoto";

// A clock event's proof photo, square, with the profile photo beside it
// when showReferenceCompare is on. Pulled out of Time Tracking's EventSide
// (same markup) so Timesheet Approvals > Session review shows the photo the
// same way.
export function ClockPhotoBlock({
  event,
  label,
  showReferenceCompare,
}: {
  event: ClockEvent;
  label: string;
  showReferenceCompare: boolean;
}) {
  // Shown in place of the photo while it is still uploading or never
  // arrived. Otherwise ClockPhoto shows the photo, "Photo removed"
  // (retention sweep) or "No photo recorded".
  const photoState = photoStatus(event);
  const photoNotice =
    clockPhotoState(event) === "removed"
      ? null
      : photoState === "pending"
        ? "Photo uploading from the phone"
        : photoState === "missing"
          ? "Photo was taken but never arrived"
          : null;
  const noPhotoClass = photoState === "missing" ? "text-red-700" : "text-gray-600";

  return showReferenceCompare ? (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div>
        <p className="mb-1 text-center text-xs text-gray-500">Clock photo</p>
        <div className="aspect-square w-full overflow-hidden rounded-md bg-gray-100">
          {photoNotice ? (
            <div className={`flex h-full w-full items-center justify-center px-2 text-center text-xs ${noPhotoClass}`}>
              {photoNotice}
            </div>
          ) : (
            <ClockPhoto event={event} alt={`${label} proof photo`} />
          )}
        </div>
      </div>
      <div>
        <p className="mb-1 text-center text-xs text-gray-500">Profile photo</p>
        <div className="aspect-square w-full overflow-hidden rounded-md bg-gray-100">
          <ReferencePhoto url={event.faceCheck?.referencePhotoUrl} alt="Employee profile photo" />
        </div>
      </div>
    </div>
  ) : (
    <div className="mt-3 aspect-square w-full overflow-hidden rounded-md bg-gray-100">
      {photoNotice ? (
        <div className={`flex h-full w-full items-center justify-center px-2 text-center text-xs ${noPhotoClass}`}>
          {photoNotice}
        </div>
      ) : (
        <ClockPhoto event={event} alt={`${label} proof photo`} />
      )}
    </div>
  );
}
