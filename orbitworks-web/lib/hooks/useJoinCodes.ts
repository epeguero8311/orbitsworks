"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import type { JoinCodeListResponse } from "@/lib/types";
import type { JoinCodeCreateInput, JoinCodeUpdateInput } from "@/lib/validators/joinCode";

// Pro-only. Every read and write goes through app/api/join-codes/* - the
// joinCodes collection is denied to all clients in firestore.rules. Pass
// enabled=false on Core/free so no request is made at all.

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const res = await authedFetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "Something went wrong. Try again.");
  return body as T;
}

export function useJoinCodes(enabled: boolean) {
  const [data, setData] = useState<JoinCodeListResponse | null>(null);
  const [error, setError] = useState("");
  const loading = enabled && data === null && error === "";

  const load = useCallback(() => call<JoinCodeListResponse>("/api/join-codes", { method: "GET" }), []);

  const refresh = useCallback(async () => {
    try {
      setData(await load());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load crew codes.");
    }
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError("");
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Couldn't load crew codes."));
    return () => {
      alive = false;
    };
  }, [enabled, load]);

  async function mutate<T>(path: string, body: unknown): Promise<T> {
    const result = await call<T>(path, { method: "POST", body: JSON.stringify(body) });
    await refresh();
    return result;
  }

  return {
    data,
    loading,
    error,
    refresh,
    createCode: (input: JoinCodeCreateInput) => mutate<{ token: string }>("/api/join-codes", input),
    updateCode: (input: JoinCodeUpdateInput) => mutate<{ token: string }>("/api/join-codes/update", input),
    regenerateCode: (token: string) => mutate<{ token: string }>("/api/join-codes/regenerate", { token }),
    revokeCode: (token: string) => mutate<{ ok: true }>("/api/join-codes/revoke", { token }),
  };
}

// The QR holds only this link - nothing else.
export function joinLink(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}/j/${token}`;
}

// A localhost link only opens on this computer, so a QR of it is useless
// on a phone. The dev site never builds one of these.
export const LOCAL_QR_WARNING = "QR codes only work from the dev site";
export function isLocalLink(link: string): boolean {
  try {
    const host = new URL(link).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}
