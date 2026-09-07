"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import { getAuthErrorMessage, AuthErrorField } from "@/lib/authErrorMessage";
import { TERMS_VERSION } from "@/components/legal/TermsContent";
import { Orbit, Eye, EyeOff } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<AuthErrorField>("none");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailHasError = errorField === "email" || errorField === "credentials";
  const passwordHasError = errorField === "password" || errorField === "credentials";

  function clearError() {
    if (error) {
      setError("");
      setErrorField("none");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setErrorField("none");

    if (!agreedToTerms) {
      setError("You must agree to the Terms and Conditions to continue.");
      setErrorField("none");
      return;
    }

    setIsSubmitting(true);

    let user: User | null = null;

    try {
      // 1. Create the Firebase Auth user
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      user = credential.user;
    } catch (err) {
      console.error("Signup auth error:", err);
      const result = getAuthErrorMessage(
        err,
        "Something went wrong creating your account. Try again."
      );
      setError(result.message);
      setErrorField(result.field);
      setIsSubmitting(false);
      return;
    }

    try {
      // 2. Create the company + admin user doc server-side, with a fresh
      // companyId the client never gets to choose or influence. Terms
      // agreement is re-validated server-side in createCompany - the
      // client-side checkbox/disabled-button is UX only, not the real gate.
      const createCompany = httpsCallable(functions, "createCompany");
      await createCompany({
        companyName,
        name,
        agreedToTerms,
        termsVersion: TERMS_VERSION,
      });

      // 3. Refresh the ID token so the new custom claims (role, companyId)
      // are active before we land on the dashboard.
      await user.getIdToken(true);

      router.push("/dashboard");
    } catch (err) {
      console.error("Signup setup error:", err);
      // Roll back the auth account so the person can cleanly retry.
      try {
        await deleteUser(user);
      } catch (cleanupErr) {
        console.error("Rollback failed:", cleanupErr);
      }
      // Never surface the raw Cloud Function error text here - it's not
      // meant for end users.
      setError("Something went wrong setting up your company. Try again.");
      setErrorField("none");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-accent px-12 py-10 text-white lg:flex">
        <style>{`
          @keyframes orbitSpinSlow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes orbitSpinSlowReverse {
            from { transform: rotate(360deg); }
            to { transform: rotate(0deg); }
          }
        `}</style>

        <div className="flex items-center gap-2">
          <Orbit className="h-6 w-6" />
          <span className="text-lg font-semibold">Orbitsworks</span>
        </div>

        <div className="relative mx-auto flex h-72 w-72 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border border-white/25"
            style={{ animation: "orbitSpinSlow 70s linear infinite" }}
          >
            <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-white" />
          </div>
          <div
            className="absolute inset-8 rounded-full border border-white/25"
            style={{ animation: "orbitSpinSlowReverse 50s linear infinite" }}
          >
            <span className="absolute top-1/2 -right-1.5 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white" />
          </div>
          <div
            className="absolute inset-16 rounded-full border border-white/25"
            style={{ animation: "orbitSpinSlow 40s linear infinite" }}
          >
            <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white" />
          </div>
          <div className="h-4 w-4 rounded-full bg-white" />
        </div>

        <div>
          <h2 className="text-2xl font-semibold leading-snug">
            Set up your crew,
            <br />
            in minutes.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/80">
            Add job sites, invite supervisors, and start tracking hours the
            same day.
          </p>
        </div>
      </div>

      <div className="flex w-full flex-1 items-center justify-center bg-gray-50 px-4 py-16 lg:w-1/2 lg:bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Orbit className="h-5 w-5 text-accent" />
            <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
          </div>

          <h1 className="text-2xl font-semibold text-gray-950">Create your account</h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Set up your company to start tracking job sites and crews.
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
            <div className="mb-4">
              <label
                htmlFor="companyName"
                className="mb-1.5 block text-sm font-medium text-gray-950"
              >
                Company name
              </label>
              <input
                id="companyName"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Acme Construction"
              />
            </div>

            <div className="mb-4">
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-medium text-gray-950"
              >
                Your name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Jane Smith"
              />
            </div>

            <div className="mb-4">
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-gray-950"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError();
                }}
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:ring-1 ${
                  emailHasError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                    : "border-gray-200 focus:border-accent focus:ring-accent"
                }`}
                placeholder="you@company.com"
              />
            </div>

            <div className="mb-5">
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-gray-950"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  className={`w-full rounded-lg border px-3.5 py-2.5 pr-10 text-sm text-gray-950 outline-none focus:ring-1 ${
                    passwordHasError
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-200 focus:border-accent focus:ring-accent"
                  }`}
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="mb-5">
              <label className="flex items-start gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked);
                    clearError();
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                />
                <span>
                  I agree to the{" "}
                  <Link
                    href="/terms"
                    target="_blank"
                    className="font-medium text-accent underline"
                  >
                    Terms and Conditions
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="font-medium text-accent underline"
                  >
                    Privacy Policy
                  </Link>
                </span>
              </label>
            </div>

            {error && (
              <p className="mb-4 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !agreedToTerms}
              className="w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {isSubmitting ? "Creating account..." : "Create account"}
            </button>

            <p className="mt-5 text-center text-sm text-gray-600">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-accent">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}