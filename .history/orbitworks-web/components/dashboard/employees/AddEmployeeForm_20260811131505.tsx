"use client";

import { useState, FormEvent } from "react";
import { collection, addDoc, doc, updateDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { JobSite } from "@/lib/types";
import { generateUniquePin } from "@/lib/pinUtils";

export function AddEmployeeForm({ sites }: { sites: JobSite[] }) {
  const { userData } = useAuth();
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdPin, setCreatedPin] = useState<string | null>(null);

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

      const employeeDoc = await addDoc(employeesRef, {
        name: name.trim(),
        jobTitle: jobTitle.trim(),
        assignedSiteIds: selectedSiteIds,
        hourlyRate: hourlyRate.trim() ? parseFloat(hourlyRate.trim()) : null,
        active: true,
        pin,
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
          <input
            id="empTitle"
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Site Technician"
          />
        </div>

        <div>
          <label
            htmlFor="empRate"
            className="mb-2 block text-sm font-medium text-gray-950"
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
            className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="e.g. 22.50"
          />
        </div>
      </div>

      <div className="mt-5">
        <span className="mb-2 block text-sm font-medium text-gray-950">
          Assign to job sites
        </span>
        {sites.length === 0 ? (
          <p className="text-sm text-gray-600">
            No active job sites yet - add one on the Job Sites page first.
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
    </form>
  );
}
