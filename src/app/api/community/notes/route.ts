import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user) return Response.json({ error: "Sign in before adding a community note." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "community-note-create",
    limit: 20,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    restroomId?: unknown;
    parentId?: unknown;
    body?: unknown;
  } | null;
  const restroomId = typeof body?.restroomId === "string" ? body.restroomId : "";
  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;
  const noteBody = typeof body?.body === "string" ? body.body.trim() : "";
  if (!uuidPattern.test(restroomId)
    || (parentId !== null && !uuidPattern.test(parentId))
    || noteBody.length < 2
    || noteBody.length > 600) {
    return Response.json({ error: "Community notes must contain 2–600 characters." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Community notes are unavailable." }, { status: 503 });
  const { data: restroom } = await admin.from("restrooms").select("id,status").eq("id", restroomId).maybeSingle();
  let contributionAllowed = restroom?.status === "published";
  if (restroom && !contributionAllowed) {
    const now = new Date().toISOString();
    const { data: promotions } = await admin
      .from("advertising_campaigns")
      .select("id,is_test,created_by")
      .eq("restroom_id", restroomId)
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now);
    contributionAllowed = Boolean((promotions || []).some((promotion) => !promotion.is_test || promotion.created_by === authData.user.id));
  }
  if (!restroom || !contributionAllowed) {
    return Response.json({ error: "This restroom is not accepting community notes." }, { status: 404 });
  }

  if (parentId) {
    const { data: parent } = await admin
      .from("community_notes")
      .select("id,restroom_id,parent_id,status")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.restroom_id !== restroomId || parent.parent_id || parent.status !== "published") {
      return Response.json({ error: "That conversation is no longer available for replies." }, { status: 400 });
    }
  }

  const { data: note, error } = await admin.from("community_notes").insert({
    restroom_id: restroomId,
    user_id: authData.user.id,
    parent_id: parentId,
    body: noteBody,
    status: "published",
  }).select("id").single();
  if (error || !note) {
    console.error("Community note submission failed", { error: error?.message || "Note was not returned" });
    return Response.json({ error: "We couldn’t post this community note." }, { status: 500 });
  }

  return Response.json({ submitted: true, noteId: note.id });
}
