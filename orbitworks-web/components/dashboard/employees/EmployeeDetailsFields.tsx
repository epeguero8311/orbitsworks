"use client";

import type { Job } from "@/lib/types";

export function EmployeeDetailsFields({
  name,
  onNameChange,
  jobId,
  onJobSelect,
  selectableJobs,
  selectedJob,
  customJobTitle,
  onCustomJobTitleChange,
  customHourlyRate,
  onCustomHourlyRateChange,
  phone,
  onPhoneChange,
  isLinked,
  promoteToSupervisor,
  onPromoteToSupervisorChange,
  promoteEmail,
  onPromoteEmailChange,
  isAdmin,
  onIsAdminChange,
  isSupervisorAccess,
  onIsSupervisorAccessChange,
  dob,
  onDobChange,
}: {
  name: string;
  onNameChange: (value: string) => void;
  jobId: string | null;
  onJobSelect: (value: string) => void;
  selectableJobs: Job[];
  selectedJob: Job | null;
  customJobTitle: string;
  onCustomJobTitleChange: (value: string) => void;
  customHourlyRate: string;
  onCustomHourlyRateChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  isLinked: boolean;
  promoteToSupervisor: boolean;
  onPromoteToSupervisorChange: (value: boolean) => void;
  promoteEmail: string;
  onPromoteEmailChange: (value: string) => void;
  isAdmin: boolean;
  onIsAdminChange: (value: boolean) => void;
  isSupervisorAccess: boolean;
  onIsSupervisorAccessChange: (value: boolean) => void;
  dob: string;
  onDobChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-950">
          Full name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-950">
          Job title
        </label>
        <select
          value={jobId ?? ""}
          onChange={(e) => onJobSelect(e.target.value)}
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
            onChange={(e) => onCustomJobTitleChange(e.target.value)}
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
            onChange={(e) => onCustomHourlyRateChange(e.target.value)}
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
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="(555) 555-5555"
          className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />

        {isLinked ? (
          <div className="mt-3 space-y-3 rounded-lg border border-gray-200 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-950">Supervisor access</p>
                <p className="text-xs text-gray-600">
                  Can override clock-ins and manage breaks on mobile.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isSupervisorAccess}
                onClick={() => onIsSupervisorAccessChange(!isSupervisorAccess)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  isSupervisorAccess ? "bg-accent" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isSupervisorAccess ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div>
                <p className="text-sm font-medium text-gray-950">Admin access</p>
                <p className="text-xs text-gray-600">
                  Full web dashboard access, not just clock overrides. Doesn&apos;t include billing.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isAdmin}
                onClick={() => onIsAdminChange(!isAdmin)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  isAdmin ? "bg-accent" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isAdmin ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <p className="border-t border-gray-100 pt-3 text-xs text-gray-600">
              Login email:{" "}
              <span className="text-gray-950">{promoteEmail || "No email on file"}</span>
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-gray-200 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-950">Supervisor access</p>
                <p className="text-xs text-gray-600">
                  Can override clock-ins and manage breaks on mobile.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={promoteToSupervisor}
                onClick={() => onPromoteToSupervisorChange(!promoteToSupervisor)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  promoteToSupervisor ? "bg-accent" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    promoteToSupervisor ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {promoteToSupervisor && (
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-medium text-gray-950">
                  Email to invite (optional)
                </label>
                <input
                  type="email"
                  value={promoteEmail}
                  onChange={(e) => onPromoteEmailChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  placeholder="supervisor@company.com"
                />
                <p className="mt-1.5 text-xs text-gray-600">
                  {promoteEmail.trim()
                    ? "Saving sends an invite. Their existing PIN, clock history, and site assignments carry over once they accept, and they'll be able to log into the app."
                    : "Leave blank to grant this immediately with no invite - they can override clock-ins and start/end breaks using just their PIN, but won't get app login access."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-950">
          Date of birth
        </label>
        <input
          type="date"
          value={dob}
          onChange={(e) => onDobChange(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>
    </div>
  );
}
