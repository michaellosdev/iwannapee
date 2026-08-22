import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDevelopment = process.env.NODE_ENV === "development";

function urlOrigin(value?: string) {
  if (!value) return null;
  try {
    const normalized = value.replace(/\{[^}]+\}/g, "a");
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

const tileOrigin = urlOrigin(process.env.NEXT_PUBLIC_MAP_TILE_URL || (isDevelopment ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : undefined));
const supabaseOrigin = urlOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const extraImageSources = [tileOrigin, supabaseOrigin].filter((value): value is string => Boolean(value));
const extraConnectSources = [supabaseOrigin].filter((value): value is string => Boolean(value));

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://www.google-analytics.com https://*.supabase.co ${extraImageSources.join(" ")}`,
  "font-src 'self' data:",
  `connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://*.google-analytics.com https://challenges.cloudflare.com https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io ${extraConnectSources.join(" ")}`,
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(), browsing-topics=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      disableLogger: true,
    })
  : nextConfig;
