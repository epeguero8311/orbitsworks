"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type JobSite = {
  id: string;
  name: string;
  active: boolean;
};

type Employee = {
  id: string;
  name: string;
  jobTitle?: string;
  assignedSiteIds: string[];
  photoUrl?: string;
  hourlyRate?: number;
  isSupervisor?: boolean;
  active: boolean;
};

export default function EmployeesPage() {
  const { userData } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<JobSite[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Live employees list
  useEffect(() => {
    if (!userData?.companyId) return;

    const employeesRef = collection(
      db,
      "companies",
      userData.companyId,
      "employees"
    );
    const q = query(employeesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEmployees(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Employee, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Employees listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  // Live job sites list (for the assignment checkboxes)
  useEffect(() => {
    if (!userData?.companyId) return;

    const sitesRef = collection(
      db,
      "companies",
      userData.companyId,
      "jobSites"
    );

    const unsubscribe = onSnapshot(sitesRef, (snapshot) => {
      setSites(
        snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<JobSite, "id">) }))
          .filter((s) => s.active)
      );
    });

    return unsubscribe;
  }, [userData?.companyId]);

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

      // Create the employee doc first so we have an ID to name the photo after
      const employeeDoc = await addDoc(employeesRef, {
        name: name.trim(),
        jobTitle: jobTitle.trim(),
        assignedSiteIds: selectedSiteIds,
        hourlyRate: hourlyRate.trim() ? parseFloat(hourlyRate.trim()) : null,
        active: true,
        createdAt: serverTimestamp(),
      });

      // Upload the reference photo, if one was selected
      if (photoFile) {
        const photoRef = ref(
          storage,
          `companies/${userData.companyId}/employees/${employeeDoc.id}/reference.jpg`
        );
        await uploadBytes(photoRef, photoFile);
        const photoUrl = await getDownloadURL(photoRef);
        await updateDoc(employeeDoc, { photoUrl });
      }

      // Reset form
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

  async function toggleActive(employee: Employee) {
    if (!userData?.companyId) return;
    const employeeRef = doc(
      db,
      "companies",
      userData.companyId,
      "employees",
      employee.id
    );
    await updateDoc(employeeRef, { active: !employee.active });
  }

  function siteNames(ids: string[]) {
    if (ids.length === 0) return "—";
    return ids
      .map((id) => sites.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Employees</h1>
      <p className="mt-1 text-sm text-gray-600">
        Add employees, assign job sites, and upload a reference photo for
        face matching.
      </p>

      {/* Add employee form */}
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

      {/* Employees list */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-gray-600">Loading…</p>
        ) : employees.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No employees yet. Add one above to get started.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Job title</th>
                <th className="px-4 py-2 font-medium">Rate</th>
                <th className="px-4 py-2 font-medium">Job sites</th>
                <th className="px-4 py-2 font-medium">Photo</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-b border-gray-200 last:border-0"
                >
                  <td className="px-4 py-2.5 text-gray-950">
                    <span className="flex items-center gap-2">
                      {employee.name}
                      {employee.isSupervisor && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Supervisor
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {employee.jobTitle || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {employee.hourlyRate ? `$${employee.hourlyRate.toFixed(2)}/hr` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {siteNames(employee.assignedSiteIds)}
                  </td>
                  <td className="px-4 py-2.5">
                    {employee.photoUrl ? (
                      <img
                        src={employee.photoUrl}
                        alt={employee.name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        employee.active
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {employee.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => toggleActive(employee)}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      {employee.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}