"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type AuthMode = "individual" | "shared";

export default function SettingsPage() {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("individual");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!userData?.companyId) return;

    async function loadCompany() {
      try {
        const companyRef = doc(db, "companies", userData!.companyId);
        const snapshot = await getDoc(companyRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          setCompanyName(data.name ?? "");
          setAuthMode((data.authMode as AuthMode) ?? "individual");
        }
      } catch (err) {
        console.error("Load company error:", err);
        setError("Couldn't load company settings.");
      } finally {
        setLoading(false);
      }
    }

    loadCompany();
  }, [userData?.companyId]);

  async function handleSave() {
    if (!userData?.companyId) return;
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const companyRef = doc(db, "companies", userData.companyId);
      await updateDoc(companyRef, {
        name: companyName.trim(),
        authMode,
      });
      setSuccess("Saved.");
    } catch (err) {
      console.error("Save company error:", err);
      setError("Couldn't save changes. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Settings</h1>
      <p className="mt-1 text-sm text-gray-600">
        Manage your company&apos;s account settings.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-gray-600">Loading…</p>
      ) : (
        <div className="mt-6 max-w-lg rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-950">
            Company profile
          </h2>

          <div className="mt-4">
            <label
              htmlFor="companyName"
              className="mb-1.5 block text-sm font-medium text-gray-950"
            >
              Company name
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-950">
              Supervisor login type
            </label>
            <p className="mb-2 text-xs text-gray-600">
              Individual logins let each supervisor use their own email and
              password. Shared login gives every supervisor at this company
              the same credentials on a single device.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode("individual")}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  authMode === "individual"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                Individual logins
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("shared")}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  authMode === "shared"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                Shared login
              </button>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-3 text-sm text-green-700">{success}</p>}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}