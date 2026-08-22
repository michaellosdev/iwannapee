import { runHealthChecks } from "@/lib/monitoring/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await runHealthChecks();
  return Response.json(
    {
      status: result.ok ? "ok" : "degraded",
      checks: {
        database: result.database,
        storage: result.storage,
        payments: result.payments,
      },
      checkedAt: result.checkedAt,
      durationMs: result.durationMs,
    },
    {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
