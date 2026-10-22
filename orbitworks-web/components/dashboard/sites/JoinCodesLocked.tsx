"use client";

import Link from "next/link";
import { QrCode } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// Core/free view of the QR codes section: no list, no button, no API call.
// Billing is owner-only, so admins get a plain hint instead of a link.
export function JoinCodesLocked() {
  const { userData } = useAuth();
  const isOwner = userData?.role === "owner";

  return (
    <div className="mt-4 flex flex-col items-center rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
        <QrCode className="h-5 w-5 text-accent" />
      </div>
      <span className="mb-2 inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
        PRO
      </span>
      <p className="max-w-md text-sm text-gray-600">
        Let employees join your company from the OrbitsWorks app by scanning a QR code at the job site.
        {isOwner ? " Upgrade to Pro to create QR codes." : " Ask your account owner to upgrade to Pro."}
      </p>
      {isOwner && (
        <Link
          href="/dashboard/billing"
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Upgrade to Pro
        </Link>
      )}
    </div>
  );
}
