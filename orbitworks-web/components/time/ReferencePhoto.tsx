"use client";

import { useState } from "react";
import { NO_PROFILE_PHOTO_TEXT } from "@/lib/clockPhoto";

const PLACEHOLDER = "flex h-full w-full items-center justify-center text-xs text-gray-600";

// The employee's profile photo used for a face check (faceCheck.
// referencePhotoUrl), filling its parent box. "No profile photo" when there
// is none or the file can't be loaded (e.g. replaced or deleted since) -
// never a broken image.
export function ReferencePhoto({ url, alt }: { url: string | null | undefined; alt: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && failedUrl !== url) {
    return <img src={url} alt={alt} className="h-full w-full object-cover" onError={() => setFailedUrl(url)} />;
  }
  return <div className={PLACEHOLDER}>{NO_PROFILE_PHOTO_TEXT}</div>;
}
