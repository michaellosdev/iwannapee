type SentryEventLike = {
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    headers?: unknown;
  };
  user?: unknown;
};

type SentryBreadcrumbLike = {
  data?: Record<string, unknown>;
};

export function sanitizeObservedUrl(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split("?")[0]?.split("#")[0] || "";
  }
}

export function scrubSentryEvent<T extends SentryEventLike>(event: T) {
  event.user = undefined;
  if (event.request) {
    event.request.url = sanitizeObservedUrl(event.request.url) as string | undefined;
    event.request.data = undefined;
    event.request.cookies = undefined;
    event.request.headers = undefined;
  }
  return event;
}

export function scrubSentryBreadcrumb<T extends SentryBreadcrumbLike>(breadcrumb: T) {
  if (!breadcrumb.data) return breadcrumb;
  for (const key of ["url", "from", "to"]) {
    if (key in breadcrumb.data) breadcrumb.data[key] = sanitizeObservedUrl(breadcrumb.data[key]);
  }
  for (const key of ["body", "data", "request_body", "response_body"]) delete breadcrumb.data[key];
  return breadcrumb;
}

export function sentryTraceSampleRate() {
  const configured = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.05");
  return Number.isFinite(configured) ? Math.max(0, Math.min(configured, 1)) : 0.05;
}
