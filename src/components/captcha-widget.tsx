"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function CaptchaWidget({ onVerified }: { onVerified: (verified: boolean) => void }) {
  const reactId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [status, setStatus] = useState<"checking" | "challenge" | "verifying" | "verified" | "error">("checking");
  const [message, setMessage] = useState("");
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const exchangeToken = useCallback(async (token: string) => {
    setStatus("verifying");
    try {
      const response = await fetch("/api/security/captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = (await response.json()) as { error?: string; verified?: boolean };
      if (!response.ok || !result.verified) throw new Error(result.error || "Verification failed.");
      setStatus("verified");
      setMessage("");
      onVerified(true);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Verification failed.");
      onVerified(false);
      if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
    }
  }, [onVerified]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/security/captcha", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { configured?: boolean; verified?: boolean }) => {
        if (cancelled) return;
        if (result.verified) {
          setStatus("verified");
          onVerified(true);
        } else if (!result.configured) {
          setStatus("error");
          setMessage("Human verification is not configured yet.");
          onVerified(false);
        } else {
          setStatus("challenge");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setMessage("Human verification is temporarily unavailable.");
          onVerified(false);
        }
      });
    return () => { cancelled = true; };
  }, [onVerified]);

  useEffect(() => {
    if (window.turnstile) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (status !== "challenge" || !scriptReady || !siteKey || !containerRef.current || !window.turnstile) return;
    if (widgetIdRef.current) window.turnstile.remove(widgetIdRef.current);
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: "protected_action",
      appearance: "interaction-only",
      size: "flexible",
      theme: "light",
      callback: exchangeToken,
      "expired-callback": () => onVerified(false),
      "error-callback": () => {
        setStatus("error");
        setMessage("Human verification could not load. Please retry.");
        onVerified(false);
      },
    });
    return () => {
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [exchangeToken, onVerified, scriptReady, siteKey, status]);

  return (
    <div className={`captcha-widget captcha-${status}`} id={`captcha-${reactId.replace(/:/g, "")}`}>
      <Script
        onLoad={() => setScriptReady(true)}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      {status === "verified" ? (
        <span><CheckCircle2 size={15} /> Human verification complete</span>
      ) : (
        <>
          <div ref={containerRef} />
          {(status === "checking" || status === "verifying") && <span><ShieldCheck size={15} /> Verifying securely…</span>}
          {status === "error" && <button onClick={() => window.location.reload()} type="button">{message} Retry</button>}
        </>
      )}
    </div>
  );
}

