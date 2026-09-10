"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { HelpChatMessage, HelpChatLoadingBubble, HelpChatMessageData } from "./HelpChatMessage";
import { HelpChatInput } from "./HelpChatInput";

interface Props {
  onClose: () => void;
  originX: number;
  originY: number;
}

const MAX_HISTORY = 4;

export function HelpChatWindow({ onClose, originX, originY }: Props) {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<HelpChatMessageData[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(text: string) {
    if (!currentUser) return;

    const userMsg: HelpChatMessageData = { id: crypto.randomUUID(), role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const token = await currentUser.getIdToken();
      const historyForApi = nextMessages
        .slice(-MAX_HISTORY - 1, -1)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/help-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: text, conversationHistory: historyForApi }),
      });

      const data = await res.json();
      const answerText = res.ok
        ? data.answer
        : "Sorry, I'm having trouble right now. Please contact epeguero8311@gmail.com and we'll help you out.";
      const matchedDoc = res.ok ? data.matchedDoc : null;

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: answerText, question: text, matchedDoc },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, I'm having trouble right now. Please contact epeguero8311@gmail.com and we'll help you out.",
          question: text,
          matchedDoc: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed z-50 flex h-[460px] w-[340px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl animate-[helpchat-open_200ms_ease-out]"
      style={{ left: originX, top: originY, transformOrigin: "bottom right" }}
    >
      <div className="flex items-center justify-between bg-[#3b6fe0] px-4 py-3">
        <span className="text-sm font-semibold text-white">Help</span>
        <button onClick={onClose} className="text-white/80 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">Ask me how to do something in OrbitsWorks.</p>
        )}
        {messages.map((m) => (
          <HelpChatMessage key={m.id} message={m} />
        ))}
        {loading && <HelpChatLoadingBubble />}
      </div>

      <HelpChatInput onSend={handleSend} disabled={loading} />
    </div>
  );
}
