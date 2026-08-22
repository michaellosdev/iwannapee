import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@/components/google-analytics";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Find Public Restrooms Near You`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/brand/iwannapee-mark.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/brand/iwannapee-mark.png", sizes: "512x512", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: googleSiteVerification ? { google: googleSiteVerification } : undefined,
  openGraph: {
    title: `${SITE_NAME} — Find Public Restrooms Near You`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Find Public Restrooms Near You`,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f2e8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <GoogleAnalytics measurementId={process.env.NEXT_PUBLIC_GA4_ID} />
      </body>
    </html>
  );
}
