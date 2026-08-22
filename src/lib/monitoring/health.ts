import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";
import { stripeKeyIsLive } from "@/lib/stripe/promotion-checkout";

export type HealthCheckResult = {
  ok: boolean;
  database: boolean;
  storage: boolean;
  payments: boolean;
  checkedAt: string;
  durationMs: number;
};

export async function runHealthChecks(): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  const admin = createAdminClient();
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  const payments = stripeKeyIsLive(stripeSecret)
    && webhookSecret.startsWith("whsec_")
    && process.env.NEXT_PUBLIC_SITE_URL?.trim() === SITE_URL;
  if (!admin) {
    return { ok: false, database: false, storage: false, payments, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt };
  }

  const [databaseResult, storageResult] = await Promise.allSettled([
    admin.from("restrooms").select("id").limit(1),
    admin.storage.getBucket("restroom-photos"),
  ]);
  const database = databaseResult.status === "fulfilled" && !databaseResult.value.error;
  const storage = storageResult.status === "fulfilled" && !storageResult.value.error;

  return {
    ok: database && storage && payments,
    database,
    storage,
    payments,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}
