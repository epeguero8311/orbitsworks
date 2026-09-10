import { MessageCircle } from "lucide-react";
import { HelpChatFeedback } from "./HelpChatFeedback";

export interface HelpChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  question?: string;
  matchedDoc?: string | null;
}

export function HelpChatMessage({ message }: { message: HelpChatMessageData }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-900 whitespace-pre-wrap"
            : "max-w-[80%] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 whitespace-pre-wrap"
        }
      >
        {message.content}
      </div>
      {!isUser && message.question && (
        <HelpChatFeedback question={message.question} matchedDoc={message.matchedDoc ?? null} />
      )}
    </div>
  );
}

export function HelpChatLoadingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}