import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const CAPTCHA_COOKIE = "iwp_human";
const CAPTCHA_SESSION_SECONDS = 30 * 60;
const CAPTCHA_ACTION = "protected_action";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

function signingSecret() {
  return process.env.CAPTCHA_SESSION_SECRET?.trim()
    || process.env.RATE_LIMIT_SECRET?.trim();
}

function configuredHostname() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "").hostname;
  } catch {
    return "";
  }
}

function parseCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const pair of cookieHeader.split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function captchaConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
    && process.env.TURNSTILE_SECRET_KEY?.trim()
    && signingSecret(),
  );
}

export function captchaSessionCookie() {
  const secret = signingSecret();
  if (!secret) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + CAPTCHA_SESSION_SECONDS;
  const payload = `${expiresAt}`;
  return {
    name: CAPTCHA_COOKIE,
    value: `${payload}.${signature(payload, secret)}`,
    maxAge: CAPTCHA_SESSION_SECONDS,
  };
}

export function hasCaptchaSession(request: Request) {
  if (!captchaConfigured()) return process.env.NODE_ENV !== "production";
  const secret = signingSecret();
  const value = parseCookie(request, CAPTCHA_COOKIE);
  if (!secret || !value) return false;

  const [expiresAtValue, suppliedSignature] = value.split(".");
  const expiresAt = Number(expiresAtValue);
  if (!expiresAtValue || !suppliedSignature || !Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) return false;

  const expected = Buffer.from(signature(expiresAtValue, secret));
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function verifyCaptchaToken(token: string, request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!captchaConfigured() || !secret) {
    return { success: process.env.NODE_ENV !== "production", error: "CAPTCHA is not configured." };
  }
  if (!token) return { success: false, error: "Complete the human verification." };

  const formData = new FormData();
  formData.set("secret", secret);
  formData.set("response", token);
  const remoteIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (remoteIp) formData.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const result = (await response.json()) as TurnstileResponse;
    const expectedHostname = configuredHostname();
    const actionMatches = result.action === CAPTCHA_ACTION;
    const hostnameMatches = !expectedHostname
      || expectedHostname === "localhost"
      || result.hostname === expectedHostname
      || result.hostname === expectedHostname.replace(/^www\./, "");
    if (!response.ok || !result.success || !hostnameMatches || !actionMatches) {
      console.warn("Turnstile verification rejected", {
        hostnameMatches,
        actionMatches,
        errors: result["error-codes"] || [],
      });
      return { success: false, error: "Human verification failed. Please try again." };
    }
    return { success: true, error: "" };
  } catch {
    return { success: false, error: "Human verification is temporarily unavailable." };
  }
}

export function captchaRequiredResponse() {
  return Response.json(
    { error: "Complete the human verification before continuing.", code: "captcha_required" },
    { status: 403 },
  );
}
