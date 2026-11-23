"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { Orbit, Smartphone } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

// Employee App logins never get the web dashboard - login and the dashboard
// layout both send them here. Unlike /mobile-only (supervisors are signed
// out before landing there), the employee stays signed in so the Log out
// button below is what ends the session.
export function UseAppNotice() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut(auth);
    } finally {
      router.push("/login");
    }
  }

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

        <h1 className="text-xl font-semibold text-gray-950">Please use the OrbitsWorks app</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your account is for clocking in and out from your phone. Open the OrbitsWorks mobile app
          and sign in there with the same email and password.
        </p>

        {currentUser ? (
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {signingOut ? "Logging out..." : "Log out"}
          </button>
        ) : (
          <Link href="/login" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
