"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { HelpChatButton } from "./HelpChatButton";
import { HelpChatWindow } from "./HelpChatWindow";

const POSITION_KEY = "helpChatPosition";
const BUTTON_SIZE = 56;
const DRAG_THRESHOLD_PX = 5;
const MARGIN = 16;

interface Position {
  x: number;
  y: number;
}

interface Props {
  isSubscribed: boolean;
}

function clampToViewport(pos: Position): Position {
  if (typeof window === "undefined") return pos;
  const maxX = window.innerWidth - BUTTON_SIZE - MARGIN;
  const maxY = window.innerHeight - BUTTON_SIZE - MARGIN;
  return {
    x: Math.min(Math.max(pos.x, MARGIN), Math.max(maxX, MARGIN)),
    y: Math.min(Math.max(pos.y, MARGIN), Math.max(maxY, MARGIN)),
  };
}

function defaultPosition(): Position {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: window.innerWidth - BUTTON_SIZE - MARGIN,
    y: window.innerHeight - BUTTON_SIZE - MARGIN,
  };
}

export function HelpChat({ isSubscribed }: Props) {
  const { currentUser } = useAuth();
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [isOpen, setIsOpen] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; startPos: Position; dragging: boolean } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      try {
        setPosition(clampToViewport(JSON.parse(saved)));
      } catch {
        // ignore corrupt value, keep default
      }
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPos: position,
        dragging: false,
      };

      function handlePointerMove(moveEvent: PointerEvent) {
        if (!dragState.current) return;
        const dx = moveEvent.clientX - dragState.current.startX;
        const dy = moveEvent.clientY - dragState.current.startY;

        if (!dragState.current.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          dragState.current.dragging = true;
        }

        if (dragState.current.dragging) {
          const next = clampToViewport({
            x: dragState.current.startPos.x + dx,
            y: dragState.current.startPos.y + dy,
          });
          setPosition(next);
        }
      }

      function handlePointerUp() {
        if (dragState.current?.dragging) {
          setPosition((current) => {
            localStorage.setItem(POSITION_KEY, JSON.stringify(current));
            return current;
          });
        }
        dragState.current = null;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      }

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [position]
  );

  function handleButtonClick() {
    if (dragState.current?.dragging) return;
    setIsOpen((prev) => !prev);
  }

  if (!currentUser) return null;
  if (!isSubscribed) return null;

  return (
    <>
      {!isOpen && (
        <HelpChatButton
          onClick={handleButtonClick}
          onPointerDown={handlePointerDown}
          style={{ left: position.x, top: position.y }}
        />
      )}
      {isOpen && (
        <HelpChatWindow
          onClose={() => setIsOpen(false)}
          originX={Math.min(position.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 356)}
          originY={Math.max(position.y - 460 - 8, MARGIN)}
        />
      )}
    </>
  );
}