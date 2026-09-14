"use client";

import { useState, FormEvent } from "react";
import { useJobs } from "@/lib/hooks/useJobs";
import type { Job } from "@/lib/types";

export default function JobsSection() {
  const {
    jobs,
    loading: jobsLoading,
    addJob,
    updateJob,
    toggleJobActive,
    deleteJob,
  } = useJobs();

  const sortedJobs = [...jobs].sort(
    (a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0)
  );

  const [jobName, setJobName] = useState("");
  const [jobRate, setJobRate] = useState("");
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [jobError, setJobError] = useState("");

  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [confirmingRateChange, setConfirmingRateChange] = useState(false);
  const [confirmingDeleteJob, setConfirmingDeleteJob] = useState(false);

  async function handleAddJob(e: FormEvent) {
    e.preventDefault();
    setJobError("");
    setIsSubmittingJob(true);

    try {
      const rate = parseFloat(jobRate.trim());
      if (!jobName.trim() || isNaN(rate)) {
        setJobError("Enter a title and a valid hourly rate.");
        setIsSubmittingJob(false);
        return;
      }
      await addJob(jobName, rate);
      setJobName("");
      setJobRate("");
    } catch (err) {
      console.error("Add job title error:", err);
      setJobError("Couldn't add the title. Try again.");
    } finally {
      setIsSubmittingJob(false);
    }
  }

  function startEditJob(job: Job) {
    setEditingJobId(job.id);
    setEditName(job.name);
    setEditRate(String(job.hourlyRate));
    setConfirmingRateChange(false);
    setConfirmingDeleteJob(false);
  }

  function cancelEditJob() {
    setEditingJobId(null);
    setConfirmingRateChange(false);
    setConfirmingDeleteJob(false);
  }

  async function saveEditJob(job: Job) {
    const newRate = parseFloat(editRate.trim());
    if (!editName.trim() || isNaN(newRate)) return;

    const rateChanged = newRate !== job.hourlyRate;
    if (rateChanged && !confirmingRateChange) {
      setConfirmingRateChange(true);
      return;
    }

    await updateJob(job.id, editName, newRate);
    setEditingJobId(null);
    setConfirmingRateChange(false);
  }

  async function handleDeleteJob(job: Job) {
    try {
      await deleteJob(job.id);
      setEditingJobId(null);
      setConfirmingDeleteJob(false);
    } catch (err) {
      console.error("Delete job title error:", err);
      setConfirmingDeleteJob(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold text-gray-950">Titles & Pay</h2>
      <p className="mt-1 text-sm text-gray-600">
        Create titles with an hourly rate. Assign employees to a title
        instead of typing a rate by hand - editing a title's rate here
        updates pay for everyone currently assigned to it.
      </p>

      <form
        onSubmit={handleAddJob}
        className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="jobName" className="mb-1.5 block text-sm font-medium text-gray-950">
            Title name
          </label>
          <input
            id="jobName"
            type="text"
            required
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Painter"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="jobRate" className="mb-1.5 block text-sm font-medium text-gray-950">
            Hourly rate
          </label>
          <input
            id="jobRate"
            type="number"
            step="0.01"
            min="0"
            required
            value={jobRate}
            onChange={(e) => setJobRate(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="25.00"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmittingJob}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isSubmittingJob ? "Adding..." : "Add title"}
        </button>
      </form>
      {jobError && <p className="mt-2 text-sm text-red-600">{jobError}</p>}

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {jobsLoading ? (
          <p className="p-4 text-sm text-gray-600">Loading...</p>
        ) : jobs.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No titles yet. Add one above to get started.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Hourly rate</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sortedJobs.map((job) => {
                const isEditing = editingJobId === job.id;
                return (
                  <tr key={job.id} className="border-b border-gray-200 last:border-0">
                    {isEditing ? (
                      <>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editRate}
                            onChange={(e) => setEditRate(e.target.value)}
                            className="w-24 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                          />
                        </td>
                        <td className="px-4 py-2.5" colSpan={2}>
                          {confirmingDeleteJob ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-red-700">
                                Delete this title? This can&apos;t be undone.
                              </span>
                              <button
                                onClick={() => handleDeleteJob(job)}
                                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmingDeleteJob(false)}
                                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : confirmingRateChange ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-amber-700">
                                This updates pay for every employee currently
                                assigned to this title. Continue?
                              </span>
                              <button
                                onClick={() => saveEditJob(job)}
                                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={cancelEditJob}
                                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => saveEditJob(job)}
                                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditJob}
                                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => setConfirmingDeleteJob(true)}
                                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 text-gray-950">{job.name}</td>
                        <td className="px-4 py-2.5 text-gray-600">
                          ${job.hourlyRate.toFixed(2)}/hr
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              job.active
                                ? "bg-green-50 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {job.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => startEditJob(job)}
                              className="text-sm font-medium text-accent hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleJobActive(job)}
                              className="text-sm font-medium text-accent hover:underline"
                            >
                              {job.active ? "Deactivate" : "Reactivate"}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
