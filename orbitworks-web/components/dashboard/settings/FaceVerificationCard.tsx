"use client";

import Link from "next/link";
import type { FaceVerificationSettings } from "@/lib/hooks/useCompanySettings";
import { Toggle } from "@/components/dashboard/settings/Toggle";
import { ProBadgeLink } from "@/components/dashboard/sites/GeofenceFields";

// Pro only, off by default even once on Pro (it costs money and scans
// faces - see FACE_VERIFICATION_SPEC.md). firestore.rules is the real
// gate - a Core company can't actually get this to true even via a
// direct write - this toggle being disabled is just the honest UI
// reflection of that, not the only thing stopping it.
export function FaceVerificationCard({
  isPro,
  faceVerification,
  onFaceVerificationChange,
}: {
  isPro: boolean;
  faceVerification: FaceVerificationSettings;
  onFaceVerificationChange: (value: FaceVerificationSettings) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-950">Face verification</h2>
        {!isPro && <ProBadgeLink />}
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Compares clock-in photos to the employee&apos;s profile photo and flags
        mismatches - never blocks a clock-in.
      </p>

      {!isPro ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center">
          <p className="text-sm text-gray-600">Face verification is a Pro feature.</p>
          <Link
            href="/dashboard/billing"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : (
        <div className="mt-2">
          <Toggle
            label="Enable face verification"
            checked={faceVerification.enabled}
            onChange={(v) => onFaceVerificationChange({ ...faceVerification, enabled: v })}
          />
        </div>
      )}
    </div>
  );
}
