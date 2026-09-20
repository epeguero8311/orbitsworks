"use client";

import Link from "next/link";
import { Orbit, ShieldAlert } from "lucide-react";

export default function NotAuthorizedPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Orbit className="h-5 w-5 text-accent" />
          <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
        </div>

        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
          <ShieldAlert className="h-6 w-6 text-accent" />
        </div>

        <h1 className="text-xl font-semibold text-gray-950">
          Oh no, nothing here
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          You don&apos;t have access to that page, or it doesn&apos;t exist.
        </p>

        <Link
          href="/dashboard"
          className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
        >
          Go to Overview
        </Link>
      </div>
    </div>
  );
}
