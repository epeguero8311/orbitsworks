"use client";

import { useEmployeeModal } from "@/lib/hooks/useEmployeeModal";
import { EmployeePhotoAndPin } from "@/components/dashboard/employees/EmployeePhotoAndPin";
import { EmployeeDetailsFields } from "@/components/dashboard/employees/EmployeeDetailsFields";
import { EmployeeSitesField } from "@/components/dashboard/employees/EmployeeSitesField";
import { EmployeeCompanyField } from "@/components/dashboard/employees/EmployeeCompanyField";
import { EmployeeDeleteSection } from "@/components/dashboard/employees/EmployeeDeleteSection";
import { EmployeeAppInviteSection, type EmployeeAppInviteApi } from "@/components/dashboard/employees/EmployeeAppInviteSection";
import { DuplicateSection } from "@/components/dashboard/employees/DuplicateFlag";
import type { Employee, EmployeeInvite, JobSite, Job, Subcontractor } from "@/lib/types";
import PermissionsModal from "@/components/dashboard/employees/PermissionsModal";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { KioskAccessField } from "@/components/dashboard/employees/KioskAccessField";
import { KIOSK_ENABLED } from "@/lib/kiosk";

export function EmployeeModal({
  employee,
  sites,
  jobs,
  subcontractors,
  companyName,
  companyId,
  onClose,
  appInvite,
  appInviteApi,
  appInvitePlanOk,
  isPro,
  allEmployees,
  onOpenEmployee,
}: {
  employee: Employee;
  sites: JobSite[];
  jobs: Job[];
  subcontractors: Subcontractor[];
  companyName: string;
  companyId: string;
  onClose: () => void;
  // Phase 3B: this row's latest Employee App invite + the invite actions.
  appInvite: EmployeeInvite | undefined;
  appInviteApi: EmployeeAppInviteApi;
  appInvitePlanOk: boolean | null;
  // Task 5: Kiosk access is Pro only (locked with an upgrade link on Core).
  isPro: boolean;
  // Phase 9 (H4 a): for the possible-duplicate section (names + open).
  allEmployees: Employee[];
  onOpenEmployee: (id: string) => void;
}) {
  const m = useEmployeeModal({ employee, jobs, subcontractors, companyName, companyId, onClose });
  const adminAccess = useAdminAccess();

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
          faceReferenceBad={
            employee.faceReference?.status === "bad" &&
            employee.faceReference.photoUrl === employee.photoUrl
          }
          onPhotoChange={m.handlePhotoChange}
          confirmingRemovePhoto={m.confirmingRemovePhoto}
          onStartRemovePhoto={() => m.setConfirmingRemovePhoto(true)}
          onCancelRemovePhoto={() => m.setConfirmingRemovePhoto(false)}
          isRemovingPhoto={m.isRemovingPhoto}
          removePhotoError={m.removePhotoError}
          onRemovePhoto={m.handleRemovePhoto}
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
          confirmingRateChange={m.confirmingRateChange}
          rateEffectiveFrom={m.rateEffectiveFrom}
          onRateEffectiveFromChange={m.setRateEffectiveFrom}
          onCancelRateChange={() => m.setConfirmingRateChange(false)}
          phone={m.phone}
          onPhoneChange={m.setPhone}
          isLinked={m.isLinked}
          promoteToSupervisor={m.promoteToSupervisor}
          onPromoteToSupervisorChange={m.setPromoteToSupervisor}
          promoteEmail={m.promoteEmail}
          onPromoteEmailChange={m.setPromoteEmail}
          isAdmin={m.isAdmin}
          onIsAdminChange={m.setIsAdmin}
          onOpenPermissions={
            employee.isAdmin && employee.linkedUserId && adminAccess.isFull ? () => m.setPermissionsOpen(true) : undefined
          }
          isSupervisorAccess={m.isSupervisorAccess}
          onIsSupervisorAccessChange={m.setIsSupervisorAccess}
          dob={m.dob}
          onDobChange={m.setDob}
        />

        {KIOSK_ENABLED && (
          <KioskAccessField
            isLinked={m.isLinked}
            isPro={isPro}
            appAccess={employee.appAccess}
            alreadyKiosk={employee.kiosk === true}
            value={m.isLinked ? m.isKioskAccess : m.promoteToKiosk}
            onChange={m.isLinked ? m.setIsKioskAccess : m.setPromoteToKiosk}
            email={m.promoteEmail}
            onEmailChange={m.setPromoteEmail}
          />
        )}

        <DuplicateSection employee={employee} employees={allEmployees} onOpenEmployee={onOpenEmployee} />

        {m.permissionsOpen && employee.linkedUserId && (
          <PermissionsModal
            targetUid={employee.linkedUserId}
            targetName={employee.name}
            onClose={() => m.setPermissionsOpen(false)}
          />
        )}

        <EmployeeAppInviteSection employee={employee} invite={appInvite} api={appInviteApi} planOk={appInvitePlanOk} />

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
            isLinked={m.isLinked}
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
