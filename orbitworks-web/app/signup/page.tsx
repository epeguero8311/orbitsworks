"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Orbit } from "lucide-react";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.02l7.73 6c4.51-4.18 7.09-10.36 7.09-17.49z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59a14.5 14.5 0 0 1-.76-4.59c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.92-2.14 15.89-5.83l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleNotice, setGoogleNotice] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      // 1. Create the Firebase Auth user
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const uid = credential.user.uid;

      // 2. Create a new company document
      const companyRef = doc(collection(db, "companies"));
      await setDoc(companyRef, {
        name: companyName,
        createdAt: serverTimestamp(),
        authMode: "individual", // vs. "shared" - decided later in Settings
      });

      // 3. Create the matching user doc (admin, tied to the new company)
      await setDoc(doc(db, "users", uid), {
        role: "admin",
        companyId: companyRef.id,
        name,
        email,
        createdAt: serverTimestamp(),
      });

      router.push("/dashboard");
    } catch (err: any) {
      console.error("Signup error:", err);
      if (err.code === "auth/email-already-in-use") {
        setError("An account with that email already exists.");
      } else if (err.code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else {
        setError("Something went wrong creating your account. Try again.");
      }
    } finally {
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
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="At least 6 characters"
              />
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
              {isSubmitting ? "Creating account..." : "Create account"}
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-600">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={() => setGoogleNotice(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-medium text-gray-950 transition-colors hover:border-gray-300"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            {googleNotice && (
              <p className="mt-2 text-center text-xs text-gray-600">
                Google sign-in isn't set up yet - coming soon.
              </p>
            )}

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
