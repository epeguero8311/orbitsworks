"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

export function PastDueBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-red-600 px-4 py-2.5 text-sm text-white sm:px-6 lg:px-10">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>
          Your last payment failed. Adding new employees is paused until it's
          resolved.
        </span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <Link
          href="/dashboard/billing"
          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          Fix billing
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
