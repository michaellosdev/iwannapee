import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user) return Response.json({ error: "Sign in before voting on a community note." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "community-note-vote",
    limit: 180,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { noteId?: unknown; value?: unknown } | null;
  const noteId = typeof body?.noteId === "string" ? body.noteId : "";
  const value = Number(body?.value);
  if (!uuidPattern.test(noteId) || ![-1, 0, 1].includes(value)) {
    return Response.json({ error: "Choose a valid community-note vote." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Community-note voting is unavailable." }, { status: 503 });
  const { data: note } = await admin.from("community_notes").select("id,status").eq("id", noteId).maybeSingle();
  if (!note || note.status !== "published") {
    return Response.json({ error: "This community note is no longer available." }, { status: 404 });
  }

  const mutation = value === 0
    ? admin.from("community_note_votes").delete().eq("note_id", noteId).eq("user_id", authData.user.id)
    : admin.from("community_note_votes").upsert({
        note_id: noteId,
        user_id: authData.user.id,
        value,
        updated_at: new Date().toISOString(),
      }, { onConflict: "note_id,user_id" });
  const { error } = await mutation;
  if (error) return Response.json({ error: "We couldn’t save this vote." }, { status: 500 });

  const { data: refreshed } = await admin
    .from("community_notes")
    .select("upvote_count,downvote_count")
    .eq("id", noteId)
    .single();
  return Response.json({
    saved: true,
    userVote: value,
    upvotes: refreshed?.upvote_count || 0,
    downvotes: refreshed?.downvote_count || 0,
  });
}
