"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import {
  BadgeDollarSign,
  Check,
  Crosshair,
  Gavel,
  KeyRound,
  MapPin,
  Megaphone,
  QrCode,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { CaptchaWidget } from "@/components/captcha-widget";
import { WeeklyHoursEditor } from "@/components/weekly-hours-editor";
import { formatPrice, type AdvertisingOffer } from "@/lib/advertising";
import { createHoursSchedule, InvalidHoursSchedule, normalizeHoursSchedule } from "@/lib/hours";
import {
  DEFAULT_PROMOTION_COLOR,
  PROMOTION_COLORS,
  promotionColorClassName,
  type PromotionColorKey,
} from "@/lib/promotion-colors";
import { SUPPORT_EMAIL } from "@/lib/site";
import type { Coordinates, LocationSearchResult } from "@/types/restroom";

type AdvertiseDialogProps = {
  open: boolean;
  user: User | null;
  currentLocation: Coordinates;
  offer: AdvertisingOffer;
  onClose: () => void;
  onNeedsAuth: () => void;
};

const radiusOptions = [1, 3, 5, 10];

export function AdvertiseDialog({
  open,
  user,
  currentLocation,
  offer,
  onClose,
  onNeedsAuth,
}: AdvertiseDialogProps) {
  const [businessName, setBusinessName] = useState("");
  const [restroomName, setRestroomName] = useState("");
  const [address, setAddress] = useState("");
  const [hoursSchedule, setHoursSchedule] = useState(() => createHoursSchedule("scheduled"));
  const [directions, setDirections] = useState("");
  const [headline, setHeadline] = useState("");
  const [offerText, setOfferText] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [colorKey, setColorKey] = useState<PromotionColorKey>(DEFAULT_PROMOTION_COLOR);
  const [qrTargetUrl, setQrTargetUrl] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState("Choose an address suggestion or place the pin");
  const [radiusMiles, setRadiusMiles] = useState(
    radiusOptions.reduce((closest, option) =>
      Math.abs(option - offer.defaultRadiusMeters / 1609.344) < Math.abs(closest - offer.defaultRadiusMeters / 1609.344)
        ? option
        : closest,
    radiusOptions[0]),
  );
  const [placementBidCents, setPlacementBidCents] = useState(0);
  const [supportAmount, setSupportAmount] = useState("");
  const [confirmedPublic, setConfirmedPublic] = useState(false);
  const [confirmedTerms, setConfirmedTerms] = useState(false);
  const [status, setStatus] = useState<"idle" | "locating" | "checkout">("idle");
  const [error, setError] = useState("");
  const [captchaReady, setCaptchaReady] = useState(false);

  if (!open) return null;

  const previewQrUrl = qrTargetUrl || destinationUrl;
  const supportAmountCents = /^\d+(?:\.\d{0,2})?$/.test(supportAmount.trim())
    ? Math.round(Number(supportAmount) * 100)
    : supportAmount.trim() ? -1 : 0;
  const totalPriceCents = offer.priceCents + placementBidCents + Math.max(0, supportAmountCents);
  const bidOptions = Array.from(new Set([0, 500, 1500, 3000, offer.maxPlacementBidCents]))
    .filter((amount) => amount <= offer.maxPlacementBidCents)
    .sort((first, second) => first - second);

  async function pinAddress() {
    if (!address.trim()) {
      setError("Enter the restroom address before placing its promotion pin.");
      return;
    }

    setStatus("locating");
    setError("");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
      const results = (await response.json()) as LocationSearchResult[] | { error: string };
      if (!response.ok || !Array.isArray(results) || !results[0]) throw new Error("We couldn’t find that address.");
      setCoordinates({ latitude: results[0].latitude, longitude: results[0].longitude });
      setLocationLabel(`Ad pin: ${results[0].label}`);
    } catch (pinError) {
      setError(pinError instanceof Error ? pinError.message : "We couldn’t place the pin.");
    } finally {
      setStatus("idle");
    }
  }

  async function startCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!user) {
      onClose();
      onNeedsAuth();
      return;
    }
    if (!confirmedPublic) {
      setError("Confirm that customers may genuinely use this restroom.");
      return;
    }
    if (!confirmedTerms) {
      setError("Agree to the Terms and Refund Policy before opening checkout.");
      return;
    }
    if (!coordinates) {
      setError("Choose an address suggestion or select Place pin before opening checkout.");
      return;
    }
    try {
      normalizeHoursSchedule(hoursSchedule, false);
    } catch (hoursError) {
      setError(hoursError instanceof InvalidHoursSchedule ? hoursError.message : "Check the available hours.");
      return;
    }
    if (supportAmountCents < 0 || supportAmountCents > 100_000) {
      setError("Project support must be between $0 and $1,000.");
      return;
    }

    setStatus("checkout");
    try {
      const response = await fetch("/api/business/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          restroomName,
          address,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          hoursSchedule,
          directions,
          headline,
          offerText,
          promoCode,
          colorKey,
          qrTargetUrl,
          destinationUrl,
          radiusMiles,
          placementBidCents,
          supportAmountCents,
        }),
      });
      const result = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (response.status === 401) {
        onClose();
        onNeedsAuth();
        return;
      }
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error || "Checkout couldn’t start.");
      window.location.assign(result.checkoutUrl);
    } catch (checkoutError) {
      setStatus("idle");
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout couldn’t start.");
    }
  }

  return (
    <div className="dialog-backdrop business-flow-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="business-promotion-title"
        aria-modal="true"
        className="business-promotion-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close business promotion form"><X size={20} /></button>

        <div className="business-promotion-form-pane">
          <div className="business-promotion-intro-icon"><Megaphone size={24} /></div>
          <p className="eyebrow">Right place, right moment</p>
          <h2 id="business-promotion-title">Turn restroom visits into customers.</h2>
          <p className="dialog-copy">
            Promote a genuinely available restroom to nearby people and give them an optional offer, promo code, or QR destination.
          </p>

          <div className="promotion-price-strip">
            <strong>{formatPrice(totalPriceCents)}</strong>
            <span>{offer.durationDays} days · {formatPrice(offer.priceCents)} listing{placementBidCents > 0 ? ` + ${formatPrice(placementBidCents)} placement bid` : ""}{supportAmountCents > 0 ? ` + ${formatPrice(supportAmountCents)} project support` : ""} · no subscription</span>
          </div>

          <form className="business-promotion-form" onSubmit={startCheckout}>
            <fieldset>
              <legend>Place</legend>
              <div className="form-grid">
                <label>
                  <span>Business name</span>
                  <input maxLength={120} onChange={(event) => setBusinessName(event.target.value)} placeholder="Juniper Coffee" required value={businessName} />
                </label>
                <label>
                  <span>Restroom listing name</span>
                  <input maxLength={120} onChange={(event) => setRestroomName(event.target.value)} placeholder="Juniper Coffee restroom" required value={restroomName} />
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
                        setLocationLabel(`Ad pin: ${result.label}`);
                      }}
                      placeholder="Start typing a street address"
                      required
                      value={address}
                    />
                    <button className="button button-small button-secondary" disabled={status === "locating"} onClick={pinAddress} type="button">
                      <Crosshair size={16} /> {status === "locating" ? "Finding…" : "Place pin"}
                    </button>
                  </div>
                  <small className="field-hint"><MapPin size={13} /> {locationLabel}</small>
                </label>
                <label>
                  <span>Directions inside</span>
                  <input maxLength={500} onChange={(event) => setDirections(event.target.value)} placeholder="Past the counter, on the left" value={directions} />
                </label>
                <div className="form-span-2 form-field-group">
                  <span>Available hours</span>
                  <WeeklyHoursEditor allowUnknown={false} onChange={setHoursSchedule} value={hoursSchedule} />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Promotion</legend>
              <label>
                <span>Headline</span>
                <input maxLength={100} onChange={(event) => setHeadline(event.target.value)} placeholder="A clean stop—and 10% off coffee" required value={headline} />
              </label>
              <label>
                <span>Offer details</span>
                <textarea maxLength={280} onChange={(event) => setOfferText(event.target.value)} placeholder="Show this listing at checkout for 10% off any drink. No purchase is required to use the restroom." required rows={3} value={offerText} />
              </label>
              <div className="form-grid">
                <label>
                  <span>Promo code <small>optional</small></span>
                  <div className="input-with-icon"><KeyRound size={17} /><input maxLength={40} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} placeholder="RELIEF10" value={promoCode} /></div>
                </label>
                <label>
                  <span>QR destination <small>optional</small></span>
                  <div className="input-with-icon"><QrCode size={17} /><input onChange={(event) => setQrTargetUrl(event.target.value)} placeholder="https://…" type="url" value={qrTargetUrl} /></div>
                </label>
                <label className="form-span-2">
                  <span>Business website <small>optional</small></span>
                  <input onChange={(event) => setDestinationUrl(event.target.value)} placeholder="https://yourbusiness.com" type="url" value={destinationUrl} />
                </label>
              </div>
              <div className="promotion-color-field">
                <span>Promotion color</span>
                <div aria-label="Promotion color" className="promotion-color-picker" role="radiogroup">
                  {PROMOTION_COLORS.map((color) => (
                    <button
                      aria-checked={colorKey === color.key}
                      aria-label={color.label}
                      className={`${promotionColorClassName(color.key)}${colorKey === color.key ? " active" : ""}`}
                      key={color.key}
                      onClick={() => setColorKey(color.key)}
                      role="radio"
                      type="button"
                    >
                      <span />
                      <small>{color.label}</small>
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Local reach</legend>
              <div className="placement-radius-options" role="group" aria-label="Promotion radius">
                {radiusOptions.map((radius) => (
                  <button className={radiusMiles === radius ? "active" : ""} key={radius} onClick={() => setRadiusMiles(radius)} type="button">
                    {radius} mi
                  </button>
                ))}
              </div>
              <p className="placement-radius-note"><MapPin size={14} /> The promotion appears only to people within {radiusMiles} {radiusMiles === 1 ? "mile" : "miles"} of this restroom.</p>
            </fieldset>

            <fieldset>
              <legend>Placement bid <small>optional</small></legend>
              <div className="placement-bid-copy">
                <Gavel size={18} />
                <p>There are {offer.sponsoredSlotCount} sponsored slots in each local search. Higher one-time bids rank first; distance breaks ties. Choose no boost for standard sponsored eligibility.</p>
              </div>
              <div className="placement-bid-options" role="group" aria-label="One-time placement bid">
                {bidOptions.map((amount) => (
                  <button className={placementBidCents === amount ? "active" : ""} key={amount} onClick={() => setPlacementBidCents(amount)} type="button">
                    <span>{amount === 0 ? "No boost" : `+${formatPrice(amount)}`}</span>
                    <small>{amount === 0 ? "Standard" : "Priority bid"}</small>
                  </button>
                ))}
              </div>
              <p className="placement-bid-warning">Paid once at checkout—not per click. A bid improves rank but cannot guarantee a slot when three higher eligible bids are nearby.</p>
            </fieldset>

            <fieldset>
              <legend>Support IWANNAPEE <small>optional</small></legend>
              <div className="project-support-field">
                <div>
                  <Sparkles size={18} />
                  <p>Like the project? Add any amount to help us verify more restrooms and keep improving the map.</p>
                </div>
                <label>
                  <span>$</span>
                  <input
                    aria-label="Optional project support amount"
                    inputMode="decimal"
                    max="1000"
                    min="0"
                    onChange={(event) => setSupportAmount(event.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                    value={supportAmount}
                  />
                </label>
              </div>
              <p className="placement-bid-warning">This is optional project support and does not change placement.</p>
            </fieldset>

            <label className="promotion-confirmation">
              <input checked={confirmedPublic} onChange={(event) => setConfirmedPublic(event.target.checked)} required type="checkbox" />
              <span>I confirm this restroom is genuinely available during the hours shown and that the offer is accurate.</span>
            </label>

            <label className="promotion-confirmation promotion-terms-confirmation">
              <input checked={confirmedTerms} onChange={(event) => setConfirmedTerms(event.target.checked)} required type="checkbox" />
              <span>I agree to the <a href="/terms" rel="noreferrer" target="_blank">Terms</a> and <a href="/refund-policy" rel="noreferrer" target="_blank">Refund Policy</a>, including that purchases are final after activation and only an IWANNAPEE administrator can approve a refund.</span>
            </label>

            <CaptchaWidget onVerified={setCaptchaReady} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary button-full promotion-checkout-button" disabled={status === "checkout" || !captchaReady || !confirmedPublic || !confirmedTerms}>
              <BadgeDollarSign size={19} /> {status === "checkout" ? "Opening secure checkout…" : `Pay ${formatPrice(totalPriceCents)} & launch for ${offer.durationDays} days`}
            </button>
            <p className="promotion-payment-note"><ShieldCheck size={14} /> Stripe shows each purchase item separately. Campaign details can’t be activated from the browser. Payment support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
          </form>
        </div>

        <aside className="business-promotion-preview-pane" aria-label="Sponsored promotion preview">
          <div className="business-promotion-preview-heading"><Sparkles size={16} /><span>Live preview</span></div>
          <div className={`promotion-preview-card ${promotionColorClassName(colorKey)}`}>
            <div className="promotion-preview-topline"><span>{placementBidCents > 0 ? "Priority sponsored" : "Sponsored"}</span><small>{radiusMiles} mi radius</small></div>
            <div className="promotion-preview-place">
              <div className="promotion-preview-pin"><MapPin size={21} /></div>
              <div><small>{businessName || "Your business"}</small><strong>{restroomName || "Your restroom"}</strong><span>{address || "Restroom address"}</span></div>
            </div>
            <div className="promotion-preview-offer">
              <p>{headline || "Give nearby visitors a reason to stop in."}</p>
              <span>{offerText || "Add a useful offer, discount, or welcome message."}</span>
            </div>
            {(promoCode || previewQrUrl) && (
              <div className="promotion-preview-redemption">
                {promoCode && <div><small>Promo code</small><strong>{promoCode}</strong></div>}
                {previewQrUrl && <QRCodeSVG bgColor="#ffffff" fgColor="#17231d" level="M" marginSize={1} size={78} value={previewQrUrl} />}
              </div>
            )}
            <div className="promotion-preview-footer"><Check size={14} /> Restroom available · offer optional</div>
          </div>
          <div className="promotion-preview-explainer">
            <h3>Campaign setup</h3>
            <ul>
              <li><MapPin size={15} /> Location-targeted placement</li>
              <li><QrCode size={15} /> QR or promo-code redemption</li>
              <li><Megaphone size={15} /> Sponsored map and list treatment</li>
              <li><Gavel size={15} /> {placementBidCents > 0 ? `${formatPrice(placementBidCents)} one-time priority bid` : "Optional one-time placement bid"}</li>
              {supportAmountCents > 0 && <li><Sparkles size={15} /> {formatPrice(supportAmountCents)} supporting IWANNAPEE improvements</li>}
              <li><ShieldCheck size={15} /> Clear sponsored disclosure</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
