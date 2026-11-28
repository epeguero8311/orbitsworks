"use client";

import { useState, type ReactNode } from "react";

// A card whose body folds away behind its header - closed on every page
// load, same look as the Invites section (InvitesSection.tsx). For long
// lists that most visits don't need open: Settings -> Devices / Kiosks and
// the Employees page's kiosk tablets (a 25-tablet company is a long scroll).
// `id` stays on the outer card so Settings search can still scroll to it.
export function CollapsibleCard({
  id,
  title,
  count,
  description,
  children,
}: {
  id?: string;
  title: string;
  count?: number | null;
  description?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div id={id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-6 py-4 text-left"
      >
        <span>
          <span className="block text-base font-semibold text-gray-950">
            {title}
            {count != null && <span className="ml-2 font-normal text-gray-600">({count})</span>}
          </span>
          {description && <span className="mt-1 block text-sm text-gray-600">{description}</span>}
        </span>
        <span className="mt-1 text-sm text-gray-600" aria-hidden>{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div className="border-t border-gray-200 px-6 py-4">{children}</div>}
    </div>
  );
}
