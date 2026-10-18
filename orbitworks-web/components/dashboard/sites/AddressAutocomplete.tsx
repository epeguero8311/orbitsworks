"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";

export interface PickedAddress {
  address: string;
  placeId: string;
  lat: number;
  lng: number;
}

interface Prediction {
  placeId: string;
  text: string;
}

const DEBOUNCE_MS = 300;
const MIN_INPUT_LENGTH = 3;

// Google Places autocomplete + pick flow, server-proxied (app/api/places/*)
// so the API key never reaches the browser. Requires a verified pick, not
// free text - onSelect only fires once Google's Place Details has resolved
// a real address to exact coordinates (see lib/hooks/useSites.ts, which
// blocks the save if the address was typed but never picked).
export function AddressAutocomplete({
  id,
  value,
  verified,
  onTextChange,
  onSelect,
  required,
  placeholder,
}: {
  id: string;
  value: string;
  verified: boolean;
  onTextChange: (text: string) => void;
  onSelect: (picked: PickedAddress) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState("");

  // One token per address search, per Google's session-token billing model -
  // bundles every keystroke prediction plus the final Place Details pick
  // into a single billed session instead of charging each call separately.
  // Cleared (null) once a pick redeems it, so the next search starts fresh.
  const sessionTokenRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  function ensureSessionToken() {
    if (!sessionTokenRef.current) sessionTokenRef.current = crypto.randomUUID();
    return sessionTokenRef.current;
  }

  async function fetchPredictions(text: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setError("");
    try {
      const res = await authedFetch("/api/places/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, sessionToken: ensureSessionToken() }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setError(data.error ?? "Couldn't look up that address.");
        setPredictions([]);
        setOpen(false);
        return;
      }
      setPredictions(data.predictions ?? []);
      setOpen((data.predictions ?? []).length > 0);
      setHighlightedIndex(0);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("Places autocomplete request failed:", err);
      setError("Couldn't look up that address.");
      setPredictions([]);
      setOpen(false);
    } finally {
      if (!controller.signal.aborted) setIsSearching(false);
    }
  }

  function handleChange(text: string) {
    onTextChange(text);
    setError("");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < MIN_INPUT_LENGTH) {
      abortRef.current?.abort();
      setPredictions([]);
      setOpen(false);
      setIsSearching(false);
      return;
    }

    debounceRef.current = setTimeout(() => fetchPredictions(text), DEBOUNCE_MS);
  }

  async function handleSelect(prediction: Prediction) {
    setOpen(false);
    setIsResolving(true);
    setError("");
    try {
      const res = await authedFetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: prediction.placeId, sessionToken: ensureSessionToken() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't verify that address. Try again.");
        return;
      }
      sessionTokenRef.current = null;
      setPredictions([]);
      onSelect({ address: data.address, placeId: data.placeId, lat: data.lat, lng: data.lng });
    } catch (err) {
      console.error("Places details request failed:", err);
      setError("Couldn't verify that address. Try again.");
    } finally {
      setIsResolving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % predictions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + predictions.length) % predictions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(predictions[highlightedIndex]);
    } else if (e.key === "Escape") {
      // Only swallow Escape while the dropdown is showing - otherwise let it
      // bubble so a parent modal's own Escape handler still closes it.
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        autoComplete="off"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />

      {(isSearching || isResolving) && (
        <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" />
      )}

      {open && predictions.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
        >
          {predictions.map((p, i) => (
            <li
              key={p.placeId}
              role="option"
              aria-selected={i === highlightedIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(p);
              }}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`cursor-pointer px-3 py-2 ${
                i === highlightedIndex ? "bg-accent/10 text-accent" : "text-gray-950"
              }`}
            >
              {p.text}
            </li>
          ))}
        </ul>
      )}

      {verified && value && !isResolving && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Verified address
        </p>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
