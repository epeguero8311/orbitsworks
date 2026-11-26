"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { ProBadgeLink } from "@/components/dashboard/sites/GeofenceFields";
import {
  APPROVALS_COLUMNS,
  APPROVALS_COLUMN_MODAL_LABELS,
  MAX_APPROVALS_COLUMNS,
  PRO_APPROVALS_COLUMNS,
  OVERTIME_APPROVALS_COLUMNS,
  TIPS_APPROVALS_COLUMNS,
  REQUIRED_APPROVALS_COLUMNS,
  approvalsColumnsUsed,
  isOptionalApprovalsColumn,
  type OptionalApprovalsColumnKey,
} from "@/lib/approvalsColumns";
import { toastIfPermissionDenied } from "@/lib/permissionErrors";

// Approve Hours Columns modal (Task 2). Show/hide only, saved per company.
// - Name + Status: always on.
// - Max 8 counting Name + Status. A column that is on but hidden right now
//   because Overtime is OFF still takes a slot (it stays saved, D2).
// - Type + Device: Pro. Off Pro they are locked with the PRO pill and don't
//   take a slot (dropped on save, D5/D6).
// - Regular Hours / Overtime Hours: greyed out while Overtime is OFF - they
//   can be turned off but not on (D2).
// - Tips (Task 3): same, while the Tips toggle is OFF.
// - Job off: note that approvals then use the shift's saved job or the
//   employee's default job (D7).
export default function ColumnsModal({
  selected: initialSelected,
  isPro,
  overtimeEnabled,
  tipsEnabled,
  onClose,
  onSave,
}: {
  selected: OptionalApprovalsColumnKey[];
  isPro: boolean;
  overtimeEnabled: boolean;
  tipsEnabled: boolean;
  onClose: () => void;
  onSave: (keys: OptionalApprovalsColumnKey[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<OptionalApprovalsColumnKey[]>(initialSelected);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const used = approvalsColumnsUsed(selected, { isPro });
  const full = used >= MAX_APPROVALS_COLUMNS;

  function toggle(key: OptionalApprovalsColumnKey) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);
    try {
      await onSave(selected);
      onClose();
    } catch (err) {
      console.error("Failed to save Approve Hours columns:", err);
      setSaving(false);
      if (toastIfPermissionDenied(err, { action: "change the Approve Hours columns", permission: "settings" })) return;
      setErrorMsg(err instanceof Error ? err.message : "Couldn't save the columns.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approvals-columns-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 id="approvals-columns-title" className="text-base font-semibold text-gray-950">
            Columns
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Pick which columns show on Approve Hours. Every admin in your company sees the same columns.
          </p>
          <p className={`mt-2 text-xs font-medium ${full ? "text-amber-700" : "text-gray-600"}`}>
            {used} of {MAX_APPROVALS_COLUMNS} columns
            {full && " - turn one off to add another"}
          </p>
        </div>

        <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto px-6">
          {APPROVALS_COLUMNS.map(({ key }) => {
            const label = APPROVALS_COLUMN_MODAL_LABELS[key];
            if ((REQUIRED_APPROVALS_COLUMNS as readonly string[]).includes(key)) {
              return (
                <li key={key} className="flex items-center justify-between py-3">
                  <span className="text-sm text-gray-950">{label}</span>
                  <span className="text-xs text-gray-400">Always on</span>
                </li>
              );
            }
            if (!isOptionalApprovalsColumn(key)) return null;

            const proLocked = !isPro && PRO_APPROVALS_COLUMNS.includes(key);
            const overtimeOff = !overtimeEnabled && OVERTIME_APPROVALS_COLUMNS.includes(key);
            const tipsOff = !tipsEnabled && TIPS_APPROVALS_COLUMNS.includes(key);
            const checked = !proLocked && selected.includes(key);
            // Turning a column OFF is always allowed; turning one ON needs
            // a free slot, Pro for Type/Device, Overtime for the OT ones, Tips for Tips.
            const disabled = proLocked || (!checked && (full || overtimeOff || tipsOff));
            const id = `approvals-column-${key}`;

            return (
              <li key={key} className={`py-3 ${overtimeOff || tipsOff || proLocked ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor={id}
                    className={`flex items-center gap-2 text-sm text-gray-950 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    {proLocked && <Lock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />}
                    {label}
                    {proLocked && <ProBadgeLink />}
                  </label>
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(key)}
                    className="h-4 w-4 rounded border-gray-300 disabled:cursor-not-allowed"
                  />
                </div>
                {overtimeOff && (
                  <p className="mt-1 text-xs text-gray-500">Turn on Overtime in Export Settings to show this column.</p>
                )}
                {tipsOff && (
                  <p className="mt-1 text-xs text-gray-500">Turn on Tips in Export Settings to show this column.</p>
                )}
                {key === "job" && !checked && (
                  <p className="mt-1 text-xs text-amber-700">
                    With Job hidden, approvals keep the shift&apos;s saved job or use the employee&apos;s default job.
                    On a day with 2+ jobs that can change overtime pay.
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="border-t border-gray-200 px-6 py-4">
          {errorMsg && <p className="mb-2 text-xs text-red-600">{errorMsg}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
