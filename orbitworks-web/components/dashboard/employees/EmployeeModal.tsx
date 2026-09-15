"use client";

import { useEmployeeModal } from "@/lib/hooks/useEmployeeModal";
import { EmployeePhotoAndPin } from "@/components/dashboard/employees/EmployeePhotoAndPin";
import { EmployeeDetailsFields } from "@/components/dashboard/employees/EmployeeDetailsFields";
import { EmployeeSitesField } from "@/components/dashboard/employees/EmployeeSitesField";
import { EmployeeCompanyField } from "@/components/dashboard/employees/EmployeeCompanyField";
import { EmployeeDeleteSection } from "@/components/dashboard/employees/EmployeeDeleteSection";
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
  const m = useEmployeeModal({ employee, jobs, subcontractors, companyName, companyId, onClose });

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

        <EmployeePhotoAndPin
          employeeName={employee.name}
          photoPreview={m.photoPreview}
          photoUrl={employee.photoUrl}
          onPhotoChange={m.handlePhotoChange}
          currentPin={m.currentPin}
          editingPin={m.editingPin}
          pinValue={m.pinValue}
          pinError={m.pinError}
          onTogglePinEdit={m.togglePinEdit}
          onPinInputChange={m.handlePinInputChange}
        />

        <EmployeeDetailsFields
          name={m.name}
          onNameChange={m.setName}
          jobId={m.jobId}
          onJobSelect={m.handleJobSelect}
          selectableJobs={m.selectableJobs}
          selectedJob={m.selectedJob}
          customJobTitle={m.customJobTitle}
          onCustomJobTitleChange={m.setCustomJobTitle}
          customHourlyRate={m.customHourlyRate}
          onCustomHourlyRateChange={m.setCustomHourlyRate}
          phone={m.phone}
          onPhoneChange={m.setPhone}
          isSupervisor={m.isSupervisor}
          onIsSupervisorChange={m.setIsSupervisor}
          dob={m.dob}
          onDobChange={m.setDob}
        />

        <EmployeeSitesField
          sites={sites}
          selectedSiteIds={m.selectedSiteIds}
          onToggleSite={m.toggleSite}
        />

        <EmployeeCompanyField
          employeeName={employee.name}
          companyName={companyName}
          selectableSubcontractors={m.selectableSubcontractors}
          selectedCompanyValue={m.selectedCompanyValue}
          onCompanySelect={m.handleCompanySelect}
          pendingCompanyChange={m.pendingCompanyChange}
          currentCompanyLabel={m.currentCompanyLabel}
          pendingSubcontractorName={m.pendingSubcontractorName}
          companyReason={m.companyReason}
          onCompanyReasonChange={m.setCompanyReason}
          companyError={m.companyError}
          companySubmitting={m.companySubmitting}
          onConfirm={m.handleConfirmCompanyChange}
          onCancel={m.handleCancelCompanyChange}
        />

        {m.error && <p className="mt-4 text-sm text-red-600">{m.error}</p>}
        {m.success && <p className="mt-4 text-sm text-green-700">{m.success}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <EmployeeDeleteSection
            employeeName={employee.name}
            confirmingDelete={m.confirmingDelete}
            onStartConfirm={() => m.setConfirmingDelete(true)}
            onCancelConfirm={() => m.setConfirmingDelete(false)}
            isDeleting={m.isDeleting}
            deleteError={m.deleteError}
            onDelete={m.handleDelete}
          />

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-950 hover:border-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={m.handleSave}
              disabled={m.isSaving}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {m.isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
