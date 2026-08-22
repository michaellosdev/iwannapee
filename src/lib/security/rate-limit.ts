import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type RateLimitOptions = {
  bucket: string;
  limit: number;
  windowSeconds: number;
  identifier?: string;
};

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
  current_count: number;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

function requestAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function rateLimitSecret() {
  return process.env.RATE_LIMIT_SECRET?.trim()
    || process.env.CAPTCHA_SESSION_SECRET?.trim()
    || process.env.SUPABASE_SECRET_KEY?.trim();
}

export async function consumeRateLimit(request: Request, options: RateLimitOptions): Promise<RateLimitResult | null> {
  const secret = rateLimitSecret();
  const admin = createAdminClient();
  if (!secret || !admin) return null;

  const rawIdentifier = [options.bucket, requestAddress(request), options.identifier || ""].join(":");
  const keyHash = createHash("sha256").update(`${secret}:${rawIdentifier}`).digest("hex");
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key_hash: keyHash,
    p_max_requests: options.limit,
    p_window_seconds: options.windowSeconds,
  });
  if (error) {
    console.error("Rate-limit check failed", { bucket: options.bucket, error: error.message });
    return null;
  }

  const row = (data?.[0] || null) as RateLimitRow | null;
  if (!row) return null;
  const resetAt = new Date(row.reset_at);
  return {
    allowed: row.allowed,
    count: Number(row.current_count),
    remaining: Number(row.remaining),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
  };
}

export function rateLimitResponse(result: RateLimitResult | null) {
  if (!result) {
    return Response.json(
      { error: "Request protection is temporarily unavailable." },
      { status: 503 },
    );
  }
  if (result.allowed) return null;
  return Response.json(
    { error: "Too many requests. Please wait before trying again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": result.resetAt.toISOString(),
      },
    },
  );
}

