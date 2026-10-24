"use client";

import Link from "next/link";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// Core/free view of the whole Crew Access page: one card, no tabs, and no
// temp link or crew code request is ever made. Billing is owner-only, so
// everyone else gets a plain hint instead of a link. The server still
// returns 403 for non-Pro - this is UI only.
export default function CrewAccessLocked() {
  const { userData } = useAuth();
  const isOwner = userData?.role === "owner";

  return (
    <div className="mt-6 flex flex-col items-center rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
        <KeyRound className="h-6 w-6 text-accent" />
      </div>
      <span className="mb-2 inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
        PRO
      </span>
      <p className="max-w-md text-sm text-gray-600">
        Crew Access is a Pro feature: clock in without the app and sign up with a crew code.
        {isOwner ? "" : " Ask your account owner to upgrade to Pro."}
      </p>
      {isOwner && (
        <Link
          href="/dashboard/billing"
          className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Upgrade to Pro
        </Link>
      )}
    </div>
  );
}
