import { NextResponse } from "next/server";
import {
  captchaConfigured,
  captchaSessionCookie,
  hasCaptchaSession,
  verifyCaptchaToken,
} from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export async function GET(request: Request) {
  return NextResponse.json({
    configured: captchaConfigured(),
    verified: hasCaptchaSession(request),
  });
}

export async function POST(request: Request) {
  const limit = await consumeRateLimit(request, {
    bucket: "captcha",
    limit: 20,
    windowSeconds: 600,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const result = await verifyCaptchaToken(typeof body?.token === "string" ? body.token : "", request);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

  const cookie = captchaSessionCookie();
  if (!cookie) return NextResponse.json({ error: "CAPTCHA session security is not configured." }, { status: 503 });
  const response = NextResponse.json({ verified: true });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: cookie.maxAge,
  });
  return response;
}

