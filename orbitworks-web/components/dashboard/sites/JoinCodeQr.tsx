"use client";

import { useEffect, useState } from "react";
import { qrPreviewDataUrl } from "@/lib/qrPng";

interface JoinCodeQrProps {
  link: string;
  size: number;
}

// QR preview for a crew code link. Drawn on localhost too, so the page
// looks like prod (a localhost QR just won't open on a phone).
export function JoinCodeQr({ link, size }: JoinCodeQrProps) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    qrPreviewDataUrl(link, size * 2).then((url) => alive && setSrc(url)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [link, size]);

  // A local data: URL - nothing for next/image to optimize.
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="Crew code QR" width={size} height={size} className="shrink-0 rounded-lg border border-gray-200" /> : <div className="shrink-0 rounded-lg border border-gray-200 bg-white" style={{ width: size, height: size }} />;
}
