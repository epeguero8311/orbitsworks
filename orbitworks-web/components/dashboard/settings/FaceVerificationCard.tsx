"use client";

import Link from "next/link";
import type { FaceVerificationSettings } from "@/lib/hooks/useCompanySettings";
import { Toggle } from "@/components/dashboard/settings/Toggle";
import { ProBadgeLink } from "@/components/dashboard/sites/GeofenceFields";

// Pro only - checks always run for every Pro company, no opt-out (see
// FACE_VERIFICATION_SPEC.md). firestore.rules is the real gate on the
// remaining alertsEnabled knob - a Core company can't write it even via a
// direct write - this card being disabled is just the honest UI
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
        Compares every clock-in and clock-out photo to the employee&apos;s
        profile photo - never blocks a clock-in.
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
        <div className="mt-4">
          <Toggle
            label="Face recognition alerts"
            checked={faceVerification.alertsEnabled}
            onChange={(v) => onFaceVerificationChange({ ...faceVerification, alertsEnabled: v })}
          />
          <p className="mt-2 text-xs text-gray-600">
            Face checks always run on every clock-in. Turn off to stop mismatch
            and no-face alerts. Badges in Time Tracking still show.
          </p>
        </div>
      )}
    </div>
  );
}
