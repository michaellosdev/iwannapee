import { randomUUID } from "node:crypto";
import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!data.user) return Response.json({ error: "Sign in before uploading an image." }, { status: 401 });
  const limit = await consumeRateLimit(request, { bucket: "business-image", limit: 10, windowSeconds: 60 * 60, identifier: data.user.id, includeAddress: false });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Business image storage is not configured." }, { status: 503 });
  const { data: profile } = await admin.from("business_profiles").select("id").eq("owner_user_id", data.user.id).eq("status", "verified").limit(1).maybeSingle();
  if (!profile) return Response.json({ error: "A verified business profile is required before uploading." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { contentType?: unknown; size?: unknown } | null;
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const size = Number(body?.size);
  const extension = allowedTypes.get(contentType);
  if (!extension || !Number.isFinite(size) || size < 1 || size > 8 * 1024 * 1024) return Response.json({ error: "Use a JPG, PNG, or WebP image up to 8 MB." }, { status: 400 });
  const path = `${data.user.id}/${randomUUID()}.${extension}`;
  const { data: signed, error } = await admin.storage.from("business-creatives").createSignedUploadUrl(path);
  if (error || !signed) return Response.json({ error: "Business image upload is temporarily unavailable." }, { status: 502 });
  return Response.json({ path, token: signed.token });
}
