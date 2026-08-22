import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@/components/google-analytics";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://iwannapee.lol"),
  title: "Right2Pee — Find a public restroom near you",
  description: "Community-verified public restrooms with access codes, directions, photos, accessibility details, and cleanliness ratings.",
  applicationName: "Right2Pee",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Right2Pee — Find a public restroom near you",
    description: "Find and rate public restrooms worldwide, including cleanliness, accessibility, access details, and directions.",
    siteName: "Right2Pee",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Right2Pee — Find a public restroom near you",
    description: "Find and rate public restrooms worldwide.",
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
