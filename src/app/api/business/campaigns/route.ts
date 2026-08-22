import { NextResponse } from "next/server";
import {
  CampaignLifecycleError,
  changeCampaignLifecycle,
  type CampaignLifecycleAction,
} from "@/lib/server/campaign-lifecycle";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) {
    return NextResponse.json({ error: "Sign in to manage this campaign." }, { status: 401 });
  }

  const limit = await consumeRateLimit(request, {
    bucket: "business-campaign-lifecycle",
    limit: 30,
    windowSeconds: 60 * 60,
    identifier: data.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { action?: unknown; campaignId?: unknown } | null;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const action = body?.action === "stop" || body?.action === "delete" ? body.action as CampaignLifecycleAction : null;
  if (!UUID_PATTERN.test(campaignId) || !action) {
    return NextResponse.json({ error: "Invalid campaign action." }, { status: 400 });
  }

  try {
    const result = await changeCampaignLifecycle({
      action,
      actorId: data.user.id,
      campaignId,
      ownerId: data.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Campaign lifecycle action failed", {
      action,
      campaignId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    if (error instanceof CampaignLifecycleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The campaign could not be updated. Please try again." }, { status: 500 });
  }
}
