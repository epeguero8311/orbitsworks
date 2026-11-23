"use client";

import { useState } from "react";
import type { ClockEvent } from "@/lib/types";
import { clockPhotoState, NO_PHOTO_TEXT, PHOTO_REMOVED_TEXT } from "@/lib/clockPhoto";

type Props = {
  event: Pick<ClockEvent, "photoUrl" | "photoRemovedAt" | "faceCheck">;
  alt: string;
  emptyText?: string;
};

const PLACEHOLDER = "flex h-full w-full items-center justify-center text-xs text-gray-600";

// A clock event's photo, filling its parent box. "Photo removed" when a
// retention sweep deleted it (or an older event lost it - see
// lib/clockPhoto.ts), the empty text when there never was one, and also
// "Photo removed" if the image file can't be loaded - never a broken image.
export function ClockPhoto({ event, alt, emptyText = NO_PHOTO_TEXT }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const state = clockPhotoState(event);

  if (state === "show" && event.photoUrl && failedUrl !== event.photoUrl) {
    const url = event.photoUrl;
    return <img src={url} alt={alt} className="h-full w-full object-cover" onError={() => setFailedUrl(url)} />;
  }
  return <div className={PLACEHOLDER}>{state === "none" ? emptyText : PHOTO_REMOVED_TEXT}</div>;
}
