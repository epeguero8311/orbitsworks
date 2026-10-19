"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchSettings } from "@/lib/settingsSearchIndex";
import { SETTINGS_TAB_LABELS, type SettingsTabId } from "@/lib/hooks/useSettingsTabs";

const INPUT_TAG_NAMES = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function SettingsSearchBar({
  onSelect,
}: {
  onSelect: (tab: SettingsTabId, anchorId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = searchSettings(query);

  // Global "/" focuses the search input, unless the user is already typing
  // somewhere else (another input/textarea/select, including this one).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const active = document.activeElement as HTMLElement | null;
      if (active && INPUT_TAG_NAMES.has(active.tagName)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Closes the dropdown on an outside click - the input alone losing focus
  // (e.g. tabbing into the dropdown itself, if it were focusable) isn't
  // used as the close signal, since that would close it on blur-to-click.
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function pickResult(index: number) {
    const result = results[index];
    if (!result) return;
    onSelect(result.tab, result.id);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length === 0) return;
      setSelectedIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      setSelectedIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickResult(selectedIndex);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search settings..."
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      {isOpen && query.trim() && (
        <div className="absolute right-0 z-10 mt-1.5 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-gray-600">No settings match</p>
          ) : (
            <ul>
              {results.map((result, i) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setSelectedIndex(i)}
                    onClick={() => pickResult(i)}
                    className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm ${
                      i === selectedIndex ? "bg-gray-50" : ""
                    }`}
                  >
                    <span className="text-gray-950">{result.label}</span>
                    <span className="ml-2 flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {SETTINGS_TAB_LABELS[result.tab]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
