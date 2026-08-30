"use client";

import { useState, FormEvent, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import { getAuthErrorMessage, AuthErrorField } from "@/lib/authErrorMessage";
import { Orbit, Smartphone, Eye, EyeOff } from "lucide-react";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<AuthErrorField>("none");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailFromLink = searchParams.get("email");
  useEffect(() => {
    if (emailFromLink) setEmail(emailFromLink);
  }, [emailFromLink]);

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
    setIsSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();
    let user: User | null = null;

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      user = credential.user;
    } catch (err) {
      console.error("Join auth error:", err);
      const result = getAuthErrorMessage(err, "Something went wrong. Try again.");
      const message =
        (err as { code?: string })?.code === "auth/email-already-in-use"
          ? "An account with that email already exists. Try signing in instead."
          : result.message;
      setError(message);
      setErrorField(result.field);
      setIsSubmitting(false);
      return;
    }

    try {
      const acceptInvite = httpsCallable(functions, "acceptInvite");
      await acceptInvite({ name });

      await user.getIdToken(true);

      router.push("/mobile-only");
    } catch (err) {
      console.error("Join setup error:", err);
      const code = (err as { code?: string })?.code;
      if (code === "functions/not-found") {
        setError(
          "No pending invite found for that email. Ask your admin to invite you first."
        );
        setErrorField("email");
      } else {
        try {
          await deleteUser(user);
        } catch (cleanupErr) {
          console.error("Rollback failed:", cleanupErr);
        }
        // Never surface the raw Cloud Function error text here - it's not
        // meant for end users.
        setError("Something went wrong. Try again.");
        setErrorField("none");
      }
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gray-950 px-12 py-10 text-white lg:flex">
        <style>{`
          @keyframes phoneFloat {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }
          @keyframes ringPulse {
            0% { transform: scale(0.95); opacity: 0.6; }
            70% { transform: scale(1.3); opacity: 0; }
            100% { transform: scale(1.3); opacity: 0; }
          }
        `}</style>

        <div className="flex items-center gap-2">
          <Orbit className="h-6 w-6 text-accent" />
          <span className="text-lg font-semibold">Orbitsworks</span>
        </div>

        <div className="relative mx-auto flex h-72 w-72 items-center justify-center">
          <div
            className="absolute h-40 w-40 rounded-full border border-accent/40"
            style={{ animation: "ringPulse 2.8s ease-out infinite" }}
          />
          <div
            className="absolute h-40 w-40 rounded-full border border-accent/40"
            style={{ animation: "ringPulse 2.8s ease-out infinite 1.4s" }}
          />
          <div
            className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-accent shadow-lg"
            style={{ animation: "phoneFloat 4s ease-in-out infinite" }}
          >
            <Smartphone className="h-11 w-11 text-white" />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold leading-snug">
            You&apos;re joining
            <br />
            as a supervisor.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Once your account is set up, download the Orbitsworks mobile app
            to clock your crew in and out on site.
          </p>
        </div>
      </div>

      <div className="flex w-full flex-1 items-center justify-center bg-gray-50 px-4 py-16 lg:w-1/2 lg:bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Orbit className="h-5 w-5 text-accent" />
            <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <Smartphone className="h-3.5 w-3.5" />
            Supervisor invite
          </span>

          <h1 className="mt-4 text-2xl font-semibold text-gray-950">
            Accept your invite
          </h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Set a password to finish creating your supervisor account.
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
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
                Email (must match your invite)
              </label>
              <input
                id="email"
                type="email"
                required
                readOnly={!!emailFromLink}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError();
                }}
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-1 ${
                  emailHasError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                    : "border-gray-200 focus:border-accent focus:ring-accent"
                } ${emailFromLink ? "bg-gray-50 text-gray-600" : "text-gray-950"}`}
                placeholder="you@company.com"
              />
            </div>

            <div className="mb-5">
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-gray-950"
              >
                Choose a password
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

            {error && (
              <p className="mb-4 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {isSubmitting ? "Creating account..." : "Accept invite"}
            </button>

            <p className="mt-5 text-center text-sm text-gray-600">
              Already accepted?{" "}
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

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  );
}