"use client";
import { useState, useEffect, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import Link from "next/link";
import { Orbit } from "lucide-react";

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");
  const mode = searchParams.get("mode");

  // ---- Request-a-link step (no oobCode in URL) ----
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // ---- Confirm-reset step (oobCode present in URL) ----
  const [codeCheck, setCodeCheck] = useState<"checking" | "valid" | "invalid" | "resetting" | "resetDone" | "resetError">("checking");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetErrorMsg, setResetErrorMsg] = useState("");

  const isResetFlow = mode === "resetPassword" && !!oobCode;

  useEffect(() => {
    if (!isResetFlow || !oobCode) return;

    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        setResetEmail(verifiedEmail);
        setCodeCheck("valid");
      })
      .catch((err) => {
        console.error("Verify reset code error:", err);
        setCodeCheck("invalid");
      });
  }, [isResetFlow, oobCode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus("sent");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        setStatus("sent");
      } else {
        console.error("Password reset error:", err);
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again in a moment.");
      }
    }
  }

  async function handleConfirmReset(e: FormEvent) {
    e.preventDefault();
    setResetErrorMsg("");

    if (newPassword.length < 6) {
      setResetErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetErrorMsg("Passwords don't match.");
      return;
    }
    if (!oobCode) return;

    setCodeCheck("resetting");
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setCodeCheck("resetDone");
    } catch (err: unknown) {
      console.error("Confirm password reset error:", err);
      const code = (err as { code?: string })?.code;
      setCodeCheck("resetError");
      if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
        setResetErrorMsg("This reset link has expired or was already used. Request a new one below.");
      } else if (code === "auth/weak-password") {
        setResetErrorMsg("Please choose a stronger password.");
      } else {
        setResetErrorMsg("Something went wrong. Please try again.");
      }
    }
  }

  // ---- Reset-confirm flow UI ----
  if (isResetFlow) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-gray-50 px-4 py-16 lg:bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <Orbit className="h-5 w-5 text-accent" />
            <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
          </div>

          {codeCheck === "checking" && (
            <p className="text-sm text-gray-600">Checking your reset link...</p>
          )}

          {codeCheck === "invalid" && (
            <div className="mt-2">
              <h1 className="text-2xl font-semibold text-gray-950">Link expired</h1>
              <p className="mt-1.5 text-sm text-gray-600">
                This password reset link is invalid or has expired. Request a new one below.
              </p>
              <Link
                href="/forgot-password"
                className="mt-5 block rounded-lg bg-accent px-3.5 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Request a new link
              </Link>
            </div>
          )}

          {(codeCheck === "valid" || codeCheck === "resetting" || codeCheck === "resetError") && (
            <div>
              <h1 className="text-2xl font-semibold text-gray-950">Choose a new password</h1>
              <p className="mt-1.5 text-sm text-gray-600">
                Resetting the password for {resetEmail}.
              </p>
              <form onSubmit={handleConfirmReset} className="mt-8">
                <div className="mb-5">
                  <label
                    htmlFor="newPassword"
                    className="mb-1.5 block text-sm font-medium text-gray-950"
                  >
                    New password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="At least 6 characters"
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
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </div>
                {resetErrorMsg && (
                  <p className="mb-4 text-sm text-red-600" role="alert">
                    {resetErrorMsg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={codeCheck === "resetting"}
                  className="w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                >
                  {codeCheck === "resetting" ? "Resetting..." : "Reset password"}
                </button>
              </form>
            </div>
          )}

          {codeCheck === "resetDone" && (
            <div>
              <h1 className="text-2xl font-semibold text-gray-950">Password updated</h1>
              <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Your password has been reset. You can now log in with your new password.
              </div>
              <Link
                href="/login"
                className="mt-5 block rounded-lg bg-accent px-3.5 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Go to login
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Request-a-link flow UI (unchanged) ----
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-gray-50 px-4 py-16 lg:bg-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Orbit className="h-5 w-5 text-accent" />
          <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
        </div>
        <h1 className="text-2xl font-semibold text-gray-950">Reset your password</h1>
        <p className="mt-1.5 text-sm text-gray-600">
          Enter the email on your account and we&apos;ll send you a link to reset your password.
        </p>
        {status === "sent" ? (
          <div className="mt-8">
            <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              If an account exists for {email}, a reset link is on its way. Check your inbox and spam folder.
            </div>
            <Link
              href="/login"
              className="block text-center text-sm font-medium text-accent hover:text-accent-hover"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8">
            <div className="mb-5">
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
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="you@company.com"
              />
            </div>
            {status === "error" && (
              <p className="mb-4 text-sm text-red-600" role="alert">
                {errorMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {status === "sending" ? "Sending..." : "Send reset link"}
            </button>
            <p className="mt-5 text-center text-sm text-gray-600">
              <Link href="/login" className="font-medium text-accent">
                Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordInner />
    </Suspense>
  );
}