"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type AuthMode = "individual" | "shared";
type PayPeriod = "weekly" | "biweekly" | "semimonthly" | "monthly";

const CURRENCIES = [
  { code: "USD", label: "USD ($)" },
  { code: "CAD", label: "CAD ($)" },
  { code: "MXN", label: "MXN ($)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "GBP", label: "GBP (£)" },
];

const PAY_PERIODS: { value: PayPeriod; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "semimonthly", label: "Semimonthly" },
  { value: "monthly", label: "Monthly" },
];

export default function SettingsPage() {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);

  const [companyName, setCompanyName] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("individual");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [payPeriod, setPayPeriod] = useState<PayPeriod>("biweekly");
  const [businessOpen, setBusinessOpen] = useState("08:00");
  const [businessClose, setBusinessClose] = useState("17:00");
  const [otThreshold, setOtThreshold] = useState("40");

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
          setLogoUrl(data.logoUrl ?? null);
          setCurrency(data.currency ?? "USD");
          setPayPeriod((data.payPeriod as PayPeriod) ?? "biweekly");
          setBusinessOpen(data.businessHours?.open ?? "08:00");
          setBusinessClose(data.businessHours?.close ?? "17:00");
          setOtThreshold(
            data.weeklyOvertimeThreshold != null
              ? String(data.weeklyOvertimeThreshold)
              : "40"
          );
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

  function handleLogoChange(file: File | null) {
    setLogoFile(file);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSave() {
    if (!userData?.companyId) return;
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const companyRef = doc(db, "companies", userData.companyId);

      let newLogoUrl = logoUrl;
      if (logoFile) {
        const logoRef = ref(
          storage,
          `companies/${userData.companyId}/logo.jpg`
        );
        await uploadBytes(logoRef, logoFile);
        newLogoUrl = await getDownloadURL(logoRef);
      }

      await updateDoc(companyRef, {
        name: companyName.trim(),
        authMode,
        logoUrl: newLogoUrl,
        currency,
        payPeriod,
        businessHours: {
          open: businessOpen,
          close: businessClose,
        },
        weeklyOvertimeThreshold: otThreshold.trim()
          ? parseFloat(otThreshold.trim())
          : 40,
      });

      setLogoUrl(newLogoUrl);
      setLogoFile(null);
      setLogoPreview(null);
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

          {/* Logo */}
          <div className="mt-4 flex items-center gap-4">
            {logoPreview || logoUrl ? (
              <img
                src={logoPreview ?? logoUrl ?? undefined}
                alt="Company logo"
                className="h-16 w-16 rounded-md border border-gray-200 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-600">
                No logo
              </div>
            )}
            <div>
              <label
                htmlFor="companyLogo"
                className="cursor-pointer rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-950 hover:border-gray-300"
              >
                {logoUrl ? "Change logo" : "Upload logo"}
              </label>
              <input
                id="companyLogo"
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </div>
          </div>

          {/* Company name */}
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

          {/* Currency + Pay period */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="currency"
                className="mb-1.5 block text-sm font-medium text-gray-950"
              >
                Currency
              </label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="payPeriod"
                className="mb-1.5 block text-sm font-medium text-gray-950"
              >
                Pay period
              </label>
              <select
                id="payPeriod"
                value={payPeriod}
                onChange={(e) => setPayPeriod(e.target.value as PayPeriod)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                {PAY_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Business hours */}
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-gray-950">
              Business hours
            </span>
            <p className="mb-2 text-xs text-gray-600">
              Applies company-wide for now — per-site hours can be added
              later if needed.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={businessOpen}
                onChange={(e) => setBusinessOpen(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <span className="text-sm text-gray-600">to</span>
              <input
                type="time"
                value={businessClose}
                onChange={(e) => setBusinessClose(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Overtime threshold */}
          <div className="mt-4">
            <label
              htmlFor="otThreshold"
              className="mb-1.5 block text-sm font-medium text-gray-950"
            >
              Weekly hours before overtime
            </label>
            <input
              id="otThreshold"
              type="number"
              min="0"
              step="0.5"
              value={otThreshold}
              onChange={(e) => setOtThreshold(e.target.value)}
              className="w-32 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Supervisor login type */}
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