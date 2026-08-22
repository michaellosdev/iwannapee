const baseUrl = (process.argv[2] || "https://www.iwannapee.lol").replace(/\/$/, "");
const failures = [];

async function fetchRoute(pathname, expectedContentType) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { "user-agent": "iwannapee-production-smoke/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();

  if (!response.ok) failures.push(`${pathname} returned HTTP ${response.status}.`);
  if (response.ok && expectedContentType && !response.headers.get("content-type")?.includes(expectedContentType)) {
    failures.push(`${pathname} did not return ${expectedContentType}.`);
  }

  return { response, body };
}

try {
  const homepage = await fetchRoute("/", "text/html");
  const requiredHeaders = {
    "content-security-policy": "default-src",
    "permissions-policy": "geolocation=(self)",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };

  for (const [name, expected] of Object.entries(requiredHeaders)) {
    if (!homepage.response.headers.get(name)?.includes(expected)) {
      failures.push(`Homepage is missing the expected ${name} policy.`);
    }
  }

  if (!homepage.body.includes('<link rel="canonical" href="https://www.iwannapee.lol"')) {
    failures.push("Homepage canonical URL is missing or unexpected.");
  }

  const robots = await fetchRoute("/robots.txt", "text/plain");
  if (!robots.body.includes("Sitemap: https://www.iwannapee.lol/sitemap.xml")) {
    failures.push("robots.txt does not advertise the canonical sitemap URL.");
  }

  const sitemap = await fetchRoute("/sitemap.xml", "application/xml");
  if (
    !sitemap.body.includes("<loc>https://www.iwannapee.lol</loc>") &&
    !sitemap.body.includes("<loc>https://www.iwannapee.lol/</loc>")
  ) {
    failures.push("sitemap.xml does not contain the canonical homepage.");
  }

  const health = await fetchRoute("/api/health", "application/json");
  if (health.response.ok) {
    try {
      const parsed = JSON.parse(health.body);
      if (parsed.status !== "ok") failures.push("Health response status is not ok.");
    } catch {
      failures.push("Health response is not valid JSON.");
    }
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  console.error(`Production smoke test failed with ${failures.length} error(s).`);
  process.exit(1);
}

console.log(`Production smoke test passed for ${baseUrl}.`);
