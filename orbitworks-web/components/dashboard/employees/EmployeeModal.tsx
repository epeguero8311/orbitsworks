"use client";

import { useState } from "react";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { Pencil } from "lucide-react";
import { db, storage, functions } from "@/lib/firebase";
import { isValidPinFormat } from "@/lib/pinUtils";
import type { Employee, JobSite, Job, Subcontractor } from "@/lib/types";

export function EmployeeModal({
  employee,
  sites,
  jobs,
  subcontractors,
  companyName,
  companyId,
  onClose,
}: {
  employee: Employee;
  sites: JobSite[];
  jobs: Job[];
  subcontractors: Subcontractor[];
  companyName: string;
  companyId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [jobId, setJobId] = useState<string | null>(employee.jobId ?? null);
  const [customJobTitle, setCustomJobTitle] = useState(
    employee.jobId ? "" : employee.jobTitle ?? ""
  );
  const [customHourlyRate, setCustomHourlyRate] = useState(
    employee.jobId ? "" : employee.hourlyRate != null ? String(employee.hourlyRate) : ""
  );
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [isSupervisor, setIsSupervisor] = useState(employee.isSupervisor ?? false);
  const [dob, setDob] = useState(employee.dob ?? "");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>(
    employee.assignedSiteIds ?? []
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // ---- Company (subcontractor) reassignment ----
  const [selectedCompanyValue, setSelectedCompanyValue] = useState(
    employee.subcontractorId ?? ""
  );
  const [pendingCompanyChange, setPendingCompanyChange] = useState(false);
  const [companyReason, setCompanyReason] = useState("");
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  // ---- Backup PIN edit ----
  // The pencil just toggles the field into an editable input - there's no
  // separate save step. A changed PIN commits (and is checked for
  // duplicates server-side via setEmployeePin) as part of the main Save
  // changes click, before anything else in the form is written, so a
  // rejected PIN blocks the whole save rather than silently getting
  // dropped while other fields go through.
  const [currentPin, setCurrentPin] = useState(employee.pin ?? "");
  const [editingPin, setEditingPin] = useState(false);
  const [pinValue, setPinValue] = useState(currentPin);
  const [pinError, setPinError] = useState<string | null>(null);

  // Include the employee's currently assigned job even if it has since
  // been deactivated, so it does not disappear from the dropdown.
  const selectableJobs = jobs.filter((j) => j.active || j.id === employee.jobId);
  const selectedJob = jobs.find((j) => j.id === jobId) ?? null;

  // Same idea for subcontractors - keep the employee's current one
  // selectable even if it has since been deactivated.
  const selectableSubcontractors = subcontractors.filter(
    (s) => s.active || s.id === employee.subcontractorId
  );
  const pendingSubcontractorName = selectedCompanyValue
    ? subcontractors.find((s) => s.id === selectedCompanyValue)?.name ?? "Unknown"
    : companyName;
  const currentCompanyLabel = employee.subcontractorId
    ? employee.subcontractorName ?? "Unknown"
    : companyName;

  function handleJobSelect(value: string) {
    setJobId(value === "" ? null : value);
  }

  function toggleSite(siteId: string) {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId]
    );
  }

  function handlePhotoChange(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  function handleCompanySelect(value: string) {
    setSelectedCompanyValue(value);
    const normalizedCurrent = employee.subcontractorId ?? "";
    if (value !== normalizedCurrent) {
      setPendingCompanyChange(true);
      setCompanyError(null);
    } else {
      setPendingCompanyChange(false);
      setCompanyReason("");
      setCompanyError(null);
    }
  }

  function handleCancelCompanyChange() {
    setSelectedCompanyValue(employee.subcontractorId ?? "");
    setPendingCompanyChange(false);
    setCompanyReason("");
    setCompanyError(null);
  }

  async function handleConfirmCompanyChange() {
    setCompanySubmitting(true);
    setCompanyError(null);
    try {
      const reassignSubcontractorFn = httpsCallable(
        functions,
        "reassignEmployeeSubcontractor"
      );
      await reassignSubcontractorFn({
        employeeId: employee.id,
        newSubcontractorId: selectedCompanyValue || null,
        ...(companyReason.trim() ? { reason: companyReason.trim() } : {}),
      });
      setPendingCompanyChange(false);
      setCompanyReason("");
    } catch (err) {
      setCompanyError(
        err instanceof Error ? err.message : "Failed to change company."
      );
    } finally {
      setCompanySubmitting(false);
    }
  }

  function togglePinEdit() {
    if (editingPin) {
      setPinValue(currentPin);
      setPinError(null);
      setEditingPin(false);
    } else {
      setPinValue(currentPin);
      setPinError(null);
      setEditingPin(true);
    }
  }

  function handlePinInputChange(value: string) {
    // Digits only, capped at 4 characters - strips anything pasted in
    // that isn't a digit rather than rejecting the whole input.
    const digitsOnly = value.replace(/\D/g, "").slice(0, 4);
    setPinValue(digitsOnly);
    setPinError(null);
  }

  async function handleSave() {
    if (!companyId) return;
    setError("");
    setSuccess("");
    setPinError(null);

    const pinChanged = editingPin && pinValue !== currentPin;

    if (pinChanged && !isValidPinFormat(pinValue)) {
      setPinError("PIN must be exactly 4 digits.");
      return;
    }

    setIsSaving(true);

    // PIN goes first and, if it's rejected (bad format, or the server-
    // side duplicate check in setEmployeePin finds it already assigned
    // to someone else), the save stops here - nothing else in the form
    // gets written on a failed PIN change.
    if (pinChanged) {
      try {
        const setEmployeePinFn = httpsCallable(functions, "setEmployeePin");
        const result = await setEmployeePinFn({
          employeeId: employee.id,
          pin: pinValue,
        });
        const data = result.data as { pin: string };
        setCurrentPin(data.pin);
        setEditingPin(false);
      } catch (err) {
        console.error("Update PIN error:", err);
        setPinError(
          err instanceof Error ? err.message : "Couldn't save this PIN. Try again."
        );
        setIsSaving(false);
        return;
      }
    }

    try {
      const employeeRef = doc(db, "companies", companyId, "employees", employee.id);

      const jobTitleToSave = selectedJob ? selectedJob.name : customJobTitle.trim();
      const hourlyRateToSave = selectedJob
        ? null
        : customHourlyRate.trim()
        ? parseFloat(customHourlyRate.trim())
        : null;

      const updates: Record<string, unknown> = {
        name: name.trim(),
        jobId: jobId,
        jobTitle: jobTitleToSave,
        hourlyRate: hourlyRateToSave,
        phone: phone.trim(),
        dob: dob || null,
        assignedSiteIds: selectedSiteIds,
      };

      if (photoFile) {
        const photoRef = ref(
          storage,
          `companies/${companyId}/employees/${employee.id}/reference.jpg`
        );
        await uploadBytes(photoRef, photoFile);
        updates.photoUrl = await getDownloadURL(photoRef);
      }

      await updateDoc(employeeRef, updates);

      // isSupervisor is a role-like field, so it goes through a callable
      // (server-verified, keeps custom claims consistent) rather than
      // being bundled into the plain field updateDoc above.
      if (isSupervisor !== (employee.isSupervisor ?? false)) {
        const setSupervisorStatus = httpsCallable(functions, "setSupervisorStatus");
        await setSupervisorStatus({ employeeId: employee.id, isSupervisor });
      }

      setSuccess("Saved.");
    } catch (err) {
      console.error("Update employee error:", err);
      setError("Couldn't save changes. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!companyId) return;
    setDeleteError("");
    setIsDeleting(true);

    try {
      const employeeRef = doc(db, "companies", companyId, "employees", employee.id);
      await deleteDoc(employeeRef);
      onClose();
    } catch (err) {
      console.error("Delete employee error:", err);
      setDeleteError("Couldn't delete this employee. Try again.");
      setIsDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <h2 className="text-xl font-semibold text-gray-950">
            Edit employee
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-950"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="mb-5 flex items-center gap-4">
          {photoPreview || employee.photoUrl ? (
            <img
              src={photoPreview ?? employee.photoUrl}
              alt={employee.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-600">
              No photo
            </div>
          )}
          <div>
            <label
              htmlFor="editPhoto"
              className="cursor-pointer rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-950 hover:border-gray-300"
            >
              Change photo
            </label>
            <input
              id="editPhoto"
              type="file"
              accept="image/*"
              onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>
          <div className="ml-auto rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-right">
            <p className="text-xs font-medium text-gray-600">Backup PIN</p>
            <div className="flex items-center justify-end gap-2">
              {editingPin ? (
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={pinValue}
                  onChange={(e) => handlePinInputChange(e.target.value)}
                  maxLength={4}
                  className="w-20 rounded-md border border-gray-200 px-2 py-1 text-right font-mono text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              ) : (
                <p className="font-mono text-lg font-semibold text-gray-950">
                  {currentPin || "-"}
                </p>
              )}
              <button
                type="button"
                onClick={togglePinEdit}
                aria-label={editingPin ? "Cancel PIN edit" : "Edit PIN"}
                className="text-gray-500 hover:text-accent"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            {pinError && <p className="mt-1 text-xs text-red-600">{pinError}</p>}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-950">
              Full name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-950">
              Job title
            </label>
            <select
              value={jobId ?? ""}
              onChange={(e) => handleJobSelect(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">Custom</option>
              {selectableJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.name} - ${job.hourlyRate.toFixed(2)}/hr
                </option>
              ))}
            </select>
            {jobId === null && (
              <input
                type="text"
                value={customJobTitle}
                onChange={(e) => setCustomJobTitle(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Site Technician"
              />
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-950">
              Hourly rate
            </label>
            {selectedJob ? (
              <input
                type="text"
                disabled
                value={`$${selectedJob.hourlyRate.toFixed(2)}/hr`}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600"
              />
            ) : (
              <input
                type="number"
                step="0.01"
                min="0"
                value={customHourlyRate}
                onChange={(e) => setCustomHourlyRate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            )}
            {selectedJob && (
              <p className="mt-1 text-xs text-gray-600">
                Rate is set by the job title. Choose Custom to edit manually.
              </p>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-950">
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />

            <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 px-3.5 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-950">Supervisor access</p>
                <p className="text-xs text-gray-600">
                  Can override clock-ins and manage breaks on mobile.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isSupervisor}
                onClick={() => setIsSupervisor((v) => !v)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  isSupervisor ? "bg-accent" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isSupervisor ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-950">
              Date of birth
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-sm font-medium text-gray-950">
            Assigned job sites
          </span>
          {sites.length === 0 ? (
            <p className="text-sm text-gray-600">No active job sites yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sites.map((site) => (
                <label
                  key={site.id}
                  className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    selectedSiteIds.includes(site.id)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selectedSiteIds.includes(site.id)}
                    onChange={() => toggleSite(site.id)}
                  />
                  {site.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-sm font-medium text-gray-950">
            Company
          </span>
          <p className="mb-2 text-xs text-gray-600">
            Which company {employee.name} currently works under. Past clock
            events stay attributed to whichever company was in effect when
            they were recorded - this only changes new events going
            forward.
          </p>
          <select
            value={selectedCompanyValue}
            onChange={(e) => handleCompanySelect(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">{companyName}</option>
            {selectableSubcontractors.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>

          {pendingCompanyChange && (
            <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-medium text-gray-950">
                Move {employee.name} from{" "}
                <span className="font-semibold">{currentCompanyLabel}</span>{" "}
                to{" "}
                <span className="font-semibold">
                  {pendingSubcontractorName}
                </span>
                ?
              </p>
              <input
                type="text"
                value={companyReason}
                onChange={(e) => setCompanyReason(e.target.value)}
                placeholder="Reason (optional)"
                className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              {companyError && (
                <p className="mt-2 text-xs text-red-600">{companyError}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={companySubmitting}
                  onClick={handleConfirmCompanyChange}
                  className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {companySubmitting ? "Moving..." : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelCompanyChange}
                  className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-4 text-sm text-green-700">{success}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <div>
            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="rounded-lg border border-red-200 px-5 py-2.5 text-sm font-medium text-red-700 hover:border-red-300 hover:bg-red-50"
              >
                Delete employee
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
                <p className="text-sm text-red-800">
                  Delete {employee.name}? This can't be undone.
                </p>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={isDeleting}
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-950 hover:border-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {isDeleting ? "Deleting..." : "Yes, delete"}
                </button>
              </div>
            )}
            {deleteError && <p className="mt-2 text-sm text-red-600">{deleteError}</p>}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-950 hover:border-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}