export type PromotionActivityType = "impression" | "detail_open" | "promo_copy" | "qr_copy" | "website_click";

export function createPromotionViewId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function recordPromotionActivity(viewId: string, campaignId: string, eventType: PromotionActivityType) {
  void fetch("/api/business/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId, eventType, viewId }),
    keepalive: true,
  }).catch(() => undefined);
}
