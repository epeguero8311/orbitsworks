"use client";

import Link from "next/link";
import {
  KIOSK_ACCESS_HELP,
  KIOSK_ACCESS_LABEL,
  KIOSK_APP_NOTE,
  kioskToggleBlocker,
} from "@/lib/kiosk";

// Task 5 (K5-K7): Edit employee -> Kiosk access. Same switch look as the
// Supervisor / Admin access rows. Exclusive with both (the hook clears them
// when this goes on). A record with no login yet gets an email field: saving
// sends a kiosk invite, and accepting it makes that login the iPad's.
// Core: shown locked with an upgrade link (K11/Plans).
export function KioskAccessField({
  isLinked,
  isPro,
  appAccess,
  alreadyKiosk,
  value,
  onChange,
  email,
  onEmailChange,
}: {
  isLinked: boolean;
  isPro: boolean;
  appAccess: boolean | undefined;
  alreadyKiosk: boolean;
  value: boolean;
  onChange: (value: boolean) => void;
  email: string;
  onEmailChange: (value: string) => void;
}) {
  const blocker = kioskToggleBlocker({ isPro, appAccess, alreadyKiosk });
  const locked = blocker !== null && !value;

  return (
    <div className="mt-3 rounded-lg border border-gray-200 px-3.5 py-2.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-gray-950">
            {KIOSK_ACCESS_LABEL}
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Pro</span>
          </p>
          <p className="text-xs text-gray-600">{KIOSK_ACCESS_HELP}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={KIOSK_ACCESS_LABEL}
          disabled={locked}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            value ? "bg-accent" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              value ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {blocker === "core" && !value && (
        <p className="mt-2 text-xs text-gray-600">
          Kiosk access is a Pro feature.{" "}
          <Link href="/dashboard/billing" className="font-medium text-accent hover:underline">
            Upgrade to Pro
          </Link>
        </p>
      )}
      {blocker === "employeeApp" && !value && (
        <p className="mt-2 text-xs text-gray-600">
          This person signs in to the Employee App. A kiosk needs its own login - add a new record for the iPad.
        </p>
      )}

      {value && (
        <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
          <p className="text-xs text-gray-600">
            {KIOSK_APP_NOTE} Turning this on removes Supervisor and Admin access. To remove the iPad later, deactivate this record.
          </p>
          {!isLinked && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-950">Email for the kiosk login</label>
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="front-ipad@company.com"
              />
              <p className="mt-1.5 text-xs text-gray-600">
                Saving sends an invite to this email. Set the password from it, then sign in on the iPad.
              </p>
            </div>
          )}
        </div>
      )}
      {!value && alreadyKiosk && (
        <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-600">
          Saving turns this login back into a Supervisor login unless you pick other access. To remove the iPad, deactivate this record instead.
        </p>
      )}
    </div>
  );
}
