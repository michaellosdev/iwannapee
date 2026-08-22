import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user) return Response.json({ error: "Sign in before voting on a suggestion." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "restroom-detail-vote",
    limit: 180,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { suggestionId?: unknown; value?: unknown } | null;
  const suggestionId = typeof body?.suggestionId === "string" ? body.suggestionId : "";
  const value = Number(body?.value);
  if (!uuidPattern.test(suggestionId) || ![-1, 0, 1].includes(value)) {
    return Response.json({ error: "Choose a valid suggestion vote." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Suggestion voting is unavailable." }, { status: 503 });
  const { data: suggestion } = await admin
    .from("restroom_updates")
    .select("id,user_id,status")
    .eq("id", suggestionId)
    .maybeSingle();
  if (!suggestion || suggestion.status !== "pending") {
    return Response.json({ error: "This suggestion is no longer available." }, { status: 404 });
  }
  if (suggestion.user_id === authData.user.id) {
    return Response.json({ error: "Other community members vote on your suggestion." }, { status: 400 });
  }

  const mutation = value === 0
    ? admin.from("restroom_update_votes").delete().eq("update_id", suggestionId).eq("user_id", authData.user.id)
    : admin.from("restroom_update_votes").upsert({
        update_id: suggestionId,
        user_id: authData.user.id,
        value,
        updated_at: new Date().toISOString(),
      }, { onConflict: "update_id,user_id" });
  const { error } = await mutation;
  if (error) return Response.json({ error: "We couldn’t save this vote." }, { status: 500 });

  const { data: refreshed } = await admin
    .from("restroom_updates")
    .select("upvote_count,downvote_count")
    .eq("id", suggestionId)
    .single();
  return Response.json({
    saved: true,
    userVote: value,
    upvotes: refreshed?.upvote_count || 0,
    downvotes: refreshed?.downvote_count || 0,
  });
}
