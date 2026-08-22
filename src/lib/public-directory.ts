import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicRestroom = {
  id: string;
  status: string;
  name: string;
  address: string;
  description: string | null;
  directions: string | null;
  hours: string | null;
  hours_schedule_status: string;
  weekly_hours: unknown;
  timezone: string | null;
  latitude: number;
  longitude: number;
  access_code: string | null;
  access_instructions: string | null;
  cover_photo_url: string | null;
  features: string[];
  rating: number;
  cleanliness_rating: number;
  review_count: number;
  data_source: string;
  source_url: string | null;
  community_verified_at: string | null;
  community_verification_count: number;
  community_not_found_count: number;
  created_at: string;
  updated_at: string;
};

export type PublicBusinessProfile = {
  id: string;
  restroom_id: string;
  business_name: string;
  description: string | null;
  profile_image_url: string | null;
  cover_image_url: string | null;
  website_url: string | null;
  public_email: string | null;
  phone: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  promotion_headline: string | null;
  promotion_offer_text: string | null;
  promotion_code: string | null;
  verified_at: string;
  updated_at: string;
};

export type PublicReview = {
  id: string;
  overall_rating: number;
  cleanliness_rating: number;
  note: string | null;
  created_at: string;
};

export type CityDirectory = {
  slug: string;
  name: string;
  region: string;
  description: string;
  bounds: { west: number; south: number; east: number; north: number };
};

export const DIRECTORY_CITIES: CityDirectory[] = [
  { slug: "glendale-ca", name: "Glendale", region: "California", description: "Find public and business restrooms in Glendale, California, with community verification, ratings, access details, and directions.", bounds: { west: -118.33, south: 34.11, east: -118.18, north: 34.29 } },
  { slug: "los-angeles-ca", name: "Los Angeles", region: "California", description: "Browse public restrooms across Los Angeles with hours, accessibility details, ratings, and community updates.", bounds: { west: -118.67, south: 33.70, east: -118.15, north: 34.34 } },
  { slug: "new-york-ny", name: "New York City", region: "New York", description: "Find public restrooms throughout New York City with directions, access information, and community ratings.", bounds: { west: -74.26, south: 40.49, east: -73.68, north: 40.92 } },
  { slug: "san-francisco-ca", name: "San Francisco", region: "California", description: "Find public restrooms in San Francisco with useful access and community information.", bounds: { west: -122.53, south: 37.70, east: -122.35, north: 37.84 } },
  { slug: "san-diego-ca", name: "San Diego", region: "California", description: "Find public restrooms in San Diego with ratings, directions, and access details.", bounds: { west: -117.29, south: 32.53, east: -116.90, north: 33.10 } },
  { slug: "chicago-il", name: "Chicago", region: "Illinois", description: "Browse public restrooms in Chicago and see community-supplied access information.", bounds: { west: -87.94, south: 41.64, east: -87.52, north: 42.03 } },
  { slug: "london-uk", name: "London", region: "United Kingdom", description: "Find public toilets in London with directions, accessibility details, and ratings.", bounds: { west: -0.51, south: 51.28, east: 0.34, north: 51.69 } },
  { slug: "paris-fr", name: "Paris", region: "France", description: "Find public toilets in Paris with useful directions and community details.", bounds: { west: 2.22, south: 48.81, east: 2.47, north: 48.91 } },
];

const restroomColumns = "id,status,name,address,description,directions,hours,hours_schedule_status,weekly_hours,timezone,latitude,longitude,access_code,access_instructions,cover_photo_url,features,rating,cleanliness_rating,review_count,data_source,source_url,community_verified_at,community_verification_count,community_not_found_count,created_at,updated_at";
const businessColumns = "id,restroom_id,business_name,description,profile_image_url,cover_image_url,website_url,public_email,phone,instagram_url,facebook_url,tiktok_url,promotion_headline,promotion_offer_text,promotion_code,verified_at,updated_at";

export const getPublicRestroom = cache(async (id: string) => {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("restrooms").select(restroomColumns).eq("id", id).eq("status", "published").maybeSingle();
  if (error) throw error;
  return data as PublicRestroom | null;
});

export async function getRestroomListing(id: string, viewerUserId?: string | null) {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin.from("restrooms").select(restroomColumns).eq("id", id).maybeSingle();
  if (error) throw error;
  const restroom = data as PublicRestroom | null;
  if (!restroom) return null;
  if (restroom.status === "published") return restroom;
  if (restroom.status !== "pending") return null;

  const now = new Date().toISOString();
  const { data: campaigns, error: campaignError } = await admin
    .from("advertising_campaigns")
    .select("created_by,is_test")
    .eq("restroom_id", id)
    .eq("status", "active")
    .is("deleted_at", null)
    .lte("starts_at", now)
    .gt("ends_at", now);
  if (campaignError) throw campaignError;

  const viewable = (campaigns || []).some((campaign) =>
    !campaign.is_test || Boolean(viewerUserId && campaign.created_by === viewerUserId)
  );
  return viewable ? restroom : null;
}

export const getBusinessForRestroom = cache(async (restroomId: string) => {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("business_profiles").select(businessColumns).eq("restroom_id", restroomId).eq("status", "verified").maybeSingle();
  if (error?.code === "42P01") return null;
  if (error) throw error;
  return data as PublicBusinessProfile | null;
});

export const getPublicBusiness = cache(async (id: string) => {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("business_profiles").select(businessColumns).eq("id", id).eq("status", "verified").maybeSingle();
  if (error?.code === "42P01") return null;
  if (error) throw error;
  return data as PublicBusinessProfile | null;
});

export const getPublicReviews = cache(async (restroomId: string) => {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.from("reviews").select("id,overall_rating,cleanliness_rating,note,created_at").eq("restroom_id", restroomId).eq("status", "published").order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return (data || []) as PublicReview[];
});

export async function getCityRestrooms(city: CityDirectory, limit = 200) {
  const admin = createAdminClient();
  if (!admin) return [];
  const { west, south, east, north } = city.bounds;
  const { data, error } = await admin.from("restrooms").select(restroomColumns)
    .eq("status", "published")
    .gte("latitude", south).lte("latitude", north)
    .gte("longitude", west).lte("longitude", east)
    .order("community_verified_at", { ascending: false, nullsFirst: false })
    .order("rating", { ascending: false })
    .limit(Math.min(limit, 500));
  if (error) throw error;
  return (data || []) as PublicRestroom[];
}

export async function getDirectoryRestrooms(limit = 120) {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.from("restrooms").select(restroomColumns).eq("status", "published")
    .order("community_verified_at", { ascending: false, nullsFirst: false })
    .order("rating", { ascending: false }).limit(Math.min(limit, 500));
  if (error) throw error;
  return (data || []) as PublicRestroom[];
}

export function cityBySlug(slug: string) {
  return DIRECTORY_CITIES.find((city) => city.slug === slug) || null;
}
