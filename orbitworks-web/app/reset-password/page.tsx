"use client";

import { useEffect, useState, Suspense, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import Link from "next/link";
import { Orbit } from "lucide-react";

type PageState = "verifying" | "ready" | "invalid" | "submitting" | "done" | "error";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode") || "";

  const [state, setState] = useState<PageState>("verifying");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!oobCode) {
      setState("invalid");
      return;
    }

    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setState("ready");
      })
      .catch(() => {
        setState("invalid");
      });
  }, [oobCode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords don't match.");
      return;
    }

    setState("submitting");
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setState("done");
    } catch (err) {
      console.error("Reset password error:", err);
      setErrorMsg("That link may have expired. Request a new one and try again.");
      setState("ready");
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-gray-50 px-4 py-16 lg:bg-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Orbit className="h-5 w-5 text-accent" />
          <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
        </div>

        {state === "verifying" && (
          <p className="text-sm text-gray-600">Verifying your link...</p>
        )}

        {state === "invalid" && (
          <div>
            <h1 className="text-2xl font-semibold text-gray-950">Link expired</h1>
            <p className="mt-1.5 text-sm text-gray-600">
              This password reset link is invalid or has expired. Request a new one below.
            </p>
            <Link
              href="/forgot-password"
              className="mt-6 block w-full rounded-lg bg-accent px-3.5 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Request a new link
            </Link>
          </div>
        )}

        {state === "done" && (
          <div>
            <h1 className="text-2xl font-semibold text-gray-950">Password updated</h1>
            <p className="mt-1.5 text-sm text-gray-600">
              Your password has been reset. You can now sign in with your new password.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="mt-6 w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Go to login
            </button>
          </div>
        )}

        {(state === "ready" || state === "submitting") && (
          <>
            <h1 className="text-2xl font-semibold text-gray-950">Set a new password</h1>
            <p className="mt-1.5 text-sm text-gray-600">
              Resetting the password for {email}.
            </p>

            <form onSubmit={handleSubmit} className="mt-8">
              <div className="mb-4">
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-gray-950"
                >
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              <div className="mb-5">
                <label
                  htmlFor="confirmPassword"
                  className="mb-1.5 block text-sm font-medium text-gray-950"
                >
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>

              {errorMsg && (
                <p className="mb-4 text-sm text-red-600" role="alert">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={state === "submitting"}
                className="w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {state === "submitting" ? "Updating..." : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-600">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}