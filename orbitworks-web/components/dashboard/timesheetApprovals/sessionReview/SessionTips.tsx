"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useTipHistory } from "@/lib/hooks/useTipHistory";
import { formatTipCents, tipAmountSchema } from "@/lib/validators/shiftTip";

// Tips (Task 3): the shift's tip in Session review (admin/owner only, shown
// only while the Tips toggle is ON). Editable before AND after approval -
// saving never changes the approval (setShiftTip). Shows "Last edited by
// {Name}" + an (i) that opens every change (amount, admin, time).
function formatWhen(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function SessionTips({
  clockInEventId,
  tipCents,
  lastEditedByName,
  onSave,
}: {
  clockInEventId: string;
  tipCents: number;
  lastEditedByName: string | null;
  onSave: (amountCents: number) => Promise<void>;
}) {
  const [value, setValue] = useState(tipCents > 0 ? (tipCents / 100).toFixed(2) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const history = useTipHistory(clockInEventId, historyOpen, version);

  const parsed = tipAmountSchema.safeParse(value);
  const unchanged = parsed.success && parsed.data === tipCents;

  async function handleSave() {
    setError(null);
    setSaved(false);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the tip amount.");
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
      setValue(parsed.data > 0 ? (parsed.data / 100).toFixed(2) : "");
      setSaved(true);
      setVersion((v) => v + 1);
    } catch (err) {
      console.error("Failed to save tip:", err);
      setError("Couldn't save the tip. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <label htmlFor={`tip-${clockInEventId}`} className="text-xs font-medium uppercase tracking-wide text-gray-600">
        Tips
      </label>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex flex-1 items-center rounded-md border border-gray-200 px-2 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
          <span className="text-sm text-gray-600">$</span>
          <input
            id={`tip-${clockInEventId}`}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !unchanged && !saving) handleSave();
            }}
            className="w-full bg-transparent px-1 py-1.5 text-sm text-gray-950 outline-none"
          />
        </div>
        <button
          type="button"
          disabled={saving || unchanged}
          onClick={handleSave}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {saved && !error && <p className="mt-1.5 text-xs text-green-700">Saved.</p>}

      {lastEditedByName && (
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-600">
          <span>Last edited by {lastEditedByName}</span>
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            aria-expanded={historyOpen}
            aria-label="Tip history"
            className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-950"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {historyOpen && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          {history.loading && history.edits.length === 0 && <p className="text-xs text-gray-500">Loading...</p>}
          {history.error && <p className="text-xs text-red-600">{history.error}</p>}
          {!history.loading && !history.error && history.edits.length === 0 && (
            <p className="text-xs text-gray-500">No changes yet.</p>
          )}
          <ul className="space-y-1">
            {history.edits.map((e) => (
              <li key={e.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-2 text-xs text-gray-600">
                <span className="font-medium text-gray-950">{formatTipCents(e.amountCents)}</span>
                <span className="truncate">{e.editedByName}</span>
                <span className="whitespace-nowrap">{formatWhen(e.editedAt?.toDate?.() ?? null)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
