"use client";

import { useState, FormEvent, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  deleteUser,
} from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill (and lock) the email if it came from an invite link
  const emailFromLink = searchParams.get("email");
  useEffect(() => {
    if (emailFromLink) setEmail(emailFromLink);
  }, [emailFromLink]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      // 1. Create the Firebase Auth account
      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      const uid = credential.user.uid;

      // 2. Look for a matching pending invite
      const invitesRef = collection(db, "invites");
      const q = query(
        invitesRef,
        where("email", "==", normalizedEmail),
        where("status", "==", "pending")
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        // No invite found — roll back the account we just created
        await deleteUser(credential.user);
        setError(
          "No pending invite found for that email. Ask your admin to invite you first."
        );
        setIsSubmitting(false);
        return;
      }

      const inviteDoc = snapshot.docs[0];
      const invite = inviteDoc.data();

      // 3. Create the supervisor's user doc
      await setDoc(doc(db, "users", uid), {
        role: "supervisor",
        companyId: invite.companyId,
        assignedSiteIds: invite.assignedSiteIds ?? [],
        name,
        email: normalizedEmail,
        createdAt: serverTimestamp(),
      });

      // 4. Mark the invite as accepted
      await updateDoc(doc(db, "invites", inviteDoc.id), {
        status: "accepted",
        acceptedByUid: uid,
        acceptedAt: serverTimestamp(),
      });

      router.push("/dashboard");
    } catch (err: any) {
      console.error("Join error:", err);
      if (err.code === "auth/email-already-in-use") {
        setError(
          "An account with that email already exists. Try signing in instead."
        );
      } else if (err.code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-gray-950">OrbitWorks</h1>
          <p className="mt-1 text-sm text-gray-600">
            Accept your supervisor invite
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
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
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent ${
                emailFromLink ? "bg-gray-50 text-gray-600" : "text-gray-950"
              }`}
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
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isSubmitting ? "Creating account…" : "Accept invite & sign in"}
          </button>

          <p className="mt-4 text-center text-sm text-gray-600">
            Already accepted?{" "}
            <Link href="/login" className="font-medium text-accent">
              Sign in
            </Link>
          </p>
        </form>
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