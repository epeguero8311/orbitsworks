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
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { JobSite, Job } from "@/lib/types";

export default function JobsPage() {
  const { userData } = useAuth();

  // ---- Job Sites ----
  const [sites, setSites] = useState<JobSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [isSubmittingSite, setIsSubmittingSite] = useState(false);
  const [siteError, setSiteError] = useState("");

  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editSiteName, setEditSiteName] = useState("");
  const [editSiteAddress, setEditSiteAddress] = useState("");
  const [editSiteError, setEditSiteError] = useState("");

  useEffect(() => {
    if (!userData?.companyId) return;

    const sitesRef = collection(db, "companies", userData.companyId, "jobSites");
    const q = query(sitesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSites(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<JobSite, "id">),
          }))
        );
        setSitesLoading(false);
      },
      (err) => {
        console.error("Job sites listener error:", err);
        setSitesLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  async function handleAddSite(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId) return;
    setSiteError("");
    setIsSubmittingSite(true);

    try {
      const sitesRef = collection(db, "companies", userData.companyId, "jobSites");
      await addDoc(sitesRef, {
        name: siteName.trim(),
        address: siteAddress.trim(),
        active: true,
        createdAt: serverTimestamp(),
      });
      setSiteName("");
      setSiteAddress("");
    } catch (err) {
      console.error("Add site error:", err);
      setSiteError("Couldn't add the job site. Try again.");
    } finally {
      setIsSubmittingSite(false);
    }
  }

  async function toggleSiteActive(site: JobSite) {
    if (!userData?.companyId) return;
    const siteRef = doc(db, "companies", userData.companyId, "jobSites", site.id);
    await updateDoc(siteRef, { active: !site.active });
  }

  function startEditSite(site: JobSite) {
    setEditingSiteId(site.id);
    setEditSiteName(site.name);
    setEditSiteAddress(site.address ?? "");
    setEditSiteError("");
  }

  function cancelEditSite() {
    setEditingSiteId(null);
    setEditSiteError("");
  }

  async function saveEditSite(site: JobSite) {
    if (!editSiteName.trim()) {
      setEditSiteError("Site name can't be empty.");
      return;
    }
    if (!userData?.companyId) return;

    try {
      const siteRef = doc(db, "companies", userData.companyId, "jobSites", site.id);
      await updateDoc(siteRef, {
        name: editSiteName.trim(),
        address: editSiteAddress.trim(),
      });
      setEditingSiteId(null);
      setEditSiteError("");
    } catch (err) {
      console.error("Edit site error:", err);
      setEditSiteError("Couldn't save changes. Try again.");
    }
  }

  // ---- Jobs ----
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobName, setJobName] = useState("");
  const [jobRate, setJobRate] = useState("");
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [jobError, setJobError] = useState("");

  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [confirmingRateChange, setConfirmingRateChange] = useState(false);

  useEffect(() => {
    if (!userData?.companyId) return;

    const jobsRef = collection(db, "companies", userData.companyId, "jobs");
    const q = query(jobsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setJobs(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Job, "id">),
          }))
        );
        setJobsLoading(false);
      },
      (err) => {
        console.error("Jobs listener error:", err);
        setJobsLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  async function handleAddJob(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId) return;
    setJobError("");
    setIsSubmittingJob(true);

    try {
      const rate = parseFloat(jobRate.trim());
      if (!jobName.trim() || isNaN(rate)) {
        setJobError("Enter a job name and a valid hourly rate.");
        setIsSubmittingJob(false);
        return;
      }
      const jobsRef = collection(db, "companies", userData.companyId, "jobs");
      await addDoc(jobsRef, {
        name: jobName.trim(),
        hourlyRate: rate,
        active: true,
        createdAt: serverTimestamp(),
      });
      setJobName("");
      setJobRate("");
    } catch (err) {
      console.error("Add job error:", err);
      setJobError("Couldn't add the job. Try again.");
    } finally {
      setIsSubmittingJob(false);
    }
  }

  function startEditJob(job: Job) {
    setEditingJobId(job.id);
    setEditName(job.name);
    setEditRate(String(job.hourlyRate));
    setConfirmingRateChange(false);
  }

  function cancelEditJob() {
    setEditingJobId(null);
    setConfirmingRateChange(false);
  }

  async function saveEditJob(job: Job) {
    const newRate = parseFloat(editRate.trim());
    if (!editName.trim() || isNaN(newRate)) return;

    const rateChanged = newRate !== job.hourlyRate;
    if (rateChanged && !confirmingRateChange) {
      setConfirmingRateChange(true);
      return;
    }

    if (!userData?.companyId) return;
    const jobRef = doc(db, "companies", userData.companyId, "jobs", job.id);
    await updateDoc(jobRef, {
      name: editName.trim(),
      hourlyRate: newRate,
    });
    setEditingJobId(null);
    setConfirmingRateChange(false);
  }

  async function toggleJobActive(job: Job) {
    if (!userData?.companyId) return;
    const jobRef = doc(db, "companies", userData.companyId, "jobs", job.id);
    await updateDoc(jobRef, { active: !job.active });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Jobs</h1>
      <p className="mt-1 text-sm text-gray-600">
        Manage job sites and the job titles and pay rates employees can be assigned to.
      </p>

      {/* ---- Job Sites section ---- */}
      <section className="mt-8">
        <h2 className="text-base font-semibold text-gray-950">Job Sites</h2>
        <p className="mt-1 text-sm text-gray-600">
          The locations employees can be assigned to.
        </p>

        <form
          onSubmit={handleAddSite}
          className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label htmlFor="siteName" className="mb-1.5 block text-sm font-medium text-gray-950">
              Site name
            </label>
            <input
              id="siteName"
              type="text"
              required
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="Downtown Warehouse"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="siteAddress" className="mb-1.5 block text-sm font-medium text-gray-950">
              Address (optional)
            </label>
            <input
              id="siteAddress"
              type="text"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="123 Main St"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmittingSite}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isSubmittingSite ? "Adding..." : "Add site"}
          </button>
        </form>
        {siteError && <p className="mt-2 text-sm text-red-600">{siteError}</p>}

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {sitesLoading ? (
            <p className="p-4 text-sm text-gray-600">Loading...</p>
          ) : sites.length === 0 ? (
            <p className="p-4 text-sm text-gray-600">
              No job sites yet. Add one above to get started.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Address</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => {
                  const isEditing = editingSiteId === site.id;
                  return (
                    <tr key={site.id} className="border-b border-gray-200 last:border-0">
                      {isEditing ? (
                        <>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={editSiteName}
                              onChange={(e) => setEditSiteName(e.target.value)}
                              className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={editSiteAddress}
                              onChange={(e) => setEditSiteAddress(e.target.value)}
                              placeholder="Address (optional)"
                              className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            />
                          </td>
                          <td className="px-4 py-2.5" colSpan={2}>
                            <div className="flex flex-wrap items-center gap-2">
                              {editSiteError && (
                                <span className="text-xs text-red-600">{editSiteError}</span>
                              )}
                              <button
                                onClick={() => saveEditSite(site)}
                                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditSite}
                                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-gray-950">{site.name}</td>
                          <td className="px-4 py-2.5 text-gray-600">{site.address || "-"}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                site.active
                                  ? "bg-green-50 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {site.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => startEditSite(site)}
                                className="text-sm font-medium text-accent hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => toggleSiteActive(site)}
                                className="text-sm font-medium text-accent hover:underline"
                              >
                                {site.active ? "Deactivate" : "Reactivate"}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ---- Jobs section ---- */}
      <section className="mt-10">
        <h2 className="text-base font-semibold text-gray-950">Job Titles & Pay</h2>
        <p className="mt-1 text-sm text-gray-600">
          Create job titles with an hourly rate. Assign employees to a job
          title instead of typing a rate by hand - editing a job's rate here
          updates pay for everyone currently assigned to it.
        </p>

        <form
          onSubmit={handleAddJob}
          className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label htmlFor="jobName" className="mb-1.5 block text-sm font-medium text-gray-950">
              Job name
            </label>
            <input
              id="jobName"
              type="text"
              required
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="Painter"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="jobRate" className="mb-1.5 block text-sm font-medium text-gray-950">
              Hourly rate
            </label>
            <input
              id="jobRate"
              type="number"
              step="0.01"
              min="0"
              required
              value={jobRate}
              onChange={(e) => setJobRate(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="25.00"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmittingJob}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isSubmittingJob ? "Adding..." : "Add job"}
          </button>
        </form>
        {jobError && <p className="mt-2 text-sm text-red-600">{jobError}</p>}

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {jobsLoading ? (
            <p className="p-4 text-sm text-gray-600">Loading...</p>
          ) : jobs.length === 0 ? (
            <p className="p-4 text-sm text-gray-600">
              No jobs yet. Add one above to get started.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Hourly rate</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const isEditing = editingJobId === job.id;
                  return (
                    <tr key={job.id} className="border-b border-gray-200 last:border-0">
                      {isEditing ? (
                        <>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editRate}
                              onChange={(e) => setEditRate(e.target.value)}
                              className="w-24 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            />
                          </td>
                          <td className="px-4 py-2.5" colSpan={2}>
                            {confirmingRateChange ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-amber-700">
                                  This updates pay for every employee currently
                                  assigned to this job. Continue?
                                </span>
                                <button
                                  onClick={() => saveEditJob(job)}
                                  className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={cancelEditJob}
                                  className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => saveEditJob(job)}
                                  className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEditJob}
                                  className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-gray-950">{job.name}</td>
                          <td className="px-4 py-2.5 text-gray-600">
                            ${job.hourlyRate.toFixed(2)}/hr
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                job.active
                                  ? "bg-green-50 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {job.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => startEditJob(job)}
                                className="text-sm font-medium text-accent hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => toggleJobActive(job)}
                                className="text-sm font-medium text-accent hover:underline"
                              >
                                {job.active ? "Deactivate" : "Reactivate"}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}