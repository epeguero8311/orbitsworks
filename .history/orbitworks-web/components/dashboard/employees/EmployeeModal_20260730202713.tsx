"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type { Employee, JobSite } from "@/lib/types";

export function EmployeeModal({
  employee,
  sites,
  companyId,
  onClose,
}: {
  employee: Employee;
  sites: JobSite[];
  companyId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [jobTitle, setJobTitle] = useState(employee.jobTitle ?? "");
  const [hourlyRate, setHourlyRate] = useState(
    employee.hourlyRate != null ? String(employee.hourlyRate) : ""
  );
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [dob, setDob] = useState(employee.dob ?? "");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>(
    employee.assignedSiteIds ?? []
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  async function handleSave() {
    if (!companyId) return;
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const employeeRef = doc(
        db,
        "companies",
        companyId,
        "employees",
        employee.id
      );

      const updates: Record<string, unknown> = {
        name: name.trim(),
        jobTitle: jobTitle.trim(),
        hourlyRate: hourlyRate.trim() ? parseFloat(hourlyRate.trim()) : null,
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
      setSuccess("Saved.");
    } catch (err) {
      console.error("Update employee error:", err);
      setError("Couldn't save changes. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-gray-950">
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

        <div className="mb-4 flex items-center gap-4">
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
              className="cursor-pointer rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-950 hover:border-gray-300"
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-950">
              Full name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-950">
              Job title
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-950">
              Hourly rate
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-950">
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-950">
              Date of birth
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-gray-950">
            Assigned job sites
          </span>
          {sites.length === 0 ? (
            <p className="text-sm text-gray-600">No active job sites yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sites.map((site) => (
                <label
                  key={site.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors ${
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

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-3 text-sm text-green-700">{success}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-950 hover:border-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}