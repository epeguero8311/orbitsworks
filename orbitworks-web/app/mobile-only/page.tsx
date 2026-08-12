"use client";

import Link from "next/link";
import { Orbit, Smartphone } from "lucide-react";

export default function MobileOnlyPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Orbit className="h-5 w-5 text-accent" />
          <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
        </div>

        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
          <Smartphone className="h-6 w-6 text-accent" />
        </div>

        <h1 className="text-xl font-semibold text-gray-950">
          Supervisor accounts use the mobile app
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          The web dashboard is for company admins. As a supervisor, download
          the Orbitsworks mobile app to clock employees in and out and manage
          your job sites.
        </p>

        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
