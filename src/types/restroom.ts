export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type RestroomFeature =
  | "Accessible"
  | "Baby changing"
  | "Gender neutral"
  | "Free"
  | "Code available"
  | "Single stall";

export type RestroomPromotion = {
  campaignId: string;
  restroomId: string | null;
  businessName: string;
  headline: string;
  offerText: string;
  promoCode: string | null;
  qrTargetUrl: string | null;
  destinationUrl: string | null;
  endsAt: string;
  placementRank: number;
  priorityPlacement: boolean;
};

export type Restroom = Coordinates & {
  id: string;
  name: string;
  address: string;
  description: string;
  directions: string;
  hours: string;
  openNow: boolean | null;
  accessCode: string | null;
  accessInstructions: string | null;
  coverPhotoUrl: string | null;
  rating: number;
  cleanlinessRating: number;
  reviewCount: number;
  distanceMeters: number;
  features: RestroomFeature[];
  lastVerifiedAt: string;
  source: "community" | "openstreetmap" | "refuge" | "promotion" | "demo";
  sourceUrl?: string | null;
  promotion?: RestroomPromotion;
};

export type LocationSearchResult = Coordinates & {
  label: string;
};
