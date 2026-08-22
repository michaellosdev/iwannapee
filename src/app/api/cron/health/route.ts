import * as Sentry from "@sentry/nextjs";
import { runHealthChecks } from "@/lib/monitoring/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const monitorSlug = "iwannapee-production-health";
const schedule = "13 8 * * *";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const checkInId = Sentry.captureCheckIn(
    { monitorSlug, status: "in_progress" },
    {
      schedule: { type: "crontab", value: schedule },
      checkinMargin: 60,
      maxRuntime: 5,
      timezone: "UTC",
      failureIssueThreshold: 1,
      recoveryThreshold: 1,
    },
  );
  const result = await runHealthChecks();
  const duration = (Date.now() - startedAt) / 1000;

  if (!result.ok) {
    Sentry.captureMessage("IWANNAPEE production health check failed", { level: "error" });
    Sentry.captureCheckIn({ monitorSlug, checkInId, status: "error", duration });
    await Sentry.flush(2_000);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  Sentry.captureCheckIn({ monitorSlug, checkInId, status: "ok", duration });
  await Sentry.flush(2_000);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
