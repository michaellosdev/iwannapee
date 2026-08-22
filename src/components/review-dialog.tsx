"use client";

import { useState } from "react";
import { Check, Sparkles, Star, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { CaptchaWidget } from "@/components/captcha-widget";
import type { Restroom } from "@/types/restroom";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReviewDialogProps = {
  restroom: Restroom | null;
  user: User | null;
  onClose: () => void;
  onNeedsAuth: () => void;
};

function RatingPicker({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="rating-fieldset">
      <legend>{label}</legend>
      <div className="rating-picker">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            aria-label={`${rating} out of 5`}
            className={rating <= value ? "rating-button active" : "rating-button"}
            key={rating}
            onClick={() => onChange(rating)}
            type="button"
          >
            <Star size={24} fill={rating <= value ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewDialog({ restroom, user, onClose, onNeedsAuth }: ReviewDialogProps) {
  const [overallRating, setOverallRating] = useState(5);
  const [cleanlinessRating, setCleanlinessRating] = useState(5);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [error, setError] = useState("");
  const [captchaReady, setCaptchaReady] = useState(false);

  if (!restroom) return null;
  const selectedRestroom = restroom;

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      onClose();
      onNeedsAuth();
      return;
    }

    const ratingRestroomId = selectedRestroom.promotion?.restroomId || selectedRestroom.id;
    if (selectedRestroom.source === "demo" || !uuidPattern.test(ratingRestroomId)) {
      setError("Connect Supabase and publish this restroom before accepting live ratings.");
      return;
    }

    setStatus("submitting");
    setError("");
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restroomId: ratingRestroomId,
        overallRating,
        cleanlinessRating,
        note,
      }),
    });
    const result = (await response.json()) as { error?: string; submitted?: boolean };
    if (!response.ok || !result.submitted) {
      setStatus("idle");
      setError(result.error || "We couldn’t save your rating.");
      return;
    }

    setStatus("success");
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog-card review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close review form"><X size={20} /></button>
        {status === "success" ? (
          <div className="success-state compact">
            <div className="success-icon"><Check size={28} /></div>
            <h2 id="review-title">Rating posted</h2>
            <p>Your update helps everyone know what to expect.</p>
            <button className="button button-primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="dialog-icon"><Sparkles size={24} /></div>
            <p className="eyebrow">Fresh information matters</p>
            <h2 id="review-title">How was {restroom.name}?</h2>
            <form className="stack-form review-form" onSubmit={submitReview}>
              <RatingPicker label="Overall experience" value={overallRating} onChange={setOverallRating} />
              <RatingPicker label="Cleanliness" value={cleanlinessRating} onChange={setCleanlinessRating} />
              <label>
                <span>Anything people should know? <small>optional</small></span>
                <textarea maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Soap was stocked and the accessible stall was open." rows={3} value={note} />
              </label>
              <CaptchaWidget onVerified={setCaptchaReady} />
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-primary button-full" disabled={status === "submitting" || !captchaReady}>
                {status === "submitting" ? "Posting…" : "Post rating"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
