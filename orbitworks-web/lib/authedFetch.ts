"use client";

import { auth } from "@/lib/firebase";

// Wraps fetch to a same-origin API route with the caller's Firebase ID
// token. Custom claims (role/companyId) only land on a freshly minted
// token - if the cached client-side token predates a recent claims
// change (e.g. an admin just got promoted to owner), the route's role
// check fails even though the user is genuinely authorized. On a 403
// this forces one token refresh and retries before giving up, and only
// then sends the user to /403 - so a stale-token blip never looks like
// a real permissions error.
export async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!auth.currentUser) {
    throw new Error("Not signed in.");
  }
  const user = auth.currentUser;

  async function attempt(forceRefresh: boolean) {
    const idToken = await user.getIdToken(forceRefresh);
    return fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${idToken}`,
      },
    });
  }

  let res = await attempt(false);
  if (res.status === 403) {
    res = await attempt(true);
  }
  if (res.status === 403 && typeof window !== "undefined") {
    window.location.href = "/403";
  }
  return res;
}
