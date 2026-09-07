"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getAuthErrorMessage, AuthErrorField } from "@/lib/authErrorMessage";
import Link from "next/link";
import { Orbit, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    setIsSubmitting(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const tokenResult = await credential.user.getIdTokenResult(true);
      const role = tokenResult.claims.role as string | undefined;

      if (role === "supervisor") {
        await signOut(auth);
        router.push("/mobile-only");
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      console.error("Login error:", err);
      const result = getAuthErrorMessage(err, "Incorrect email or password. Try again.");
      setError(result.message);
      setErrorField(result.field === "none" ? "none" : result.field);
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
            Every job site,
            <br />
            one dashboard.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/80">
            Track clock-ins, manage crews, and keep payroll accurate - all in
            one place.
          </p>
        </div>
      </div>

      <div className="flex w-full flex-1 items-center justify-center bg-gray-50 px-4 py-16 lg:w-1/2 lg:bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Orbit className="h-5 w-5 text-accent" />
            <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
          </div>

          <h1 className="text-2xl font-semibold text-gray-950">Welcome back</h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Sign in to manage your job sites and crews.
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
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
              <Link
                href="/forgot-password"
                className="mt-1.5 inline-block text-sm font-medium text-accent hover:text-accent-hover"
              >
                Forgot password?
              </Link>
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
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>

            <p className="mt-5 text-center text-sm text-gray-600">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-medium text-accent">
                Create one
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}