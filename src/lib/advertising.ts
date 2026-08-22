export type AdvertisingOffer = {
  priceCents: number;
  durationDays: number;
  defaultRadiusMeters: number;
  maxPlacementBidCents: number;
  sponsoredSlotCount: number;
};

function safeInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function getAdvertisingOffer(): AdvertisingOffer {
  return {
    priceCents: safeInteger(process.env.AD_PRICE_CENTS, 500, 100, 100_000),
    durationDays: safeInteger(process.env.AD_DURATION_DAYS, 7, 1, 365),
    defaultRadiusMeters: safeInteger(process.env.AD_RADIUS_METERS, 8047, 1609, 24_140),
    maxPlacementBidCents: safeInteger(process.env.AD_MAX_PLACEMENT_BID_CENTS, 10_000, 0, 100_000),
    sponsoredSlotCount: 3,
  };
}

export function formatPrice(priceCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
  }).format(priceCents / 100);
}
