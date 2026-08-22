"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { BadgeCheck, Camera, Check, CircleHelp, Droplets, ExternalLink, Images, Star, X } from "lucide-react";
import { CaptchaWidget } from "@/components/captcha-widget";
import { PhotoUploadError, uploadPhotos, validatePhotoFiles } from "@/lib/photo-upload";
import type { Restroom } from "@/types/restroom";

type CommunityPhoto = {
  id: string;
  url: string;
  caption: string | null;
  displayName?: string;
  createdAt?: string;
};

type CommunityReview = {
  id: string;
  overallRating: number;
  cleanlinessRating: number;
  note: string | null;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  photos: CommunityPhoto[];
};

type CommunityDetails = {
  verification: {
    dataSource: string;
    sourceUrl: string | null;
    verifiedAt: string | null;
    confirmationCount: number;
    notFoundCount: number;
  };
  photos: CommunityPhoto[];
  reviews: CommunityReview[];
};

function relativeTime(value: string) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return "just now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function sourceLabel(source: string) {
  if (source === "openstreetmap") return "OpenStreetMap";
  if (source === "refuge") return "REFUGE Restrooms";
  return "the IWANNAPEE community";
}

export function RestroomCommunity({
  restroom,
  user,
  onNeedsAuth,
  onNotify,
}: {
  restroom: Restroom;
  user: User | null;
  onNeedsAuth: () => void;
  onNotify: (message: string) => void;
}) {
  const restroomId = restroom.promotion?.restroomId || restroom.id;
  const canLoad = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(restroomId);
  const [details, setDetails] = useState<CommunityDetails | null>(null);
  const [loading, setLoading] = useState(canLoad);
  const [expandedReviews, setExpandedReviews] = useState(false);
  const [verificationChoice, setVerificationChoice] = useState<"confirmed" | "not_found" | null>(null);
  const [verificationCaptchaReady, setVerificationCaptchaReady] = useState(false);
  const [verificationWorking, setVerificationWorking] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoCaptchaReady, setPhotoCaptchaReady] = useState(false);
  const [photoWorking, setPhotoWorking] = useState(false);
  const [formError, setFormError] = useState("");

  const loadDetails = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/community/restroom?restroomId=${encodeURIComponent(restroomId)}`, { cache: "no-store" });
      const result = (await response.json()) as CommunityDetails | { error?: string };
      if (!response.ok || !("verification" in result)) throw new Error("Community details unavailable");
      setDetails(result);
    } catch {
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [canLoad, restroomId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadDetails(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadDetails]);

  const verification = details?.verification || {
    dataSource: restroom.source,
    sourceUrl: restroom.sourceUrl || null,
    verifiedAt: restroom.communityVerifiedAt,
    confirmationCount: restroom.communityVerificationCount,
    notFoundCount: restroom.communityNotFoundCount,
  };
  const verified = Boolean(verification.verifiedAt && verification.confirmationCount > verification.notFoundCount);
  const needsReview = !verified && verification.notFoundCount > verification.confirmationCount;
  const source = sourceLabel(verification.dataSource);

  function chooseVerification(verdict: "confirmed" | "not_found") {
    if (!user) {
      onNeedsAuth();
      return;
    }
    setFormError("");
    setVerificationCaptchaReady(false);
    setVerificationChoice(verdict);
  }

  async function submitVerification() {
    if (!verificationChoice) return;
    setVerificationWorking(true);
    setFormError("");
    const response = await fetch("/api/community/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restroomId, verdict: verificationChoice }),
    });
    const result = (await response.json()) as { error?: string; saved?: boolean };
    setVerificationWorking(false);
    if (!response.ok || !result.saved) {
      setFormError(result.error || "We couldn’t save this verification.");
      return;
    }
    setVerificationChoice(null);
    onNotify(verificationChoice === "confirmed" ? "Thanks—this restroom is community verified" : "Thanks—we sent this location for review");
    await loadDetails();
  }

  function openPhotoForm() {
    if (!user) {
      onNeedsAuth();
      return;
    }
    setFormError("");
    setPhotoCaptchaReady(false);
    setPhotoOpen(true);
  }

  async function submitPhotos() {
    setPhotoWorking(true);
    setFormError("");
    try {
      const photoStoragePaths = await uploadPhotos(photoFiles, 3);
      const response = await fetch("/api/community/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restroomId, photoStoragePaths, caption: photoCaption }),
      });
      const result = (await response.json()) as { error?: string; submitted?: boolean; photoCount?: number };
      if (!response.ok || !result.submitted) throw new PhotoUploadError(result.error || "We couldn’t submit these photos.");
      setPhotoFiles([]);
      setPhotoCaption("");
      setPhotoOpen(false);
      onNotify(`${result.photoCount || 0} photo${result.photoCount === 1 ? "" : "s"} sent for review`);
    } catch (error) {
      setFormError(error instanceof PhotoUploadError ? error.message : "We couldn’t submit these photos.");
    } finally {
      setPhotoWorking(false);
    }
  }

  const visibleReviews = expandedReviews ? details?.reviews || [] : (details?.reviews || []).slice(0, 1);

  return (
    <section className="restroom-community-section" aria-label="Community verification and reviews">
      <div className={`community-verification-card${verified ? " verified" : needsReview ? " needs-review" : ""}`}>
        <span className="community-verification-icon">{verified ? <BadgeCheck size={23} /> : <CircleHelp size={23} />}</span>
        <div className="community-verification-copy">
          <strong>{verified ? "Community Verified" : needsReview ? "Needs community review" : "Unverified"}</strong>
          <span>{verified && verification.verifiedAt
            ? `Verified by an IWANNAPEE user ${relativeTime(verification.verifiedAt)}`
            : needsReview
              ? "A community member recently reported that this restroom may be gone."
              : verification.dataSource === "community"
                ? "Added by an IWANNAPEE user · awaiting another confirmation"
                : `Imported from ${source}`}</span>
          {!verified && verification.dataSource !== "community" && verification.sourceUrl && (
            <a href={verification.sourceUrl} rel="noreferrer" target="_blank">View source <ExternalLink size={12} /></a>
          )}
        </div>
        {canLoad && (
          <div className="community-verification-question">
            <small>Is this restroom still here?</small>
            <div>
              <button onClick={() => chooseVerification("confirmed")} type="button"><Check size={15} /> Yes</button>
              <button onClick={() => chooseVerification("not_found")} type="button"><X size={15} /> No</button>
            </div>
          </div>
        )}
      </div>

      {verificationChoice && (
        <div className="community-inline-form">
          <strong>{verificationChoice === "confirmed" ? "Confirm that it’s still here" : "Report that it’s gone"}</strong>
          <p>{verificationChoice === "confirmed" ? "Use this only when you recently saw or used this restroom." : "We’ll keep the pin visible while the report is reviewed."}</p>
          <CaptchaWidget onVerified={setVerificationCaptchaReady} />
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div><button className="button button-ghost" onClick={() => setVerificationChoice(null)} type="button">Cancel</button><button className="button button-primary" disabled={!verificationCaptchaReady || verificationWorking} onClick={submitVerification} type="button">{verificationWorking ? "Saving…" : "Submit verification"}</button></div>
        </div>
      )}

      <div className="community-section-heading">
        <div><Images size={19} /><span><strong>Community photos</strong><small>{details?.photos.length || 0} published</small></span></div>
        {canLoad && <button onClick={openPhotoForm} type="button"><Camera size={15} /> Add photos</button>}
      </div>
      {details?.photos.length ? (
        <div className="community-photo-grid">
          {details.photos.slice(0, 6).map((photo) => (
            <figure key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={photo.caption || `Community photo of ${restroom.name}`} src={photo.url} />
              {photo.caption && <figcaption>{photo.caption}</figcaption>}
            </figure>
          ))}
        </div>
      ) : !loading ? <p className="community-empty-copy">No community photos yet. Add one that helps people recognize the entrance or restroom.</p> : null}

      {photoOpen && (
        <div className="community-inline-form community-photo-form">
          <strong>Add helpful restroom photos</strong>
          <p>Photos are reviewed before they appear. Avoid faces, license plates, and private information.</p>
          <label className="photo-upload">
            <Camera size={21} />
            <span><strong>{photoFiles.length ? `${photoFiles.length} photo${photoFiles.length === 1 ? "" : "s"} selected` : "Choose up to 3 photos"}</strong><small>JPG, PNG, or WebP · 8 MB each</small></span>
            <input accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => {
              try {
                setPhotoFiles(validatePhotoFiles(Array.from(event.target.files || []), 3));
                setFormError("");
              } catch (error) {
                setPhotoFiles([]);
                setFormError(error instanceof PhotoUploadError ? error.message : "Check the selected photos.");
              }
            }} type="file" />
          </label>
          <label><span>Caption <small>optional</small></span><input maxLength={240} onChange={(event) => setPhotoCaption(event.target.value)} placeholder="Entrance is beside the customer service desk" value={photoCaption} /></label>
          <CaptchaWidget onVerified={setPhotoCaptchaReady} />
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div><button className="button button-ghost" onClick={() => setPhotoOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={!photoCaptchaReady || photoFiles.length === 0 || photoWorking} onClick={submitPhotos} type="button">{photoWorking ? "Uploading…" : "Submit photos"}</button></div>
        </div>
      )}

      <div className="community-section-heading community-reviews-heading">
        <div><Star size={19} /><span><strong>Community reviews</strong><small>{details?.reviews.length || restroom.reviewCount} total</small></span></div>
      </div>
      {visibleReviews.map((review) => (
        <article className="community-review" key={review.id}>
          <div className="community-review-heading">
            <span><strong>{review.displayName}</strong><small>{relativeTime(review.updatedAt)}</small></span>
            <span><Star fill="currentColor" size={14} /> {review.overallRating}/5</span>
          </div>
          <div className="community-review-clean"><Droplets size={14} /> {review.cleanlinessRating}/5 cleanliness</div>
          {review.note && <p>{review.note}</p>}
          {review.photos.length > 0 && (
            <div className="community-review-photos">
              {review.photos.map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={photo.caption || `Review photo for ${restroom.name}`} key={photo.id} src={photo.url} />
              ))}
            </div>
          )}
        </article>
      ))}
      {!loading && details?.reviews.length === 0 && <p className="community-empty-copy">No reviews yet. Be the first person to share what the restroom was like.</p>}
      {(details?.reviews.length || 0) > 1 && (
        <button className="community-read-reviews" onClick={() => setExpandedReviews((current) => !current)} type="button">
          {expandedReviews ? "Show one review" : `Read all ${details?.reviews.length} reviews`}
        </button>
      )}
    </section>
  );
}
