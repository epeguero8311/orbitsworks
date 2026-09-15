"use client";

import { useState } from "react";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, storage, functions } from "@/lib/firebase";
import { isValidPinFormat } from "@/lib/pinUtils";
import type { Employee, Job, Subcontractor } from "@/lib/types";

export function useEmployeeModal({
  employee,
  jobs,
  subcontractors,
  companyName,
  companyId,
  onClose,
}: {
  employee: Employee;
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

  return {
    // photo
    photoFile,
    photoPreview,
    handlePhotoChange,
    // pin
    currentPin,
    editingPin,
    pinValue,
    pinError,
    togglePinEdit,
    handlePinInputChange,
    // fields
    name,
    setName,
    jobId,
    customJobTitle,
    setCustomJobTitle,
    customHourlyRate,
    setCustomHourlyRate,
    selectableJobs,
    selectedJob,
    handleJobSelect,
    phone,
    setPhone,
    isSupervisor,
    setIsSupervisor,
    dob,
    setDob,
    // sites
    selectedSiteIds,
    toggleSite,
    // company
    selectedCompanyValue,
    handleCompanySelect,
    pendingCompanyChange,
    companyReason,
    setCompanyReason,
    companySubmitting,
    companyError,
    handleConfirmCompanyChange,
    handleCancelCompanyChange,
    selectableSubcontractors,
    pendingSubcontractorName,
    currentCompanyLabel,
    // save
    isSaving,
    error,
    success,
    handleSave,
    // delete
    confirmingDelete,
    setConfirmingDelete,
    isDeleting,
    deleteError,
    handleDelete,
  };
}
