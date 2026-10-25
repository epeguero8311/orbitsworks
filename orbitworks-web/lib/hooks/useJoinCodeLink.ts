"use client";

import { useState } from "react";
import { isLocalLink, joinLink, LOCAL_QR_WARNING } from "@/lib/hooks/useJoinCodes";
import { downloadLabeledQr } from "@/lib/qrPng";
import type { JoinCodeListItem } from "@/lib/types";

// Copy link / download QR for one crew code. Same behavior the old table
// rows had, moved here so the active cards and the info modal share it.
export function useJoinCodeLink(code: JoinCodeListItem) {
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const link = joinLink(code.token);
  const local = isLocalLink(link);

  function flash(text: string, ms: number) {
    setNote(text);
    setTimeout(() => setNote(""), ms);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      flash("Copied", 2000);
    } catch {
      flash("Couldn't copy", 2000);
    }
  }

  async function download() {
    if (local) return flash(LOCAL_QR_WARNING, 3000);
    try {
      await downloadLabeledQr(link, code.name, code.siteName);
    } catch {
      flash("Couldn't download", 2000);
    }
  }

  return { link, local, note, copied, copy, download };
}
