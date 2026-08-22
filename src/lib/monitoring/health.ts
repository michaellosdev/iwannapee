import { createAdminClient } from "@/lib/supabase/admin";

export type HealthCheckResult = {
  ok: boolean;
  database: boolean;
  storage: boolean;
  checkedAt: string;
  durationMs: number;
};

export async function runHealthChecks(): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, database: false, storage: false, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt };
  }

  const [databaseResult, storageResult] = await Promise.allSettled([
    admin.from("restrooms").select("id").limit(1),
    admin.storage.getBucket("restroom-photos"),
  ]);
  const database = databaseResult.status === "fulfilled" && !databaseResult.value.error;
  const storage = storageResult.status === "fulfilled" && !storageResult.value.error;

  return {
    ok: database && storage,
    database,
    storage,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}
