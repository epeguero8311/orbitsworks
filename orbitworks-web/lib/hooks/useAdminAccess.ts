"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  canAccessSite,
  hasAllSites,
  hasNoAccess,
  hasPermission,
  resolveAdminAccess,
  type AdminAccess,
  type PermissionKey,
} from "@/lib/adminAccess";

// Admin Permissions (Task 4): the signed-in admin's effective access, from
// users/{uid}.adminAccess (live - the user doc is already a listener in
// AuthContext). UI gating only; the rules + server enforce it for real.
export function useAdminAccess() {
  const { userData } = useAuth();
  const role = userData?.role;
  const raw = userData?.adminAccess;
  return useMemo(() => {
    const access: AdminAccess = resolveAdminAccess(role, raw);
    return {
      access,
      isOwner: access.level === "owner",
      isFull: access.level === "owner" || access.level === "full",
      allSites: hasAllSites(access),
      // D2: an Admin limited to some sites loads shift data from the server
      // (lib/shiftData.ts); everyone else keeps direct reads + listeners.
      serverReads: (role === "admin" || role === "owner") && !hasAllSites(access),
      noAccess: hasNoAccess(access),
      can: (key: PermissionKey) => hasPermission(access, key),
      canSite: (siteId: string | null | undefined) => canAccessSite(access, siteId),
    };
  }, [role, raw]);
}

export type AdminAccessInfo = ReturnType<typeof useAdminAccess>;
