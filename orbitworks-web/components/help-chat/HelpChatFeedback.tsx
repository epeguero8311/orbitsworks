"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

interface Props {
  question: string;
  matchedDoc: string | null;
}

export function HelpChatFeedback({ question, matchedDoc }: Props) {
  const { currentUser } = useAuth();
  const [given, setGiven] = useState<"up" | "down" | null>(null);

  async function sendFeedback(thumbsUp: boolean) {
    if (given || !currentUser || !matchedDoc) return;
    setGiven(thumbsUp ? "up" : "down");

    try {
      const token = await currentUser.getIdToken();
      await fetch("/api/help-chat/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question, matchedDoc, thumbsUp }),
      });
    } catch {
      // best-effort, do not surface a failure to the user for a feedback click
    }
  }

  if (!matchedDoc) return null;

  return (
    <div className="mt-1 flex items-center gap-2 pl-1">
      <button
        onClick={() => sendFeedback(true)}
        disabled={given !== null}
        className={`rounded p-1 ${given === "up" ? "text-green-600" : "text-gray-300 hover:text-gray-500"}`}
        aria-label="Helpful"
      >
        <ThumbsUp size={13} />
      </button>
      <button
        onClick={() => sendFeedback(false)}
        disabled={given !== null}
        className={`rounded p-1 ${given === "down" ? "text-red-500" : "text-gray-300 hover:text-gray-500"}`}
        aria-label="Not helpful"
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  );
}