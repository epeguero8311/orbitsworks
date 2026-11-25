"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";

// Admin Permissions (Task 4): every upgrade / billing link in the dashboard.
// Shown as a link to the owner, a Full access admin, or an admin with the
// Billing permission (the only ones the billing page and Stripe routes let
// in); everyone else gets `fallback` (default: a plain "ask the owner" hint).
export const ASK_OWNER_TO_UPGRADE = "Ask your account owner to upgrade.";

export function useCanBill(): boolean {
  return useAdminAccess().can("billing");
}

export function BillingLink({
  className,
  children,
  fallback = <span className="text-xs text-gray-600">{ASK_OWNER_TO_UPGRADE}</span>,
}: {
  className?: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const canBill = useCanBill();
  if (!canBill) return <>{fallback}</>;
  return (
    <Link href="/dashboard/billing" className={className}>
      {children}
    </Link>
  );
}
