"use client";

import { useState, FormEvent } from "react";
import { collection, addDoc, doc, updateDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { JobSite, Job, Subcontractor } from "@/lib/types";
import { generateUniquePin } from "@/lib/pinUtils";
import { UpgradeToast } from "@/components/UpgradeToast";

export function AddEmployeeForm({
  sites,
  jobs,
  subcontractors,
  companyName,
}: {
  sites: JobSite[];
  jobs: Job[];
  subcontractors: Subcontractor[];
  companyName: string;
}) {
  const { userData } = useAuth();
  const [name, setName] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [customJobTitle, setCustomJobTitle] = useState("");
  const [customHourlyRate, setCustomHourlyRate] = useState("");
  const [subcontractorId, setSubcontractorId] = useState<string | null>(null);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdPin, setCreatedPin] = useState<string | null>(null);
  const [showUpgradeToast, setShowUpgradeToast] = useState(false);

  const activeJobs = jobs.filter((j) => j.active);
  const activeSubcontractors = subcontractors.filter((s) => s.active);
  const selectedJob = jobs.find((j) => j.id === jobId) ?? null;

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

  async function handleAddEmployee(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId) return;
    setError("");
    setCreatedPin(null);
    setIsSubmitting(true);

    try {
      const employeesRef = collection(
        db,
        "companies",
        userData.companyId,
        "employees"
      );

      // Check existing PINs company-wide so the new one is guaranteed unique.
      const existingSnapshot = await getDocs(employeesRef);
      const existingPins = new Set(
        existingSnapshot.docs
          .map((d) => (d.data() as { pin?: string }).pin)
          .filter((p): p is string => !!p)
      );
      const pin = generateUniquePin(existingPins);

      const jobTitleToSave = selectedJob ? selectedJob.name : customJobTitle.trim();
      const hourlyRateToSave = selectedJob
        ? null
        : customHourlyRate.trim()
        ? parseFloat(customHourlyRate.trim())
        : null;

      const selectedSubcontractor = subcontractors.find((s) => s.id === subcontractorId) ?? null;

      const employeeDoc = await addDoc(employeesRef, {
        name: name.trim(),
        jobId: jobId,
        jobTitle: jobTitleToSave,
        assignedSiteIds: selectedSiteIds,
        hourlyRate: hourlyRateToSave,
        active: true,
        pin,
        subcontractorId: subcontractorId,
        subcontractorName: selectedSubcontractor ? selectedSubcontractor.name : null,
        createdAt: serverTimestamp(),
      });

      if (photoFile) {
        const photoRef = ref(
          storage,
          `companies/${userData.companyId}/employees/${employeeDoc.id}/reference.jpg`
        );
        await uploadBytes(photoRef, photoFile);
        const photoUrl = await getDownloadURL(photoRef);
        await updateDoc(employeeDoc, { photoUrl });
      }

      setCreatedPin(pin);
      setName("");
      setJobId(null);
      setCustomJobTitle("");
      setCustomHourlyRate("");
      setSubcontractorId(null);
      setSelectedSiteIds([]);
      setPhotoFile(null);
    } catch (err: any) {
      console.error("Add employee error:", err);
      // The Firestore rule blocks employee creation at the plan's cap with
      // a generic permission-denied - this is the only reason an admin's
      // own employee-create write would ever be rejected, so treat it as
      // the cap message rather than a raw error.
      if (err?.code === "permission-denied") {
        setShowUpgradeToast(true);
      } else {
        setError("Couldn't add the employee. Try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleAddEmployee}
      className="rounded-xl border border-gray-200 bg-white p-6"
    >
      <h2 className="text-base font-semibold text-gray-950">Add employee</h2>

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <div>
          <label
            htmlFor="empName"
            className="mb-2 block text-sm font-medium text-gray-950"
          >
            Full name
          </label>
          <input
            id="empName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Alex Rivera"
          />
        </div>

        <div>
          <label
            htmlFor="empTitle"
            className="mb-2 block text-sm font-medium text-gray-950"
          >
            Job title (optional)
          </label>
          <select
            id="empTitle"
            value={jobId ?? ""}
            onChange={(e) => handleJobSelect(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">Custom</option>
            {activeJobs.map((job) => (
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
          <label
            htmlFor="empRate"
            className="mb-2 block text-sm font-medium text-gray-950"
          >
            Hourly rate (optional)
          </label>
          {selectedJob ? (
            <input
              id="empRate"
              type="text"
              disabled
              value={`$${selectedJob.hourlyRate.toFixed(2)}/hr`}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600"
            />
          ) : (
            <input
              id="empRate"
              type="number"
              step="0.01"
              min="0"
              value={customHourlyRate}
              onChange={(e) => setCustomHourlyRate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="e.g. 22.50"
            />
          )}
          {selectedJob && (
            <p className="mt-1 text-xs text-gray-600">
              Rate is set by the job title. Choose Custom to edit manually.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <label
          htmlFor="empCompany"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Company (optional)
        </label>
        <select
          id="empCompany"
          value={subcontractorId ?? ""}
          onChange={(e) => setSubcontractorId(e.target.value || null)}
          className="w-full max-w-xs rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">{companyName}</option>
          {activeSubcontractors.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-600">
          Defaults to the main company. Change this later from the
          employee's edit screen if needed.
        </p>
      </div>

      <div className="mt-5">
        <span className="mb-2 block text-sm font-medium text-gray-950">
          Assign to job sites
        </span>
        {sites.length === 0 ? (
          <p className="text-sm text-gray-600">
            No active job sites yet - add one on the Jobs page first.
          </p>
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
        <label
          htmlFor="empPhoto"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Reference photo (optional for now)
        </label>
        <input
          id="empPhoto"
          type="file"
          accept="image/*"
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-50 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-gray-950 hover:file:bg-gray-100"
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {createdPin && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-800">
            Employee added. Backup clock-in PIN:{" "}
            <span className="font-mono text-base font-semibold">{createdPin}</span>
          </p>
          <p className="mt-1 text-xs text-green-700">
            You can look this up again anytime in the employees table below.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isSubmitting ? "Adding..." : "Add employee"}
      </button>

      <UpgradeToast
        visible={showUpgradeToast}
        onClose={() => setShowUpgradeToast(false)}
        message="You've reached your employee limit."
      />
    </form>
  );
}