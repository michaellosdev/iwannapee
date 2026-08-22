"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import {
  Accessibility,
  ArrowRight,
  Baby,
  BadgeDollarSign,
  Check,
  ChevronRight,
  Clipboard,
  Clock3,
  Crown,
  Crosshair,
  Droplets,
  Globe2,
  KeyRound,
  Gavel,
  List,
  LocateFixed,
  LockKeyhole,
  Map as MapIcon,
  MapPin,
  Megaphone,
  Menu,
  Navigation,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Signpost,
  Sparkles,
  Star,
  Toilet,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { AdvertiseDialog } from "@/components/advertise-dialog";
import { AuthDialog } from "@/components/auth-dialog";
import { CaptchaWidget } from "@/components/captcha-widget";
import { openPrivacySettings } from "@/components/google-analytics";
import { ReviewDialog } from "@/components/review-dialog";
import { RestroomCommunity } from "@/components/restroom-community";
import { SiteAttribution } from "@/components/site-attribution";
import { SubmitRestroomDialog } from "@/components/submit-restroom-dialog";
import { formatPrice, type AdvertisingOffer } from "@/lib/advertising";
import { demoRestrooms, DEFAULT_LOCATION } from "@/lib/demo-restrooms";
import { distanceInMeters, formatDistance } from "@/lib/distance";
import { createPromotionViewId, recordPromotionActivity, type PromotionActivityType } from "@/lib/promotion-activity";
import { restroomPath } from "@/lib/public-links";
import { SUPPORT_EMAIL } from "@/lib/site";
import { createClient } from "@/lib/supabase/client";
import type { Coordinates, LocationSearchResult, Restroom, RestroomFeature } from "@/types/restroom";

const RestroomMap = dynamic(() => import("@/components/restroom-map"), {
  ssr: false,
  loading: () => <div className="map-loading"><span />Loading the neighborhood…</div>,
});

function useMobileOverlayScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const mobileViewport = window.matchMedia("(max-width: 760px)");
    const previousBodyStyles = {
      left: document.body.style.left,
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      right: document.body.style.right,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    let locked = false;
    let scrollPosition = 0;

    function lock() {
      if (locked || !mobileViewport.matches) return;

      locked = true;
      scrollPosition = window.scrollY;
      document.documentElement.classList.add("mobile-overlay-open");
      document.body.classList.add("mobile-overlay-open");
      document.body.style.left = "0";
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.right = "0";
      document.body.style.top = `-${scrollPosition}px`;
      document.body.style.width = "100%";
    }

    function unlock() {
      if (!locked) return;

      locked = false;
      document.body.style.left = previousBodyStyles.left;
      document.body.style.overflow = previousBodyStyles.overflow;
      document.body.style.position = previousBodyStyles.position;
      document.body.style.right = previousBodyStyles.right;
      document.body.style.top = previousBodyStyles.top;
      document.body.style.width = previousBodyStyles.width;

      const previousScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, scrollPosition);
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      document.documentElement.classList.remove("mobile-overlay-open");
      document.body.classList.remove("mobile-overlay-open");
    }

    function syncLockToViewport() {
      if (mobileViewport.matches) lock();
      else unlock();
    }

    syncLockToViewport();
    mobileViewport.addEventListener("change", syncLockToViewport);

    return () => {
      mobileViewport.removeEventListener("change", syncLockToViewport);
      unlock();
    };
  }, [active]);
}

type FilterKey = "open" | "accessible" | "code" | "free";

type NearbyRestroomRow = {
  id: string;
  name: string;
  address: string;
  description: string | null;
  directions: string | null;
  hours: string | null;
  is_open_now: boolean | null;
  access_code: string | null;
  access_instructions: string | null;
  cover_photo_url: string | null;
  rating: number | string;
  cleanliness_rating: number | string;
  review_count: number;
  distance_meters: number;
  features: string[] | null;
  last_verified_at: string;
  latitude: number;
  longitude: number;
  data_source: "community" | "openstreetmap" | "refuge";
  source_url: string | null;
  community_verified_at: string | null;
  community_verification_count: number;
  community_not_found_count: number;
};

type NearbyAdvertisementRow = {
  campaign_id: string;
  restroom_id: string | null;
  business_name: string;
  restroom_name: string;
  address: string;
  latitude: number;
  longitude: number;
  hours: string | null;
  is_open_now: boolean | null;
  directions: string | null;
  headline: string;
  offer_text: string;
  promo_code: string | null;
  qr_target_url: string | null;
  destination_url: string | null;
  ends_at: string;
  distance_meters: number;
  placement_rank: number;
  priority_placement: boolean;
};

type GlobalRestroomRankingRow = Omit<NearbyRestroomRow, "distance_meters"> & {
  rank_position: number;
  ranking_score: number | string;
};

type RankedRestroom = Restroom & {
  rankPosition: number;
  rankingScore: number;
};

const filters: { key: FilterKey; label: string; icon: typeof Clock3 }[] = [
  { key: "open", label: "Open now", icon: Clock3 },
  { key: "accessible", label: "Accessible", icon: Accessibility },
  { key: "code", label: "Code available", icon: KeyRound },
  { key: "free", label: "Free", icon: Sparkles },
];

