"use client";

import { useState } from "react";
import {
  doc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, storage, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
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
  const { currentUser } = useAuth();
  const isLinked = !!employee.linkedUserId;

  const [name, setName] = useState(employee.name);
  const [jobId, setJobId] = useState<string | null>(employee.jobId ?? null);
  const [customJobTitle, setCustomJobTitle] = useState(
    employee.jobId ? "" : employee.jobTitle ?? ""
  );
  const [customHourlyRate, setCustomHourlyRate] = useState(
    employee.jobId ? "" : employee.hourlyRate != null ? String(employee.hourlyRate) : ""
  );
  const [phone, setPhone] = useState(employee.phone ?? "");
  // Unlinked employees: the email field is optional. With an email, Save
  // creates invites/{id} with linkExistingEmployeeId, and acceptInvite
  // updates this same doc in place rather than creating a new one. Left
  // blank, Save instead calls setEmployeePinSupervisor directly - the
  // employee stays unlinked (no login, no app/dashboard access) but can
  // authorize overrides and breaks on mobile with just their PIN.
  const [promoteToSupervisor, setPromoteToSupervisor] = useState(
    !employee.linkedUserId && (employee.isSupervisor ?? false)
  );
  const [promoteEmail, setPromoteEmail] = useState("");
  // Already-linked employees (have gone through the invite flow above):
  // this is a direct role change, not a re-invite - see setEmployeeRole.
  const [isAdmin, setIsAdmin] = useState(employee.isAdmin ?? false);
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

    // Email is optional here - with one, Save sends a real invite
    // (accepting it links a login). Without one, Save just flips
    // isSupervisor directly via setEmployeePinSupervisor, no invite
    // involved, so there's nothing to dedupe against.
    const normalizedPromoteEmail = promoteEmail.trim().toLowerCase();
    const wasPinSupervisor = !isLinked && (employee.isSupervisor ?? false);

    // Checked across all roles, not just supervisor invites - a pending
    // admin invite for this email must block this too, otherwise
    // acceptInvite's query (no explicit ordering) could resolve to
    // either pending invite.
    if (!isLinked && promoteToSupervisor && normalizedPromoteEmail) {
      const existingInvites = await getDocs(
        query(
          collection(db, "invites"),
          where("companyId", "==", companyId),
          where("email", "==", normalizedPromoteEmail),
          where("status", "==", "pending")
        )
      );
      if (!existingInvites.empty) {
        setError("There's already a pending invite for that email.");
        return;
      }
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

      // isAdmin/isSupervisor/linkedUserId are role-like fields, blocked
      // from the plain updateDoc above by firestore.rules - they only
      // ever move through the invite flow, setEmployeeRole, or
      // setEmployeePinSupervisor so a linked account's users/{uid}.role
      // and custom claim stay in sync (an unlinked PIN-only supervisor
      // has neither, so there's nothing to keep in sync for them).
      if (!isLinked && promoteToSupervisor && normalizedPromoteEmail) {
        await addDoc(collection(db, "invites"), {
          email: normalizedPromoteEmail,
          companyId,
          role: "supervisor",
          assignedSiteIds: employee.assignedSiteIds ?? [],
          invitedByUid: currentUser?.uid ?? "",
          linkExistingEmployeeId: employee.id,
          status: "pending",
          createdAt: serverTimestamp(),
        });
      } else if (!isLinked && promoteToSupervisor !== wasPinSupervisor) {
        const setEmployeePinSupervisor = httpsCallable(functions, "setEmployeePinSupervisor");
        await setEmployeePinSupervisor({
          employeeId: employee.id,
          isSupervisor: promoteToSupervisor,
        });
      } else if (isLinked && isAdmin !== (employee.isAdmin ?? false)) {
        const setEmployeeRole = httpsCallable(functions, "setEmployeeRole");
        await setEmployeeRole({
          employeeId: employee.id,
          role: isAdmin ? "admin" : "supervisor",
        });
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
      // Works the same no matter the role (plain employee, supervisor,
      // or admin) or current active/inactive status - deleteEmployee
      // always does a real removal from the employees collection.
      // clockEvents/timesheetApprovals denormalize employeeName/siteName
      // at write time, so historical timesheets and reports are never
      // touched by this.
      const deleteEmployeeFn = httpsCallable(functions, "deleteEmployee");
      await deleteEmployeeFn({ employeeId: employee.id });
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
    isLinked,
    promoteToSupervisor,
    setPromoteToSupervisor,
    promoteEmail,
    setPromoteEmail,
    isAdmin,
    setIsAdmin,
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
