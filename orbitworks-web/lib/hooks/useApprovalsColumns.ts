"use client";

import { useMemo } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import {
  approvalsColumnsToSave,
  selectedApprovalsColumns,
  visibleApprovalsColumns,
  type OptionalApprovalsColumnKey,
} from "@/lib/approvalsColumns";
import { approvalsColumnsSchema } from "@/lib/validators/approvalsColumns";

// Approve Hours Columns (Task 2). Saved per COMPANY (every admin sees the
// same columns) as the top-level company field `approvalsColumns`. Owner +
// any admin can change it (D9) - firestore.rules' company update rule
// already limits writes to them, and validCompanyApprovalsColumns checks
// the value (incl. Pro-only keys).
export function useApprovalsColumns() {
  const { userData } = useAuth();
  const { settings, isPro, loading } = useCompanySettings();
  const overtimeEnabled = settings.overtimeEnabled;
  const saved = settings.approvalsColumns;

  const visible = useMemo(
    () => visibleApprovalsColumns(saved, { isPro, overtimeEnabled }),
    [saved, isPro, overtimeEnabled]
  );
  const selected = useMemo(() => selectedApprovalsColumns(saved), [saved]);

  async function save(next: readonly OptionalApprovalsColumnKey[]) {
    if (!userData?.companyId) throw new Error("No company loaded.");
    const keys = approvalsColumnsToSave(next, { isPro });
    const parsed = approvalsColumnsSchema.safeParse(keys);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Those columns can't be saved.");
    }
    await updateDoc(doc(db, "companies", userData.companyId), { approvalsColumns: parsed.data });
  }

  return { visible, selected, isPro, overtimeEnabled, loading, save };
}
