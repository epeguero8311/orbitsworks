"use client";

import { useState } from "react";
import { dateKey } from "@/lib/reportUtils";
import type { Job } from "@/lib/types";

type RateChange = { previousRate: number; previousHistory?: Job["rateHistory"]; effectiveFrom: string };

// Phase 10 (W5, D12 a): edit a title in a window, like Edit site, instead of
// on its row. Holds the name, the rate (a changed rate asks for its
// "effective from" date first, same rule as before), Deactivate /
// Reactivate and Delete (with its own confirm). The row only has Edit.
export function EditJobModal({
  job,
  updateJob,
  toggleJobActive,
  deleteJob,
  onClose,
}: {
  job: Job;
  updateJob: (jobId: string, name: string, hourlyRate: number, rateChange?: RateChange) => Promise<void>;
  toggleJobActive: (job: Job) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(job.name);
  const [rate, setRate] = useState(String(job.hourlyRate));
  const [confirmingRate, setConfirmingRate] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(dateKey(new Date()));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const newRate = parseFloat(rate.trim());
  const isValid = name.trim() !== "" && !isNaN(newRate) && newRate >= 0;
  const rateChanged = isValid && newRate !== job.hourlyRate;

  async function run(action: () => Promise<void>, failText: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      onClose();
    } catch (err) {
      console.error(failText, err);
      setError(failText);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!isValid) return;
    if (rateChanged && !confirmingRate) {
      setConfirmingRate(true);
      return;
    }
    const change = rateChanged ? { previousRate: job.hourlyRate, previousHistory: job.rateHistory, effectiveFrom } : undefined;
    run(() => updateJob(job.id, name, newRate, change), "Couldn't save the title. Try again.");
  }

  const btn = "rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-job-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <h2 id="edit-job-title" className="text-xl font-semibold text-gray-950">Edit title</h2>
          <button onClick={onClose} disabled={busy} className="text-sm text-gray-600 hover:text-gray-950" aria-label="Close">
            Close
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="editJobName" className="mb-1.5 block text-sm font-medium text-gray-950">Title name</label>
            <input
              id="editJobName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="editJobRate" className="mb-1.5 block text-sm font-medium text-gray-950">Hourly rate</label>
            <input
              id="editJobRate"
              type="number"
              step="0.01"
              min="0"
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                setConfirmingRate(false);
              }}
              className="w-40 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {confirmingRate && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">
                This updates pay for every employee currently assigned to this title. Hours before the effective date keep costing at
                the old rate in Analytics.
              </p>
              <label className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                Effective from
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="rounded-md border border-amber-200 px-2 py-1 text-xs text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </label>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <div>
              <p className="text-sm font-medium text-gray-950">{job.active ? "Active" : "Inactive"}</p>
              <p className="text-xs text-gray-600">
                {job.active ? "Can be picked for employees." : "Hidden from the title list for employees."}
              </p>
            </div>
            <button
              onClick={() => run(() => toggleJobActive(job), "Couldn't change the status. Try again.")}
              disabled={busy}
              className="text-sm font-medium text-accent hover:underline disabled:opacity-60"
            >
              {job.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>

          <div className="border-t border-gray-200 pt-4">
            {confirmingDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-red-700">Delete this title? This can&apos;t be undone.</span>
                <button
                  onClick={() => run(() => deleteJob(job.id), "Couldn't delete the title. Try again.")}
                  disabled={busy}
                  className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy ? "Deleting..." : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmingDelete(true)} className="text-sm font-medium text-red-600 hover:underline">
                Delete title
              </button>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button onClick={onClose} disabled={busy} className={`${btn} border border-gray-200 text-gray-950 hover:border-gray-300`}>
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!isValid || busy}
              className={`${btn} bg-accent text-white transition-colors hover:bg-accent-hover`}
            >
              {busy ? "Saving..." : confirmingRate ? "Confirm new rate" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