function toRestroom(row: NearbyRestroomRow): Restroom {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    description: row.description || "Community-listed public restroom.",
    directions: row.directions || "Follow signs at the listed address.",
    hours: row.hours || "Hours not yet verified",
    openNow: row.is_open_now,
    accessCode: row.access_code,
    accessInstructions: row.access_instructions,
    coverPhotoUrl: row.cover_photo_url,
    rating: Number(row.rating || 0),
    cleanlinessRating: Number(row.cleanliness_rating || 0),
    reviewCount: row.review_count || 0,
    distanceMeters: Number(row.distance_meters || 0),
    features: (row.features || []) as RestroomFeature[],
    lastVerifiedAt: row.last_verified_at,
    communityVerifiedAt: row.community_verified_at,
    communityVerificationCount: row.community_verification_count || 0,
    communityNotFoundCount: row.community_not_found_count || 0,
    latitude: row.latitude,
    longitude: row.longitude,
    source: row.data_source || "community",
    sourceUrl: row.source_url,
  };
}

function toSponsoredRestroom(row: NearbyAdvertisementRow): Restroom {
  return {
    id: `promotion-${row.campaign_id}`,
    name: row.restroom_name,
    address: row.address,
    description: row.offer_text,
    directions: row.directions || "Ask a team member if you need help finding the restroom.",
    hours: row.hours || "Ask the business for today’s hours",
    openNow: row.is_open_now,
    accessCode: null,
    accessInstructions: `Restroom availability supplied by ${row.business_name}.`,
    coverPhotoUrl: null,
    rating: 0,
    cleanlinessRating: 0,
    reviewCount: 0,
    distanceMeters: Number(row.distance_meters || 0),
    features: [],
    lastVerifiedAt: row.ends_at,
    communityVerifiedAt: null,
    communityVerificationCount: 0,
    communityNotFoundCount: 0,
    latitude: row.latitude,
    longitude: row.longitude,
    source: "promotion",
    promotion: {
      campaignId: row.campaign_id,
      restroomId: row.restroom_id,
      businessName: row.business_name,
      headline: row.headline,
      offerText: row.offer_text,
      promoCode: row.promo_code,
      qrTargetUrl: row.qr_target_url,
      destinationUrl: row.destination_url,
      endsAt: row.ends_at,
      placementRank: Number(row.placement_rank || 999),
      priorityPlacement: Boolean(row.priority_placement),
    },
  };
}

function toRankedRestroom(row: GlobalRestroomRankingRow): RankedRestroom {
  return {
    ...toRestroom({ ...row, distance_meters: 0 }),
    rankPosition: Number(row.rank_position),
    rankingScore: Number(row.ranking_score),
  };
}

async function fetchMappedRestrooms(location: Coordinates) {
  const response = await fetch(`/api/restrooms/nearby?lat=${location.latitude}&lng=${location.longitude}&radius=5000`);
  const nearby = (await response.json()) as Restroom[] | { error: string };
  if (!response.ok || !Array.isArray(nearby)) throw new Error("Nearby search failed");
  return nearby;
}

function FeatureIcon({ feature }: { feature: RestroomFeature }) {
  if (feature === "Accessible") return <Accessibility size={15} />;
  if (feature === "Baby changing") return <Baby size={15} />;
  if (feature === "Code available") return <KeyRound size={15} />;
  if (feature === "Gender neutral") return <Users size={15} />;
  return <Check size={15} />;
}

function RestroomCard({ restroom, onSelect, onPromotionVisible }: { restroom: Restroom; onSelect: () => void; onPromotionVisible: (campaignId: string) => void }) {
  const promotion = restroom.promotion;
  const cardRef = useRef<HTMLElement>(null);
  const coverPhotoUrl = restroom.coverPhotoUrl?.trim() || null;
  const cardClassName = [
    "restroom-card",
    promotion ? "promoted-restroom-card" : "",
    coverPhotoUrl ? "" : "restroom-card-imageless",
  ].filter(Boolean).join(" ");
  const statusClassName = promotion ? "status-badge promoted" : restroom.openNow ? "status-badge open" : restroom.openNow === null ? "status-badge unknown" : "status-badge";
  const statusLabel = promotion ? "Sponsored" : restroom.openNow === null ? "Hours?" : restroom.openNow ? "Open" : "Closed";
  const showStatusBadge = Boolean(promotion || restroom.openNow !== null);
  const ratingChip = promotion ? (
    <span className="rating-chip promoted-chip">{promotion.priorityPlacement ? <Gavel size={14} /> : <Megaphone size={14} />} {promotion.priorityPlacement ? "Priority" : "Offer"}</span>
  ) : restroom.reviewCount > 0 ? (
    <span className="rating-chip"><Star size={14} fill="currentColor" /> {restroom.rating.toFixed(1)}</span>
  ) : (
    <span className="rating-chip rating-new">New</span>
  );

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !promotion) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      onPromotionVisible(promotion.campaignId);
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(card);
    return () => observer.disconnect();
  }, [onPromotionVisible, promotion]);

  return (
    <article className={cardClassName} onClick={onSelect} ref={cardRef}>
      <button className="card-click-target" aria-label={`View ${restroom.name}`} onClick={onSelect} />
      {coverPhotoUrl && (
        <div className="restroom-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={`Restroom at ${restroom.name}`} src={coverPhotoUrl} />
          {showStatusBadge && <span className={statusClassName}>{statusLabel}</span>}
        </div>
      )}
      <div className="restroom-card-body">
        {!coverPhotoUrl && <div className="card-badge-row">{showStatusBadge && <span className={`${statusClassName} status-badge-inline`}>{statusLabel}</span>}{ratingChip}</div>}
        <div className="card-heading-row">
          <div>
            <h3>{restroom.name}</h3>
            <p>{formatDistance(restroom.distanceMeters)} · {restroom.address}</p>
          </div>
          {coverPhotoUrl && ratingChip}
        </div>
        {promotion ? (
          <div className="promotion-card-offer"><strong>{promotion.headline}</strong><span>{promotion.offerText}</span></div>
        ) : (
          <div className="clean-score">
            <Droplets size={15} />
            <span>{restroom.reviewCount ? <><strong>{restroom.cleanlinessRating.toFixed(1)}</strong> cleanliness</> : "Not rated yet"}</span>
            <span className="review-count">{restroom.reviewCount ? `${restroom.reviewCount} reviews` : "Be first"}</span>
          </div>
        )}
        <div className="card-features">
          {restroom.features.slice(0, 3).map((feature) => (
            <span key={feature}><FeatureIcon feature={feature} />{feature}</span>
          ))}
        </div>
        <div className="card-footer">
          <span><Clock3 size={14} /> {restroom.hours}</span>
          <ChevronRight size={17} />
        </div>
      </div>
    </article>
  );
}

