"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { CaptchaWidget } from "@/components/captcha-widget";
import type { Coordinates, LocationSearchResult } from "@/types/restroom";

type AddressAutocompleteProps = {
  biasCoordinates?: Coordinates;
  maxLength?: number;
  onChange: (value: string) => void;
  onSelect: (result: LocationSearchResult) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
};

export function AddressAutocomplete({
  biasCoordinates,
  maxLength = 240,
  onChange,
  onSelect,
  placeholder = "Start typing an address",
  required = false,
  value,
}: AddressAutocompleteProps) {
  const listboxId = useId();
  const suppressNextSearch = useRef(false);
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (suppressNextSearch.current) {
      suppressNextSearch.current = false;
      return;
    }
    if (value.trim().length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ autocomplete: "1", q: value.trim() });
      if (biasCoordinates) {
        params.set("lat", String(biasCoordinates.latitude));
        params.set("lng", String(biasCoordinates.longitude));
      }

      try {
        const response = await fetch(`/api/geocode?${params}`, { signal: controller.signal });
        const data = (await response.json()) as LocationSearchResult[] | { error?: string; code?: string };
        if (!response.ok && !Array.isArray(data) && data.code === "captcha_required") {
          setCaptchaRequired(true);
        }
        const nextResults = response.ok && Array.isArray(data) ? data : [];
        setResults(nextResults);
        setOpen(nextResults.length > 0);
        setActiveIndex(-1);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [biasCoordinates, retryNonce, value]);

  function chooseResult(result: LocationSearchResult) {
    suppressNextSearch.current = true;
    onChange(result.label);
    onSelect(result);
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (event.key === "ArrowDown" && results.length > 0) setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseResult(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="address-autocomplete">
      <div className="address-autocomplete-input">
        <MapPin aria-hidden="true" size={16} />
        <input
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          autoComplete="off"
          maxLength={maxLength}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (nextValue.trim().length < 3) {
              setResults([]);
              setOpen(false);
              setLoading(false);
              setActiveIndex(-1);
            }
            onChange(nextValue);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          role="combobox"
          value={value}
        />
        {loading && <LoaderCircle aria-label="Searching addresses" className="address-autocomplete-loader" size={16} />}
      </div>
      {captchaRequired && (
        <div className="geocode-captcha">
          <CaptchaWidget onVerified={(verified) => {
            if (!verified) return;
            setCaptchaRequired(false);
            setRetryNonce((current) => current + 1);
          }} />
        </div>
      )}
      {open && (
        <div className="address-autocomplete-results" id={listboxId} role="listbox">
          {results.map((result, index) => (
            <button
              aria-selected={activeIndex === index}
              className={activeIndex === index ? "active" : ""}
              id={`${listboxId}-${index}`}
              key={`${result.latitude}-${result.longitude}-${result.label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseResult(result)}
              role="option"
              type="button"
            >
              <MapPin aria-hidden="true" size={15} />
              <span>{result.label}</span>
            </button>
          ))}
          <small>Addresses © OpenStreetMap contributors</small>
        </div>
      )}
    </div>
  );
}
