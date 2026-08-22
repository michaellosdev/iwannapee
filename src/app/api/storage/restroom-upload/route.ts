import { randomUUID } from "node:crypto";
import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user) return Response.json({ error: "Sign in before uploading a photo." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "restroom-photo",
    limit: 12,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { contentType?: unknown; size?: unknown } | null;
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const size = Number(body?.size);
  const extension = allowedTypes.get(contentType);
  if (!extension || !Number.isFinite(size) || size < 1 || size > 8 * 1024 * 1024) {
    return Response.json({ error: "Use a JPG, PNG, or WebP image up to 8 MB." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Photo storage is not configured." }, { status: 503 });
  const path = `${authData.user.id}/${randomUUID()}.${extension}`;
  const { data, error } = await admin.storage.from("restroom-photos").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("Signed photo upload creation failed", { error: error?.message });
    return Response.json({ error: "Photo upload is temporarily unavailable." }, { status: 502 });
  }

  return Response.json({ path, token: data.token });
}