function WorldRankingCard({ restroom, onSelect }: { restroom: RankedRestroom; onSelect: () => void }) {
  const coverPhotoUrl = restroom.coverPhotoUrl?.trim() || null;

  return (
    <button className={`world-ranking-card world-rank-${Math.min(restroom.rankPosition, 3)}${coverPhotoUrl ? "" : " world-ranking-card-imageless"}`} onClick={onSelect} type="button">
      {coverPhotoUrl && (
        <div className="world-ranking-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={`Restroom at ${restroom.name}`} src={coverPhotoUrl} />
          <span className="world-rank-badge">
            {restroom.rankPosition === 1 ? <Crown size={15} /> : <Trophy size={14} />}
            #{restroom.rankPosition}
          </span>
        </div>
      )}
      <div className="world-ranking-body">
        {!coverPhotoUrl && (
          <span className="world-rank-badge world-rank-badge-inline">
            {restroom.rankPosition === 1 ? <Crown size={15} /> : <Trophy size={14} />}
            #{restroom.rankPosition}
          </span>
        )}
        <div className="world-ranking-title">
          <div><h3>{restroom.name}</h3><p><MapPin size={13} /> {restroom.address}</p></div>
          <span><Star fill="currentColor" size={14} /> {restroom.rating.toFixed(1)}</span>
        </div>
        <div className="world-ranking-stats">
          <span><Droplets size={14} /><strong>{restroom.cleanlinessRating.toFixed(1)}</strong> clean</span>
          <span><Users size={14} /><strong>{restroom.reviewCount}</strong> reviews</span>
        </div>
        <div className="world-ranking-footer"><span>View on the map</span><ArrowRight size={15} /></div>
      </div>
    </button>
  );
}

