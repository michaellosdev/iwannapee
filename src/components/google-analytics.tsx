"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const CONSENT_STORAGE_KEY = "right2pee_analytics_consent";
const PRIVACY_SETTINGS_EVENT = "right2pee:open-privacy-settings";

type AnalyticsConsent = "accepted" | "declined" | "unknown";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function removeGoogleAnalyticsCookies() {
  const cookieNames = document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name?.startsWith("_ga")));
  const hostname = window.location.hostname;
  const registrableDomain = hostname.split(".").slice(-2).join(".");

  for (const name of cookieNames) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=.${hostname}; SameSite=Lax`;
    if (registrableDomain.includes(".")) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${registrableDomain}; SameSite=Lax`;
    }
  }
}

export function openPrivacySettings() {
  window.dispatchEvent(new Event(PRIVACY_SETTINGS_EVENT));
}

export function GoogleAnalytics({ measurementId }: { measurementId?: string }) {
  const [consent, setConsent] = useState<AnalyticsConsent>("unknown");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const storedConsent = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    const initialConsent: AnalyticsConsent = storedConsent === "accepted" || storedConsent === "declined"
      ? storedConsent
      : "unknown";
    const timeout = window.setTimeout(() => setConsent(initialConsent), 0);
    const openSettings = () => setSettingsOpen(true);
    window.addEventListener(PRIVACY_SETTINGS_EVENT, openSettings);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(PRIVACY_SETTINGS_EVENT, openSettings);
    };
  }, []);

  if (!measurementId) return null;

  function saveConsent(nextConsent: Exclude<AnalyticsConsent, "unknown">) {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, nextConsent);
    setConsent(nextConsent);
    setSettingsOpen(false);

    const consentValue = nextConsent === "accepted" ? "granted" : "denied";
    window.gtag?.("consent", "update", {
      ad_personalization: consentValue,
      ad_storage: consentValue,
      ad_user_data: consentValue,
      analytics_storage: consentValue,
    });

    if (nextConsent === "declined") removeGoogleAnalyticsCookies();
  }

  const showSettings = consent === "unknown" || settingsOpen;

  return (
    <>
      <Script id="right2pee-ga4-consent-default" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          var right2peeConsent = window.localStorage.getItem('${CONSENT_STORAGE_KEY}');
          var right2peeConsentValue = right2peeConsent === 'accepted' ? 'granted' : 'denied';
          gtag('consent', 'default', {
            ad_personalization: right2peeConsentValue,
            ad_storage: right2peeConsentValue,
            ad_user_data: right2peeConsentValue,
            analytics_storage: right2peeConsentValue
          });
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="right2pee-ga4" strategy="afterInteractive">
        {`
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>

      {showSettings && (
        <section className="privacy-banner" aria-label="Analytics privacy settings" role="dialog">
          <div className="privacy-banner-copy">
            <strong>Privacy and analytics</strong>
            <p>Google Analytics receives limited cookieless visit data so we can count visits. Accepting enables analytics and advertising cookies, user data, and personalization. Core site features still work if you decline.</p>
          </div>
          <div className="privacy-banner-actions">
            <button className="button button-primary" onClick={() => saveConsent("accepted")}>
              {consent === "accepted" ? "Keep all on" : "Accept all"}
            </button>
            <button className="privacy-decline-button" onClick={() => saveConsent("declined")}>
              {consent === "accepted" ? "Turn optional storage off" : "Continue without optional storage"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
