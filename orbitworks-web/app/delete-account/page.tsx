"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { Orbit, Trash2, CheckCircle2 } from "lucide-react";
import { auth, functions } from "@/lib/firebase";
import { getAuthErrorMessage } from "@/lib/authErrorMessage";
import { deleteAccountErrorMessage, deleteAccountLoginKind } from "@/lib/deleteAccount";

// Cleanup 2026-11-26: the only place an OrbitsWorks app account is deleted
// (Apple 5.1.1(v) - the app's Settings > Delete account row opens this
// page). Sign in -> confirm -> the server deletes it
// (deleteMyEmployeeAccount). Clock events and timesheets are never deleted.
// Supervisor, admin and kiosk logins can't delete themselves here.

type Step = "signIn" | "confirm" | "notEmployee" | "kiosk" | "done";

const deleteFn = httpsCallable(functions, "deleteMyEmployeeAccount", { timeout: 60000 });

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent";

export default function DeleteAccountPage() {
  const [step, setStep] = useState<Step>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await credential.user.getIdTokenResult(true);
      const kind = deleteAccountLoginKind({ role: token.claims.role, appMode: token.claims.appMode });
      setSignedInEmail(credential.user.email ?? email.trim());
      setPassword("");
      if (kind === "employeeApp") {
        setStep("confirm");
      } else {
        await signOut(auth).catch(() => {});
        setStep(kind === "kiosk" ? "kiosk" : "notEmployee");
      }
    } catch (err) {
      setError(getAuthErrorMessage(err, "Incorrect email or password. Try again.").message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setError("");
    setBusy(true);
    try {
      await deleteFn({ confirm: true });
      await signOut(auth).catch(() => {});
      setStep("done");
    } catch (err) {
      setError(deleteAccountErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    await signOut(auth).catch(() => {});
    setError("");
    setStep("signIn");
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Orbit className="h-5 w-5 text-accent" />
          <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          {step === "signIn" && (
            <>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-950">Delete your app account</h1>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Sign in with the email and password you use in the OrbitsWorks Employee App.
              </p>
              <form onSubmit={handleSignIn} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-950">Email</label>
                  <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-950">Password</label>
                  <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
                  <Link href="/forgot-password" className="mt-1.5 inline-block text-sm font-medium text-accent hover:text-accent-hover">Forgot password?</Link>
                </div>
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60">
                  {busy ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </>
          )}

          {step === "confirm" && (
            <>
              <h1 className="text-xl font-semibold text-gray-950">Delete your account?</h1>
              <p className="mt-1 text-sm text-gray-500">Signed in as {signedInEmail}</p>
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-600">
                <li>Deleted: your login, your selfie and profile photo, and your PIN. This can&apos;t be undone.</li>
                <li>Kept: your clock-in and clock-out times stay with your employer as their records.</li>
                <li>You must be clocked out and not on a break.</li>
                <li>Open the app first and make sure nothing is still waiting to sync. Anything left on your phone is lost.</li>
              </ul>
              {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
                <button type="button" onClick={handleDelete} disabled={busy} className="flex-1 rounded-lg bg-red-600 px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60">
                  {busy ? "Deleting..." : "Delete my account"}
                </button>
                <button type="button" onClick={handleCancel} disabled={busy} className="flex-1 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-medium text-gray-950 hover:bg-gray-50 disabled:opacity-60">
                  Keep my account
                </button>
              </div>
            </>
          )}

          {step === "notEmployee" && (
            <>
              <h1 className="text-xl font-semibold text-gray-950">This account can&apos;t be deleted here</h1>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {signedInEmail} is a supervisor or admin login. Ask your company admin to remove it, or email{" "}
                <a href="mailto:info@orbitsworks.com" className="font-medium text-accent hover:underline">info@orbitsworks.com</a>.
              </p>
              <button type="button" onClick={handleCancel} className="mt-6 text-sm font-medium text-accent hover:underline">Sign in with another account</button>
            </>
          )}

          {step === "kiosk" && (
            <>
              <h1 className="text-xl font-semibold text-gray-950">Kiosk logins are managed by your admin</h1>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Your company admin turns kiosks off on the OrbitsWorks website.
              </p>
              <button type="button" onClick={handleCancel} className="mt-6 text-sm font-medium text-accent hover:underline">Sign in with another account</button>
            </>
          )}

          {step === "done" && (
            <>
              <CheckCircle2 className="mb-4 h-10 w-10 text-green-600" />
              <h1 className="text-xl font-semibold text-gray-950">Your account was deleted</h1>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                You were signed out. You can delete the OrbitsWorks app from your phone.
              </p>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          Questions? <a href="mailto:info@orbitsworks.com" className="font-medium text-accent hover:underline">info@orbitsworks.com</a>
        </p>
      </div>
    </div>
  );
}
