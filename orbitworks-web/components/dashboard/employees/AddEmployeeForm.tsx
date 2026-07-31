"use client";

import { useState, FormEvent } from "react";
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { JobSite } from "@/lib/types";

export function AddEmployeeForm({ sites }: { sites: JobSite[] }) {
  const { userData } = useAuth();
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    setIsSubmitting(true);

    try {
      const employeesRef = collection(
        db,
        "companies",
        userData.companyId,
        "employees"
      );

      const employeeDoc = await addDoc(employeesRef, {
        name: name.trim(),
        jobTitle: jobTitle.trim(),
        assignedSiteIds: selectedSiteIds,
        hourlyRate: hourlyRate.trim() ? parseFloat(hourlyRate.trim()) : null,
        active: true,
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

      setName("");
      setJobTitle("");
      setHourlyRate("");
      setSelectedSiteIds([]);
      setPhotoFile(null);
    } catch (err) {
      console.error("Add employee error:", err);
      setError("Couldn't add the employee. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleAddEmployee}
      className="mt-6 rounded-lg border border-gray-200 bg-white p-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label
            htmlFor="empName"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Full name
          </label>
          <input
            id="empName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Alex Rivera"
          />
        </div>

        <div>
          <label
            htmlFor="empTitle"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Job title (optional)
          </label>
          <input
            id="empTitle"
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Site Technician"
          />
        </div>

        <div>
          <label
            htmlFor="empRate"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Hourly rate (optional)
          </label>
          <input
            id="empRate"
            type="number"
            step="0.01"
            min="0"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="e.g. 22.50"
          />
        </div>
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-sm font-medium text-gray-950">
          Assign to job sites
        </span>
        {sites.length === 0 ? (
          <p className="text-sm text-gray-600">
            No active job sites yet — add one on the Job Sites page first.
          </p>
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

      <div className="mt-4">
        <label
          htmlFor="empPhoto"
          className="mb-1.5 block text-sm font-medium text-gray-950"
        >
          Reference photo (optional for now)
        </label>
        <input
          id="empPhoto"
          type="file"
          accept="image/*"
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-950 hover:file:bg-gray-100"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isSubmitting ? "Adding…" : "Add employee"}
      </button>
    </form>
  );
}