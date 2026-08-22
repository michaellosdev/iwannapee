import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { hasCaptchaSession, captchaRequiredResponse } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.slice(0, 500);
}

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const body = (await request.json().catch(() => null)) as { email?: unknown; returnTo?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const limit = await consumeRateLimit(request, {
    bucket: "magic-link",
    limit: 5,
    windowSeconds: 15 * 60,
    identifier: email,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Sign-in is not configured." }, { status: 503 });
  }

  const requestOrigin = new URL(request.url).origin;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || requestOrigin).replace(/\/$/, "");
  const callback = new URL("/auth/callback", siteUrl);
  callback.searchParams.set("next", safeReturnTo(body?.returnTo));
  const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString() },
  });
  if (error) {
    console.error("Magic-link request failed", { status: error.status, code: error.code });
    return Response.json({ error: "We couldn’t send the sign-in link. Please try again." }, { status: 502 });
  }

  return Response.json({ sent: true });
}

