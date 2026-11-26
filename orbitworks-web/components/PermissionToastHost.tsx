"use client";

import { useCallback, useEffect, useState } from "react";
import { Toast } from "@/components/Toast";
import { subscribePermissionToasts } from "@/lib/permissionErrors";

// Shows the "You don't have permission to ..." toast from anywhere in the
// dashboard (lib/permissionErrors.ts). Mounted once in the dashboard layout.
export function PermissionToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => subscribePermissionToasts(setMessage), []);
  const close = useCallback(() => setMessage(null), []);
  return <Toast visible={message !== null} onClose={close} message={message ?? ""} variant="error" />;
}
