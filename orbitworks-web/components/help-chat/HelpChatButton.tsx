"use client";

import { MessageCircle } from "lucide-react";
import { forwardRef } from "react";

interface Props {
  onClick: () => void;
  style: React.CSSProperties;
  onPointerDown: (e: React.PointerEvent) => void;
}

export const HelpChatButton = forwardRef<HTMLButtonElement, Props>(function HelpChatButton(
  { onClick, style, onPointerDown },
  ref
) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={style}
      className="fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#3b6fe0] text-white shadow-lg"
    >
      <MessageCircle size={24} />
    </button>
  );
});