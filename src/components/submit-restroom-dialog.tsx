"use client";

import { useState } from "react";
import { Camera, Check, Crosshair, MapPin, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { CaptchaWidget } from "@/components/captcha-widget";
import { createClient } from "@/lib/supabase/client";
import type { Coordinates, LocationSearchResult, RestroomFeature } from "@/types/restroom";

type SubmitRestroomDialogProps = {
  open: boolean;
  user: User | null;
  currentLocation: Coordinates;
  onClose: () => void;
  onNeedsAuth: () => void;
};

const featureOptions: RestroomFeature[] = [
  "Accessible",
  "Baby changing",
  "Gender neutral",
  "Free",
  "Single stall",
];

export function SubmitRestroomDialog({
  open,
  user,
  currentLocation,
  onClose,
  onNeedsAuth,
}: SubmitRestroomDialogProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("");
  const [directions, setDirections] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [accessInstructions, setAccessInstructions] = useState("");
  const [features, setFeatures] = useState<RestroomFeature[]>(["Free"]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState("Using your current map location");
  const [status, setStatus] = useState<"idle" | "locating" | "submitting" | "success">("idle");
  const [error, setError] = useState("");
  const [captchaReady, setCaptchaReady] = useState(false);

  if (!open) return null;

  function toggleFeature(feature: RestroomFeature) {
    setFeatures((current) =>
      current.includes(feature)
        ? current.filter((item) => item !== feature)
        : [...current, feature],
    );
  }

  async function pinAddress() {
    if (!address.trim()) {
      setError("Enter an address before placing the pin.");
      return;
    }

    setError("");
    setStatus("locating");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
      const results = (await response.json()) as LocationSearchResult[] | { error: string };
      if (!response.ok || !Array.isArray(results) || !results[0]) {
        throw new Error("We couldn’t locate that address. Try adding the city or ZIP code.");
      }
      setCoordinates({ latitude: results[0].latitude, longitude: results[0].longitude });
      setLocationLabel(`Pin placed at ${results[0].label}`);
    } catch (pinError) {
      setError(pinError instanceof Error ? pinError.message : "Couldn’t place the pin.");
    } finally {
      setStatus("idle");
    }
  }

  async function submitRestroom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!user) {
      onClose();
      onNeedsAuth();
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not connected yet. Add the environment variables in .env.local to publish.");
      return;
    }

    setStatus("submitting");
    let coverPhotoStoragePath: string | null = null;

    if (photo) {
      const signedResponse = await fetch("/api/storage/restroom-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: photo.type, size: photo.size }),
      });
      const signed = (await signedResponse.json()) as { path?: string; token?: string; error?: string };
      if (!signedResponse.ok || !signed.path || !signed.token) {
        setStatus("idle");
        setError(signed.error || "Photo upload could not start.");
        return;
      }
      const { error: uploadError } = await supabase.storage
        .from("restroom-photos")
        .uploadToSignedUrl(signed.path, signed.token, photo, { contentType: photo.type });

      if (uploadError) {
        setStatus("idle");
        setError(`Photo upload failed: ${uploadError.message}`);
        return;
      }

      coverPhotoStoragePath = signed.path;
    }

    const submissionFeatures = accessCode
      ? Array.from(new Set([...features, "Code available"]))
      : features;

    const submissionResponse = await fetch("/api/restrooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        address,
        latitude: (coordinates || currentLocation).latitude,
        longitude: (coordinates || currentLocation).longitude,
        hours,
        directions,
        accessCode,
        accessInstructions,
        coverPhotoStoragePath,
        features: submissionFeatures,
      }),
    });
    const submission = (await submissionResponse.json()) as { error?: string; submitted?: boolean };
    if (!submissionResponse.ok || !submission.submitted) {
      setStatus("idle");
      setError(submission.error || "We couldn’t save this restroom.");
      return;
    }

    setStatus("success");
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="submit-title"
        aria-modal="true"
        className="dialog-card dialog-card-wide"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close submission form">
          <X size={20} />
        </button>

        {status === "success" ? (
          <div className="success-state">
            <div className="success-icon"><Check size={30} /></div>
            <p className="eyebrow">Submission received</p>
            <h2 id="submit-title">Thanks for helping someone find relief.</h2>
            <p>We’ll review the location before it appears publicly. You can keep adding updates once it’s live.</p>
            <button className="button button-primary" onClick={onClose}>Back to the map</button>
          </div>
        ) : (
          <>
            <p className="eyebrow">Community powered</p>
            <h2 id="submit-title">Add a restroom</h2>
            <p className="dialog-copy">Share only publicly accessible facilities and information you’ve recently verified.</p>

            <form className="submission-form" onSubmit={submitRestroom}>
              <div className="form-grid">
                <label>
                  <span>Name</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Library — ground floor" required />
                </label>
                <label>
                  <span>Hours</span>
                  <input value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Mon–Fri, 8 AM–8 PM" required />
                </label>
                <label className="form-span-2">
                  <span>Street address</span>
                  <div className="address-pin-row">
                    <AddressAutocomplete
                      biasCoordinates={currentLocation}
                      onChange={(value) => {
                        setAddress(value);
                        setCoordinates(null);
                        setLocationLabel("Choose a suggestion or place the pin manually");
                      }}
                      onSelect={(result) => {
                        setCoordinates({ latitude: result.latitude, longitude: result.longitude });
                        setLocationLabel(`Pin placed at ${result.label}`);
                      }}
                      placeholder="Start typing a street address"
                      required
                      value={address}
                    />
                    <button className="button button-small button-secondary" onClick={pinAddress} type="button" disabled={status === "locating"}>
                      <Crosshair size={16} /> {status === "locating" ? "Finding…" : "Place pin"}
                    </button>
                  </div>
                  <small className="field-hint"><MapPin size={13} /> {locationLabel}</small>
                </label>
                <label>
                  <span>Access code <small>optional</small></span>
                  <input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="e.g. 1248#" />
                </label>
                <label>
                  <span>Access note <small>optional</small></span>
                  <input value={accessInstructions} onChange={(event) => setAccessInstructions(event.target.value)} placeholder="Ask the front desk" />
                </label>
                <label className="form-span-2">
                  <span>Directions inside</span>
                  <textarea value={directions} onChange={(event) => setDirections(event.target.value)} placeholder="Enter through the north lobby; it’s past the elevators." rows={3} required />
                </label>
              </div>

              <fieldset>
                <legend>What’s available?</legend>
                <div className="feature-picker">
                  {featureOptions.map((feature) => (
                    <label className={features.includes(feature) ? "feature-choice selected" : "feature-choice"} key={feature}>
                      <input checked={features.includes(feature)} onChange={() => toggleFeature(feature)} type="checkbox" />
                      <span>{feature}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="photo-upload">
                <Camera size={22} />
                <span><strong>{photo ? photo.name : "Add a helpful photo"}</strong><small>JPG, PNG, or WebP · avoid capturing faces</small></span>
                <input accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] || null)} type="file" />
              </label>

              <CaptchaWidget onVerified={setCaptchaReady} />
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="dialog-actions">
                <button className="button button-ghost" onClick={onClose} type="button">Cancel</button>
                <button className="button button-primary" disabled={status === "submitting" || !captchaReady}>
                  {status === "submitting" ? "Submitting…" : "Submit for review"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