function RestroomDetail({
  restroom,
  user,
  onClose,
  onNeedsAuth,
  onRate,
  onNotify,
  onPromotionAction,
}: {
  restroom: Restroom;
  user: User | null;
  onClose: () => void;
  onNeedsAuth: () => void;
  onRate: () => void;
  onNotify: (message: string) => void;
  onPromotionAction: (campaignId: string, eventType: PromotionActivityType) => void;
}) {
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${restroom.latitude},${restroom.longitude}`;

  async function copyCode() {
    if (!restroom.accessCode) return;
    await navigator.clipboard.writeText(restroom.accessCode);
    onNotify("Access code copied");
  }

  async function copyPromoCode() {
    if (!restroom.promotion?.promoCode) return;
    await navigator.clipboard.writeText(restroom.promotion.promoCode);
    onPromotionAction(restroom.promotion.campaignId, "promo_copy");
    onNotify("Promo code copied");
  }

  async function copyQrTarget() {
    if (!restroom.promotion?.qrTargetUrl) return;
    await navigator.clipboard.writeText(restroom.promotion.qrTargetUrl);
    onPromotionAction(restroom.promotion.campaignId, "qr_copy");
    onNotify("QR link copied");
  }

  async function shareRestroom() {
    const publicId = restroom.promotion?.restroomId || restroom.id;
    const url = /^[0-9a-f-]{36}$/i.test(publicId) ? `${window.location.origin}${restroomPath({ id: publicId, name: restroom.name })}` : window.location.href;
    const shareData = { title: restroom.name, text: `${restroom.name} — ${restroom.address}`, url };
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
      onNotify("Location copied to clipboard");
    }
  }

  return (
    <aside className="detail-panel" aria-label={`${restroom.name} details`}>
      <div className="detail-panel-actions">
        <button className="icon-button detail-close" onClick={onClose} aria-label="Close details"><X size={20} /></button>
        <button className="icon-button detail-share" onClick={shareRestroom} aria-label="Share restroom"><Share2 size={19} /></button>
      </div>
      <div className="detail-panel-scroll">
        <div className="detail-photo">
          {restroom.coverPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`Restroom at ${restroom.name}`} src={restroom.coverPhotoUrl} />
          ) : <div className="photo-placeholder"><Toilet size={40} /></div>}
        </div>
        <div className="detail-content">
        <div className="detail-title-row">
          <div>
            <span className={restroom.promotion ? "promoted-text" : restroom.openNow ? "open-text" : restroom.openNow === null ? "unknown-text" : "closed-text"}>{restroom.promotion ? `Sponsored by ${restroom.promotion.businessName}` : restroom.openNow === null ? "Hours not confirmed" : restroom.openNow ? "Open now" : "Closed"}</span>
            <h2>{restroom.name}</h2>
            <p>{formatDistance(restroom.distanceMeters)} away · {restroom.address}</p>
          </div>
          <div className={restroom.promotion ? "detail-score detail-score-featured" : restroom.reviewCount ? "detail-score" : "detail-score detail-score-new"}>
            <strong>{restroom.promotion ? "AD" : restroom.reviewCount ? restroom.rating.toFixed(1) : "New"}</strong>
            <span>{restroom.promotion ? "Offer" : restroom.reviewCount ? <><Star size={13} fill="currentColor" /> {restroom.reviewCount}</> : "Unrated"}</span>
          </div>
        </div>

        <div className="detail-actions">
          <a className="button button-primary" href={directionsUrl} rel="noreferrer" target="_blank">
            <Navigation size={17} /> Directions
          </a>
          {restroom.promotion ? (
            (restroom.promotion.destinationUrl || restroom.promotion.qrTargetUrl) && (
              <a
                className="button button-secondary"
                href={restroom.promotion.destinationUrl || restroom.promotion.qrTargetUrl || "#"}
                onClick={() => restroom.promotion?.destinationUrl && onPromotionAction(restroom.promotion.campaignId, "website_click")}
                rel="noreferrer"
                target="_blank"
              >
                <ArrowRight size={17} /> View offer
              </a>
            )
          ) : null}
          {(!restroom.promotion || restroom.promotion.restroomId) && (
            <button className="button button-secondary" onClick={onRate}><Star size={17} /> {restroom.promotion ? "Rate restroom" : "Rate it"}</button>
          )}
          {/^[0-9a-f-]{36}$/i.test(restroom.promotion?.restroomId || restroom.id) ? <a className="button button-secondary" href={restroomPath({ id: restroom.promotion?.restroomId || restroom.id, name: restroom.name })}>Full listing</a> : null}
        </div>

        {restroom.promotion && (
          <section className="promotion-offer-card">
            <div className="promotion-offer-label">{restroom.promotion.priorityPlacement ? <Gavel size={15} /> : <Megaphone size={15} />} {restroom.promotion.priorityPlacement ? "Priority sponsored offer" : "Sponsored local offer"}</div>
            <h3>{restroom.promotion.headline}</h3>
            <p>{restroom.promotion.offerText}</p>
            {(restroom.promotion.promoCode || restroom.promotion.qrTargetUrl) && (
              <div className="promotion-redemption">
                {restroom.promotion.promoCode && (
                  <button onClick={copyPromoCode} type="button">
                    <span><small>Promo code</small><strong>{restroom.promotion.promoCode}</strong></span>
                    <span><Clipboard size={15} /> Copy</span>
                  </button>
                )}
                {restroom.promotion.qrTargetUrl && (
                  <div className="promotion-qr-action">
                    <a aria-label="Open promoted QR destination" href={restroom.promotion.qrTargetUrl} rel="noreferrer" target="_blank">
                      <QRCodeSVG bgColor="#ffffff" fgColor="#17231d" level="M" marginSize={1} size={90} value={restroom.promotion.qrTargetUrl} />
                    </a>
                    <button onClick={copyQrTarget} type="button"><Clipboard size={14} /> Copy QR link</button>
                  </div>
                )}
              </div>
            )}
            <small className="promotion-offer-expiry">Offer ends {new Date(restroom.promotion.endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small>
          </section>
        )}

        {restroom.promotion ? (
          <div className="access-code-card no-code promotion-access-card">
            <span className="access-code-icon"><Toilet size={20} /></span>
            <span><small>Restroom access</small><strong>Available to visitors</strong></span>
          </div>
        ) : restroom.accessCode ? (
          <button className="access-code-card" onClick={copyCode}>
            <span className="access-code-icon"><KeyRound size={20} /></span>
            <span><small>Community-verified access code</small><strong>{restroom.accessCode}</strong></span>
            <span className="copy-code"><Clipboard size={16} /> Copy</span>
          </button>
        ) : (
          <div className="access-code-card no-code">
            <span className="access-code-icon"><LockKeyhole size={20} /></span>
            <span><small>Access</small><strong>No code needed</strong></span>
          </div>
        )}

        {restroom.accessInstructions && <p className="access-note">{restroom.accessInstructions}</p>}

        <div className={restroom.promotion ? "detail-stats detail-stats-single" : "detail-stats"}>
          {!restroom.promotion && <div><Droplets size={21} /><span><strong>{restroom.reviewCount ? `${restroom.cleanlinessRating.toFixed(1)} / 5` : "Not rated"}</strong><small>Cleanliness</small></span></div>}
          <div><Clock3 size={21} /><span><strong>{restroom.hours}</strong><small>Reported hours</small></span></div>
        </div>

        {restroom.source !== "demo" && (
          <RestroomCommunity restroom={restroom} user={user} onNeedsAuth={onNeedsAuth} onNotify={onNotify} />
        )}

        <section className="detail-section">
          <h3>What to expect</h3>
          <p>{restroom.description}</p>
          <div className="detail-features">
            {restroom.features.map((feature) => <span key={feature}><FeatureIcon feature={feature} />{feature}</span>)}
          </div>
        </section>

        <section className="detail-section">
          <h3>How to find it</h3>
          <p className="directions-copy"><Signpost size={18} /> {restroom.directions}</p>
        </section>

        {restroom.source === "promotion" && (
          <p className="verification-line"><ShieldCheck size={15} /> Paid placement · availability and offer supplied by {restroom.promotion?.businessName}</p>
        )}
        </div>
      </div>
    </aside>
  );
}

export function RestroomExplorer({ adOffer }: { adOffer: AdvertisingOffer }) {
  const [user, setUser] = useState<User | null>(null);
  const [restrooms, setRestrooms] = useState<Restroom[]>([]);
  const [rankedRestrooms, setRankedRestrooms] = useState<RankedRestroom[]>([]);
  const [center, setCenter] = useState<Coordinates>(DEFAULT_LOCATION);
  const [locationLabel, setLocationLabel] = useState("Downtown Los Angeles");
  const [selected, setSelected] = useState<Restroom | null>(null);
  const [reviewing, setReviewing] = useState<Restroom | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authReturnTo, setAuthReturnTo] = useState("/?submit=1");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [advertiseOpen, setAdvertiseOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [searchCaptchaRequired, setSearchCaptchaRequired] = useState(false);
  const [searchRetryNonce, setSearchRetryNonce] = useState(0);
  const promotionViewId = useRef("");
  const requestedRestroomId = useRef("");

  useMobileOverlayScrollLock(Boolean(selected || reviewing || authOpen || submitOpen || advertiseOpen));

  const recordPromotionEvent = useCallback((campaignId: string, eventType: PromotionActivityType) => {
    if (!promotionViewId.current) promotionViewId.current = createPromotionViewId();
    recordPromotionActivity(promotionViewId.current, campaignId, eventType);
  }, []);

  const recordPromotionImpression = useCallback((campaignId: string) => {
    recordPromotionEvent(campaignId, "impression");
  }, [recordPromotionEvent]);

  const refreshRestrooms = useCallback(async (location: Coordinates) => {
    const supabase = createClient();
    setLoadingData(true);
    const mappedRequest = fetchMappedRestrooms(location);
    const communityRequest = supabase
      ? supabase.rpc("nearby_restrooms", {
          user_lat: location.latitude,
          user_lng: location.longitude,
          radius_m: 8000,
        })
      : Promise.resolve(null);
    const promotionRequest = supabase
      ? supabase.rpc("nearby_business_promotions", {
          user_lat: location.latitude,
          user_lng: location.longitude,
        })
      : Promise.resolve(null);
    const [mappedOutcome, communityOutcome, promotionOutcome] = await Promise.allSettled([mappedRequest, communityRequest, promotionRequest]);

    const mapped = mappedOutcome.status === "fulfilled" ? mappedOutcome.value : [];
    const communityResponse = communityOutcome.status === "fulfilled" ? communityOutcome.value : null;
    const community = communityResponse && !communityResponse.error
      ? ((communityResponse.data || []) as NearbyRestroomRow[]).map(toRestroom)
      : [];
    const promotionResponse = promotionOutcome.status === "fulfilled" ? promotionOutcome.value : null;
    const sponsored = promotionResponse && !promotionResponse.error
      ? ((promotionResponse.data || []) as NearbyAdvertisementRow[]).map(toSponsoredRestroom)
      : [];
    const unclaimedMapped = mapped.filter(
      (mappedRestroom) => ![...sponsored, ...community].some((listedRestroom) => distanceInMeters(mappedRestroom, listedRestroom) < 45),
    );
    const unsponsoredCommunity = community.filter(
      (communityRestroom) => !sponsored.some((sponsoredRestroom) => distanceInMeters(communityRestroom, sponsoredRestroom) < 45),
    );

    if (mappedOutcome.status === "fulfilled" || (communityResponse && !communityResponse.error)) {
      setRestrooms([...sponsored, ...unsponsoredCommunity, ...unclaimedMapped]);
      if (!supabase) setNotice("OpenStreetMap discovery · connect Supabase for community updates");
      else if (communityResponse?.error) setNotice("Community updates are unavailable · showing mapped restrooms");
    } else {
      setRestrooms(demoRestrooms.map((restroom) => ({ ...restroom, distanceMeters: distanceInMeters(location, restroom) })));
      setNotice("Nearby search is unavailable · showing sample locations");
    }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      const timeout = window.setTimeout(() => setLoadingRankings(false), 0);
      return () => window.clearTimeout(timeout);
    }

    void supabase.rpc("global_restroom_rankings", { limit_count: 6 }).then(({ data, error }) => {
      setRankedRestrooms(error ? [] : ((data || []) as GlobalRestroomRankingRow[]).map(toRankedRestroom));
      setLoadingRankings(false);
    });
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshRestrooms(center), 0);
    return () => window.clearTimeout(timeout);
  }, [center, refreshRestrooms]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requestedLatitude = Number(params.get("lat"));
    const requestedLongitude = Number(params.get("lng"));
    if (Number.isFinite(requestedLatitude) && requestedLatitude >= -90 && requestedLatitude <= 90 && Number.isFinite(requestedLongitude) && requestedLongitude >= -180 && requestedLongitude <= 180) {
      window.setTimeout(() => setCenter({ latitude: requestedLatitude, longitude: requestedLongitude }), 0);
      window.setTimeout(() => setLocationLabel("Near the selected restroom"), 0);
    }
    if (/^[0-9a-f-]{36}$/i.test(params.get("restroom") || "")) requestedRestroomId.current = params.get("restroom") || "";
    if (params.get("submit") === "1") window.setTimeout(() => setSubmitOpen(true), 0);
    if (params.get("business") === "1" || params.get("advertise") === "1") window.setTimeout(() => setAdvertiseOpen(true), 0);
    if (params.get("business_account") === "1") {
      window.setTimeout(() => setAuthReturnTo("/business"), 0);
      window.setTimeout(() => setAuthOpen(true), 0);
    }
    if (params.get("admin") === "1") {
      window.setTimeout(() => setAuthReturnTo("/admin"), 0);
      window.setTimeout(() => setAuthOpen(true), 0);
    }
    if (params.get("checkout") === "cancelled") window.setTimeout(() => setNotice("Checkout cancelled · your ad was not activated"), 0);

    if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
        if (permission.state === "granted") locateUser();
      }).catch(() => undefined);
    }
    // Run once; the permission callback reads browser state only.
  }, []);

  useEffect(() => {
    if (!requestedRestroomId.current || restrooms.length === 0) return;
    const match = restrooms.find((restroom) => restroom.id === requestedRestroomId.current || restroom.promotion?.restroomId === requestedRestroomId.current);
    if (match) {
      setSelected(match);
      requestedRestroomId.current = "";
    }
  }, [restrooms]);

  useEffect(() => {
    if (search.trim().length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({
          lat: String(center.latitude),
          lng: String(center.longitude),
          q: search,
        });
        const response = await fetch(`/api/geocode?${params}`, { signal: controller.signal });
        const results = (await response.json()) as LocationSearchResult[] | { code?: string };
        if (!response.ok && !Array.isArray(results) && results.code === "captcha_required") {
          setSearchCaptchaRequired(true);
        }
        setSearchResults(response.ok && Array.isArray(results) ? results : []);
      } catch {
        if (!controller.signal.aborted) setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [center, search, searchRetryNonce]);

  function locateUser() {
    if (!navigator.geolocation) {
      setNotice("Location services aren’t available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCenter(location);
        setLocationLabel("Near your current location");
        setLocating(false);
        setNotice("Location updated");
      },
      () => {
        setLocating(false);
        setNotice("We couldn’t access your location. Search for a neighborhood instead.");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
    );
  }

  function selectSearchResult(result: LocationSearchResult) {
    setCenter({ latitude: result.latitude, longitude: result.longitude });
    setLocationLabel(result.label.split(",").slice(0, 2).join(","));
    setSearch("");
    setSearchResults([]);
  }

  function updateSearch(value: string) {
    setSearch(value);
    if (value.trim().length < 3) setSearchResults([]);
  }

  function toggleFilter(filter: FilterKey) {
    setActiveFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter],
    );
  }

  function beginSubmission() {
    setMobileNavOpen(false);
    setAuthReturnTo("/?submit=1");
    if (!user) setAuthOpen(true);
    else setSubmitOpen(true);
  }

  function beginAdvertising() {
    setMobileNavOpen(false);
    setAuthReturnTo("/?business=1");
    setAdvertiseOpen(true);
  }

  function openAccount() {
    setAuthReturnTo("/business");
    setAuthOpen(true);
  }

  function openRankedRestroom(restroom: RankedRestroom) {
    setCenter({ latitude: restroom.latitude, longitude: restroom.longitude });
    setLocationLabel(restroom.name);
    setView("map");
    setSelected({ ...restroom, distanceMeters: 0 });
    window.setTimeout(() => document.getElementById("find")?.scrollIntoView({ behavior: "smooth" }), 0);
  }

  function selectRestroom(restroom: Restroom) {
    if (restroom.promotion) recordPromotionEvent(restroom.promotion.campaignId, "detail_open");
    setSelected(restroom);
  }

  const visibleRestrooms = useMemo(() => {
    return restrooms
      .filter((restroom) => !activeFilters.includes("open") || restroom.openNow === true)
      .filter((restroom) => !activeFilters.includes("accessible") || restroom.features.includes("Accessible"))
      .filter((restroom) => !activeFilters.includes("code") || Boolean(restroom.accessCode))
      .filter((restroom) => !activeFilters.includes("free") || restroom.features.includes("Free"))
      .sort((first, second) => {
        const sponsoredDifference = Number(Boolean(second.promotion)) - Number(Boolean(first.promotion));
        if (sponsoredDifference) return sponsoredDifference;
        if (first.promotion && second.promotion) return first.promotion.placementRank - second.promotion.placementRank;
        return first.distanceMeters - second.distanceMeters;
      });
  }, [activeFilters, restrooms]);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="IWANNAPEE home">
          <span className="brand-mark"><Image alt="" height={512} priority src="/brand/iwannapee-logo.webp" width={512} /></span>
          <span>IWANNAPEE</span>
        </a>
        <nav className={mobileNavOpen ? "main-nav open" : "main-nav"} aria-label="Main navigation">
          <a href="#find" onClick={() => setMobileNavOpen(false)}>Find a restroom</a>
          <Link href="/restrooms">Directory</Link>
          <a href="#world-rankings" onClick={() => setMobileNavOpen(false)}>World rankings</a>
          <a href="#how-it-works" onClick={() => setMobileNavOpen(false)}>How it works</a>
          <button className="nav-link" onClick={beginSubmission}>Add a restroom</button>
          <button className="nav-link nav-business" onClick={beginAdvertising}>Promote {formatPrice(adOffer.priceCents)}</button>
        </nav>
        <div className="header-actions">
          <button className="button button-header" onClick={openAccount}>
            <UserRound size={17} /> {user ? "My promotions" : "Sign in"}
          </button>
          <button className="mobile-menu" onClick={() => setMobileNavOpen((current) => !current)} aria-label="Toggle menu">
            {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-float-layer" aria-hidden="true">
          <div className="hero-float hero-float-classic">
            <Image alt="" height={1536} priority src="/hero/toilet-classic.png" width={1024} />
          </div>
          <div className="hero-float hero-float-mint">
            <Image alt="" height={1295} priority src="/hero/stall-mint.png" width={1214} />
          </div>
          <div className="hero-float hero-float-yellow">
            <Image alt="" height={1161} priority src="/hero/stalls-yellow.png" width={1355} />
          </div>
          <div className="hero-float hero-float-blue">
            <Image alt="" height={1024} priority src="/hero/toilet-blue.png" width={1536} />
          </div>
        </div>
        <div className="hero-content">
          <div className="hero-proof"><ShieldCheck size={15} /><span>Community-powered restroom access</span></div>
          <h1>You have the right<br />{" "}to <em>pee.</em></h1>
          <p>Find a clean, accessible public restroom near you—without guessing, begging, or buying something you don’t need.</p>

          <div className="hero-search-wrap">
            <div className="hero-search">
              <Search size={21} />
              <input
                aria-label="Search an address or neighborhood"
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="Enter an address or neighborhood"
                value={search}
              />
              <button className="locate-button" onClick={locateUser} disabled={locating}>
                <LocateFixed size={18} /> <span>{locating ? "Locating…" : "Use my location"}</span>
              </button>
            </div>
            {searchCaptchaRequired && (
              <div className="geocode-captcha hero-geocode-captcha">
                <CaptchaWidget onVerified={(verified) => {
                  if (!verified) return;
                  setSearchCaptchaRequired(false);
                  setSearchRetryNonce((current) => current + 1);
                }} />
              </div>
            )}
            {(searchResults.length > 0 || searching) && (
              <div className="search-results">
                {searching && <p>Finding places…</p>}
                {searchResults.map((result) => (
                  <button key={`${result.latitude}-${result.longitude}`} onClick={() => selectSearchResult(result)}>
                    <MapPin size={17} /><span>{result.label}</span><ArrowRight size={16} />
                  </button>
                ))}
                {searchResults.length > 0 && <small>Addresses © OpenStreetMap contributors</small>}
              </div>
            )}
          </div>
          <div className="hero-trust"><span><ShieldCheck size={16} /> Community verified</span><span><Accessibility size={16} /> Accessibility filters</span><span><KeyRound size={16} /> Codes when available</span><span><MapPin size={16} /> Location isn’t stored</span></div>
        </div>
      </section>

      <section className="explorer-section" id="find">
        <div className="explorer-heading">
          <div>
            <p className="eyebrow"><MapPin size={14} /> Around you</p>
            <h2>Restrooms near {locationLabel}</h2>
            <p>{loadingData ? "Checking the neighborhood…" : `${visibleRestrooms.length} places match your filters`}</p>
          </div>
          <div className="view-toggle" role="group" aria-label="View options">
            <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><MapIcon size={17} /> Map</button>
            <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={17} /> List</button>
          </div>
        </div>

        <div className="filter-row">
          <span className="filter-label">Filter:</span>
          {filters.map(({ key, label, icon: Icon }) => (
            <button className={activeFilters.includes(key) ? "filter-chip active" : "filter-chip"} key={key} onClick={() => toggleFilter(key)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {view === "map" ? (
          <div className="map-layout">
            <div className="result-sidebar">
              {visibleRestrooms.map((restroom) => <RestroomCard key={restroom.id} restroom={restroom} onPromotionVisible={recordPromotionImpression} onSelect={() => selectRestroom(restroom)} />)}
              {visibleRestrooms.length === 0 && <EmptyResults onClear={() => setActiveFilters([])} />}
            </div>
            <div className="map-stage">
              <RestroomMap center={center} restrooms={visibleRestrooms} selectedId={selected?.id || null} onSelect={selectRestroom} />
              <button className="map-locate-control" onClick={locateUser} aria-label="Use current location"><Crosshair size={20} /></button>
              <div className="map-legend"><span className="legend-user" /> You <span className="legend-restroom" /> Restroom <span className="legend-featured" /> Sponsored</div>
            </div>
          </div>
        ) : (
          <div className="list-grid">
            {visibleRestrooms.map((restroom) => <RestroomCard key={restroom.id} restroom={restroom} onPromotionVisible={recordPromotionImpression} onSelect={() => selectRestroom(restroom)} />)}
            {visibleRestrooms.length === 0 && <EmptyResults onClear={() => setActiveFilters([])} />}
          </div>
        )}
      </section>

      <section className="world-ranking-section" id="world-rankings">
        <div className="world-ranking-heading">
          <div>
            <p className="eyebrow"><Globe2 size={14} /> Community leaderboard</p>
            <h2>The world’s best places to go.</h2>
          </div>
          <p>Overall rating, cleanliness, and review confidence decide the order—not paid placement.</p>
        </div>

        {loadingRankings ? (
          <div className="world-ranking-grid" aria-label="Loading worldwide rankings">
            {[1, 2, 3].map((rank) => <div className="world-ranking-skeleton" key={rank} />)}
          </div>
        ) : rankedRestrooms.length > 0 ? (
          <div className="world-ranking-grid">
            {rankedRestrooms.map((restroom) => <WorldRankingCard key={restroom.id} restroom={restroom} onSelect={() => openRankedRestroom(restroom)} />)}
          </div>
        ) : (
          <div className="world-ranking-empty">
            <span><Trophy size={28} /></span>
            <div><h3>The global leaderboard is warming up.</h3><p>Published restrooms appear here after their first community review.</p></div>
            <a className="button button-secondary" href="#find">Explore and rate nearby</a>
          </div>
        )}

        <p className="world-ranking-method"><ShieldCheck size={14} /> Confidence-weighted worldwide ranking · sponsored listings cannot buy a place</p>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-copy">
          <p className="eyebrow">Built for real life</p>
          <h2>Better bathroom information, one visit at a time.</h2>
          <p>IWANNAPEE turns small community updates into something genuinely useful—especially for parents, disabled people, delivery workers, travelers, and anyone who simply needs to go.</p>
          <button className="button button-primary" onClick={beginSubmission}><Plus size={18} /> Add a restroom</button>
        </div>
        <div className="how-steps">
          <article><span>01</span><div><MapPin size={23} /><h3>Find the closest option</h3><p>Search around your current location or any neighborhood.</p></div></article>
          <article><span>02</span><div><Sparkles size={23} /><h3>Know before you go</h3><p>Check access, cleanliness, hours, photos, and directions.</p></div></article>
          <article><span>03</span><div><Users size={23} /><h3>Leave it better</h3><p>Confirm a code, update a detail, or add a missing location.</p></div></article>
        </div>
      </section>

      <section className="business-promotion-section" id="business-promotion">
        <div className="business-promotion-copy">
          <p className="eyebrow"><Megaphone size={14} /> For local businesses</p>
          <h2>A useful restroom stop can become a new customer.</h2>
          <p>Start sponsored for {formatPrice(adOffer.priceCents)}, then add an optional one-time placement bid for one of {adOffer.sponsoredSlotCount} nearby sponsored slots. Welcome visitors with a discount, promo code, or QR link.</p>
          <div className="business-promotion-price"><strong>{formatPrice(adOffer.priceCents)}</strong><span>{adOffer.durationDays} days<br />one-time payment</span></div>
          <button className="button button-primary" onClick={beginAdvertising}><BadgeDollarSign size={18} /> Create your promotion</button>
        </div>
        <div className="business-promotion-demo" aria-label="Sponsored restroom example">
          <div className="business-promotion-demo-card">
            <div className="business-promotion-demo-label"><Gavel size={14} /> Priority sponsored · nearby</div>
            <span className="business-promotion-demo-business">JUNIPER COFFEE</span>
            <h3>Come for relief. Stay for 10% off.</h3>
            <p>Our restroom is available during business hours. Show this offer for 10% off any drink.</p>
            <div><span><small>Promo code</small><strong>RELIEF10</strong></span><QRCodeSVG bgColor="#ffffff" fgColor="#17231d" level="M" marginSize={1} size={82} value="https://www.iwannapee.lol/?offer=RELIEF10" /></div>
          </div>
          <p><Gavel size={15} /> Higher one-time bids rank first; distance breaks ties.</p>
        </div>
      </section>

      <section className="community-cta">
        <div className="cta-icon"><Toilet size={36} /></div>
        <div><p className="eyebrow">See something missing?</p><h2>The best restroom map is the one we build together.</h2></div>
        <button className="button button-light" onClick={beginSubmission}>Add a restroom <ArrowRight size={18} /></button>
      </section>

      <footer className="site-footer" id="site-footer">
        <div className="site-footer-content">
          <a className="brand brand-footer" href="#top" aria-label="IWANNAPEE home"><span className="brand-mark"><Image alt="" height={512} src="/brand/iwannapee-logo.webp" width={512} /></span><span>IWANNAPEE</span></a>
          <p>Everyone deserves dignified access to a restroom.</p>
          <nav className="site-footer-links" aria-label="Footer"><button onClick={openAccount}>Account</button><Link href="/restrooms">Restroom directory</Link><a href="#world-rankings">Rankings</a><button onClick={beginSubmission}>Contribute</button><button onClick={beginAdvertising}>Business promotion</button><a href="/terms">Terms</a><a href="/refund-policy">Refund Policy</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{process.env.NEXT_PUBLIC_GA4_ID && <button onClick={openPrivacySettings}>Privacy settings</button>}<a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">© OpenStreetMap contributors</a><a href="https://www.refugerestrooms.org/" rel="noreferrer" target="_blank">Supporting data: REFUGE Restrooms</a><a href="https://www.geoapify.com/" rel="noreferrer" target="_blank">Addresses powered by Geoapify</a></nav>
        </div>
        <SiteAttribution />
      </footer>

      {selected && (
        <>
          <div className="detail-backdrop" onClick={() => setSelected(null)} />
          <RestroomDetail
            restroom={selected}
            user={user}
            onClose={() => setSelected(null)}
            onNeedsAuth={() => {
              setAuthReturnTo("/");
              setAuthOpen(true);
            }}
            onRate={() => setReviewing(selected)}
            onNotify={setNotice}
            onPromotionAction={recordPromotionEvent}
          />
        </>
      )}

      {notice && <button className="toast" onClick={() => setNotice("")}><Check size={16} /> {notice}<X size={15} /></button>}

      <AuthDialog open={authOpen} user={user} returnTo={authReturnTo} onClose={() => setAuthOpen(false)} onSignedOut={() => setUser(null)} />
      <AdvertiseDialog open={advertiseOpen} user={user} currentLocation={center} offer={adOffer} onClose={() => setAdvertiseOpen(false)} onNeedsAuth={() => setAuthOpen(true)} />
      <SubmitRestroomDialog open={submitOpen} user={user} currentLocation={center} onClose={() => setSubmitOpen(false)} onNeedsAuth={() => setAuthOpen(true)} />
      <ReviewDialog key={reviewing ? (reviewing.promotion?.restroomId || reviewing.id) : "closed-review"} restroom={reviewing} user={user} onClose={() => setReviewing(null)} onNeedsAuth={() => setAuthOpen(true)} />
    </main>
  );
}

function EmptyResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="empty-results">
      <Toilet size={35} />
      <h3>No matches nearby</h3>
      <p>Try removing a filter or moving the map to a different area.</p>
      <button className="button button-secondary" onClick={onClear}>Clear filters</button>
    </div>
  );
}
