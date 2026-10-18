"use client";

import { useState } from "react";
import Link from "next/link";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// Owner-only, blocking - see DashboardLayout.tsx for the gate
// (userData?.role === "owner" && companyTermsVersion !== TERMS_VERSION)
// and functions/src/company.ts's acceptUpdatedTerms for the write. Closes
// itself: accepting updates companies/{companyId}.termsVersion, and
// DashboardLayout's own onSnapshot listener on that doc picks up the new
// value and stops rendering this, so there's no local "accepted" state to
// manage here.
export function TermsReacceptModal({ termsVersion }: { termsVersion: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleAccept() {
    setIsSubmitting(true);
    setError("");
    try {
      const acceptUpdatedTermsFn = httpsCallable(functions, "acceptUpdatedTerms");
      await acceptUpdatedTermsFn({ termsVersion });
    } catch {
      setError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-950">
          Our Terms have been updated
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          We've updated our Terms and Conditions, Privacy Policy, and
          Biometric Data Policy, including how we handle face
          verification and location data and your responsibilities for
          notifying and getting consent from your employees. Please
          review and accept the updated terms to continue.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link
            href="/terms"
            target="_blank"
            className="font-medium text-accent underline"
          >
            Terms and Conditions
          </Link>
          <Link
            href="/privacy"
            target="_blank"
            className="font-medium text-accent underline"
          >
            Privacy Policy
          </Link>
          <Link
            href="/biometric-policy"
            target="_blank"
            className="font-medium text-accent underline"
          >
            Biometric Data Policy
          </Link>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleAccept}
          disabled={isSubmitting}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "I agree to the updated terms"}
        </button>
      </div>
    </div>
  );
}
