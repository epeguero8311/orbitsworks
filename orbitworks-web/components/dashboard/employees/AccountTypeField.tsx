"use client";

import Link from "next/link";
import { ADMIN_ACCESS_HELP, APP_TYPE_OPTIONS, type AppType } from "@/lib/accountType";
import { KIOSK_APP_NOTE, KIOSK_ENABLED } from "@/lib/kiosk";

// Task 5 v2 (A): a linked login's account type. ONE app type (radio, may
// be cleared only while Admin access is on) + Admin access on top. Kiosk
// can't have Admin, is Pro only (locked with an upgrade link on Core), and
// can't be picked for a person's own Employee App login (C a - the server
// also refuses a record with clock history). Switching type changes the
// app the next time it opens; nobody is signed out.
export function AccountTypeField({
  appType,
  onAppTypeChange,
  isAdmin,
  onIsAdminChange,
  onOpenPermissions,
  isPro,
  appAccess,
  alreadyKiosk,
  loginEmail,
}: {
  appType: AppType;
  onAppTypeChange: (value: AppType) => void;
  isAdmin: boolean;
  onIsAdminChange: (value: boolean) => void;
  onOpenPermissions?: () => void;
  isPro: boolean;
  appAccess: boolean | undefined;
  alreadyKiosk: boolean;
  loginEmail: string;
}) {
  const options = APP_TYPE_OPTIONS.filter((o) => o.value !== "kiosk" || KIOSK_ENABLED || alreadyKiosk);
  const kioskLockedCore = !isPro && !alreadyKiosk;
  const kioskLockedApp = appAccess === true && !alreadyKiosk;

  return (
    <div className="mt-3 rounded-lg border border-gray-200 px-3.5 py-2.5">
      <p className="text-sm font-medium text-gray-950">App type</p>
      <div className="mt-2 space-y-2" role="radiogroup" aria-label="App type">
        {options.map((o) => {
          const isKiosk = o.value === "kiosk";
          const disabled = isKiosk && (kioskLockedCore || kioskLockedApp);
          const checked = appType === o.value;
          return (
            <label
              key={o.value}
              className={`flex items-start gap-2.5 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              <input
                type="radio"
                name="appType"
                className="mt-0.5 h-4 w-4 accent-accent"
                checked={checked}
                disabled={disabled}
                onChange={() => onAppTypeChange(o.value)}
              />
              <span>
                <span className="flex items-center gap-2 text-sm text-gray-950">
                  {o.label}
                  {isKiosk && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Pro</span>
                  )}
                </span>
                <span className="block text-xs text-gray-600">{o.help}</span>
                {isKiosk && kioskLockedCore && (
                  <span className="block text-xs text-gray-600">
                    Kiosk is a Pro feature.{" "}
                    <Link href="/dashboard/billing" className="font-medium text-accent hover:underline">Upgrade to Pro</Link>
                  </span>
                )}
                {isKiosk && !kioskLockedCore && kioskLockedApp && (
                  <span className="block text-xs text-gray-600">
                    This person signs in to the Employee App. Invite the tablet as a Kiosk from Invites instead.
                  </span>
                )}
                {isKiosk && checked && <span className="block text-xs text-gray-600">{KIOSK_APP_NOTE}</span>}
              </span>
            </label>
          );
        })}
        {isAdmin && appType !== "none" && appType !== "kiosk" && (
          <button
            type="button"
            onClick={() => onAppTypeChange("none")}
            className="text-xs font-medium text-accent hover:underline"
          >
            No app (website only)
          </button>
        )}
        {appType === "none" && (
          <p className="text-xs text-gray-600">No app - this login uses the website only.</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
        <div>
          <p className="text-sm font-medium text-gray-950">Admin access</p>
          <p className="text-xs text-gray-600">{ADMIN_ACCESS_HELP}</p>
          {appType === "kiosk" && <p className="text-xs text-gray-600">Not available for a Kiosk.</p>}
          {onOpenPermissions && (
            <button type="button" onClick={onOpenPermissions} className="mt-1 text-xs font-medium text-accent hover:underline">
              Permissions
            </button>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isAdmin}
          aria-label="Admin access"
          disabled={appType === "kiosk"}
          onClick={() => onIsAdminChange(!isAdmin)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isAdmin ? "bg-accent" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isAdmin ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
        Login email: <span className="text-gray-950">{loginEmail || "No email on file"}</span>
      </p>
      <p className="mt-1 text-xs text-gray-600">
        To remove someone&apos;s access, deactivate them. A new app type takes effect the next time their app opens.
      </p>
    </div>
  );
}
