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
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type JobSite = {
  id: string;
  name: string;
  active: boolean;
};

type Invite = {
  id: string;
  email: string;
  assignedSiteIds: string[];
  status: "pending" | "accepted";
};

type Employee = {
  id: string;
  name: string;
  jobTitle?: string;
  assignedSiteIds: string[];
  photoUrl?: string;
  hourlyRate?: number;
  phone?: string;
  dob?: string;
  isSupervisor?: boolean;
  active: boolean;
};

export default function EmployeesPage() {
  const { currentUser, userData } = useAuth();
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

  // The employee currently open in the detail/edit modal, if any
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Supervisor invites
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSiteIds, setInviteSiteIds] = useState<string[]>([]);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

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

  // Live supervisor invites list
  useEffect(() => {
    if (!userData?.companyId) return;
    const invitesRef = collection(db, "invites");
    const q = query(invitesRef, where("companyId", "==", userData.companyId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setInvites(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Invite, "id">),
          }))
        );
        setLoadingInvites(false);
      },
      (err) => {
        console.error("Invites listener error:", err);
        setLoadingInvites(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  function toggleInviteSite(siteId: string) {
    setInviteSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId]
    );
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId || !currentUser) return;
    setInviteError("");
    setInviteSuccess("");
    setIsInviting(true);

    try {
      const normalizedEmail = inviteEmail.trim().toLowerCase();

      const existing = invites.find(
        (inv) =>
          inv.email.toLowerCase() === normalizedEmail &&
          inv.status === "pending"
      );
      if (existing) {
        setInviteError("There's already a pending invite for that email.");
        setIsInviting(false);
        return;
      }

      await addDoc(collection(db, "invites"), {
        email: normalizedEmail,
        companyId: userData.companyId,
        role: "supervisor",
        assignedSiteIds: inviteSiteIds,
        status: "pending",
        invitedByUid: currentUser.uid,
        createdAt: serverTimestamp(),
      });

      setInviteSuccess(`Invite sent to ${normalizedEmail}.`);
      setInviteEmail("");
      setInviteSiteIds([]);
    } catch (err) {
      console.error("Invite error:", err);
      setInviteError("Couldn't create the invite. Try again.");
    } finally {
      setIsInviting(false);
    }
  }

  async function copyInviteLink(email: string, inviteId: string) {
    const link = `${window.location.origin}/join?email=${encodeURIComponent(
      email
    )}`;
    await navigator.clipboard.writeText(link);
    setCopiedInviteId(inviteId);
    setTimeout(() => setCopiedInviteId(null), 2000);
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

  // Keep the modal showing fresh data if the live listener updates while it's open
  const employeeForModal = selectedEmployee
    ? employees.find((e) => e.id === selectedEmployee.id) ?? selectedEmployee
    : null;

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
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr
                  key={employee.id}
                  onClick={() => setSelectedEmployee(employee)}
                  className="cursor-pointer border-b border-gray-200 transition-colors last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-2.5 text-gray-950">
                    <span className="flex items-center gap-2">
                      {employee.photoUrl ? (
                        <img
                          src={employee.photoUrl}
                          alt={employee.name}
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      ) : null}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActive(employee);
                      }}
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

      {/* Supervisors */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-950">Supervisors</h2>
        <p className="mt-1 text-sm text-gray-600">
          Invite supervisors by email. Once they accept, they&apos;ll show up
          above in the employee list too — supervisors can clock in and out
          like anyone else, plus manage their assigned sites from the mobile
          app.
        </p>

        {/* Invite form */}
        <form
          onSubmit={handleInvite}
          className="mt-4 rounded-lg border border-gray-200 bg-white p-4"
        >
          <label
            htmlFor="inviteEmail"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Email
          </label>
          <input
            id="inviteEmail"
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="w-full max-w-sm rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="supervisor@company.com"
          />

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
                      inviteSiteIds.includes(site.id)
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={inviteSiteIds.includes(site.id)}
                      onChange={() => toggleInviteSite(site.id)}
                    />
                    {site.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {inviteError && (
            <p className="mt-3 text-sm text-red-600">{inviteError}</p>
          )}
          {inviteSuccess && (
            <p className="mt-3 text-sm text-green-700">{inviteSuccess}</p>
          )}

          <button
            type="submit"
            disabled={isInviting}
            className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isInviting ? "Sending…" : "Send invite"}
          </button>
        </form>

        {/* Invite list */}
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-950">
              Supervisor invites
            </h3>
          </div>
          {loadingInvites ? (
            <p className="p-4 text-sm text-gray-600">Loading…</p>
          ) : invites.length === 0 ? (
            <p className="p-4 text-sm text-gray-600">No invites sent yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Job sites</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr
                    key={invite.id}
                    className="border-b border-gray-200 last:border-0"
                  >
                    <td className="px-4 py-2.5 text-gray-950">
                      {invite.email}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {invite.assignedSiteIds.length === 0
                        ? "None specified"
                        : siteNames(invite.assignedSiteIds)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          invite.status === "accepted"
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {invite.status === "accepted" ? "Accepted" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {invite.status === "pending" && (
                        <button
                          onClick={() =>
                            copyInviteLink(invite.email, invite.id)
                          }
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          {copiedInviteId === invite.id
                            ? "Copied!"
                            : "Copy invite link"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {employeeForModal && (
        <EmployeeModal
          employee={employeeForModal}
          sites={sites}
          companyId={userData?.companyId ?? ""}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

function EmployeeModal({
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
      const employeeRef = doc(db, "companies", companyId, "employees", employee.id);

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

        {/* Photo */}
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