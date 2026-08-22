"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { CheckCircle2, ExternalLink, ImagePlus, Save } from "lucide-react";
import { CaptchaWidget } from "@/components/captcha-widget";
import { uploadBusinessImage } from "@/lib/business-image-upload";
import { businessPath } from "@/lib/public-links";
import type { PublicBusinessProfile } from "@/lib/public-directory";

export function BusinessProfileManager({ profile }: { profile: PublicBusinessProfile }) {
  const [captchaReady, setCaptchaReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profileImagePath, setProfileImagePath] = useState<string | null | undefined>(undefined);
  const [coverImagePath, setCoverImagePath] = useState<string | null | undefined>(undefined);
  const [profilePreview, setProfilePreview] = useState(profile.profile_image_url || "");
  const [coverPreview, setCoverPreview] = useState(profile.cover_image_url || "");

  async function chooseImage(file: File | undefined, kind: "profile" | "cover") {
    if (!file) return;
    setError("");
    setWorking(true);
    try {
      const path = await uploadBusinessImage(file);
      const preview = URL.createObjectURL(file);
      if (kind === "profile") { setProfileImagePath(path); setProfilePreview(preview); }
      else { setCoverImagePath(path); setCoverPreview(preview); }
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Image upload failed."); }
    finally { setWorking(false); }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/business/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      profileId: profile.id,
      businessName: form.get("businessName"), description: form.get("description"), websiteUrl: form.get("websiteUrl"), publicEmail: form.get("publicEmail"), phone: form.get("phone"), instagramUrl: form.get("instagramUrl"), facebookUrl: form.get("facebookUrl"), tiktokUrl: form.get("tiktokUrl"), promotionHeadline: form.get("promotionHeadline"), promotionOfferText: form.get("promotionOfferText"), promotionCode: form.get("promotionCode"), profileImagePath, coverImagePath,
    }) });
    const result = (await response.json()) as { error?: string; updated?: boolean };
    setWorking(false);
    if (!response.ok || !result.updated) return setError(result.error || "The profile could not be saved.");
    setProfileImagePath(undefined);
    setCoverImagePath(undefined);
    setNotice("Business profile saved.");
  }

  return (
    <section className="business-profile-manager">
      <div className="business-profile-manager-heading"><div><p className="eyebrow">Verified business profile</p><h2>Manage your public profile</h2><p>Your owner-approved business is tied to its restroom listing. Changes publish immediately.</p></div><a className="button button-secondary" href={businessPath(profile)} rel="noreferrer" target="_blank">View public profile <ExternalLink size={16} /></a></div>
      <form onSubmit={save}>
        <div className="business-image-fields">
          <label className="business-image-field"><span>Profile image</span><div>{profilePreview ? <img alt="Business profile preview" src={profilePreview} /> : <ImagePlus size={26} />}</div><input accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0], "profile")} type="file" /><small>Square logo or storefront image</small>{profilePreview ? <button onClick={() => { setProfileImagePath(null); setProfilePreview(""); }} type="button">Remove</button> : null}</label>
          <label className="business-image-field business-cover-field"><span>Cover image</span><div>{coverPreview ? <img alt="Business cover preview" src={coverPreview} /> : <ImagePlus size={26} />}</div><input accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0], "cover")} type="file" /><small>Wide photo of the location</small>{coverPreview ? <button onClick={() => { setCoverImagePath(null); setCoverPreview(""); }} type="button">Remove</button> : null}</label>
        </div>
        <div className="business-profile-fields">
          <label>Business name<input defaultValue={profile.business_name} maxLength={120} name="businessName" required /></label>
          <label>Public email<input defaultValue={profile.public_email || ""} maxLength={254} name="publicEmail" type="email" /></label>
          <label className="full-field">Description<textarea defaultValue={profile.description || ""} maxLength={1200} name="description" rows={4} /></label>
          <label>Website<input defaultValue={profile.website_url || ""} maxLength={500} name="websiteUrl" placeholder="https://" type="url" /></label>
          <label>Phone<input defaultValue={profile.phone || ""} maxLength={40} name="phone" type="tel" /></label>
          <label>Instagram URL<input defaultValue={profile.instagram_url || ""} maxLength={500} name="instagramUrl" type="url" /></label>
          <label>Facebook URL<input defaultValue={profile.facebook_url || ""} maxLength={500} name="facebookUrl" type="url" /></label>
          <label>TikTok URL<input defaultValue={profile.tiktok_url || ""} maxLength={500} name="tiktokUrl" type="url" /></label>
          <span />
          <label className="full-field">Promotion headline<input defaultValue={profile.promotion_headline || ""} maxLength={100} name="promotionHeadline" placeholder="A useful offer for restroom visitors" /></label>
          <label className="full-field">Promotion details<textarea defaultValue={profile.promotion_offer_text || ""} maxLength={280} name="promotionOfferText" rows={3} /></label>
          <label>Optional promo code<input defaultValue={profile.promotion_code || ""} maxLength={40} name="promotionCode" /></label>
        </div>
        <CaptchaWidget onVerified={setCaptchaReady} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {notice ? <p className="form-success" role="status"><CheckCircle2 size={16} /> {notice}</p> : null}
        <button className="button button-primary" disabled={!captchaReady || working}><Save size={17} /> {working ? "Saving…" : "Save public profile"}</button>
      </form>
    </section>
  );
}
