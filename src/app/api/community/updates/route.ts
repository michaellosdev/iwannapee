import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { formatHoursSchedule, InvalidHoursSchedule, normalizeHoursSchedule } from "@/lib/hours";
import { timeZoneAt } from "@/lib/server/timezone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const updateTypes = new Set(["hours", "code", "access", "directions", "description"]);

class InvalidSuggestion extends Error {}

function suggestionText(value: unknown, label: string, minimum: number, maximum: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum) throw new InvalidSuggestion(`${label} is required.`);
  if (result.length > maximum) throw new InvalidSuggestion(`${label} is too long.`);
  return result;
}

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user) return Response.json({ error: "Sign in before suggesting restroom details." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "restroom-detail-suggestion",
    limit: 12,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    restroomId?: unknown;
    type?: unknown;
    value?: unknown;
    hoursSchedule?: unknown;
  } | null;
  const restroomId = typeof body?.restroomId === "string" ? body.restroomId : "";
  const updateType = typeof body?.type === "string" && updateTypes.has(body.type) ? body.type : "";
  if (!uuidPattern.test(restroomId) || !updateType) {
    return Response.json({ error: "Choose a valid restroom detail." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Community suggestions are unavailable." }, { status: 503 });
  const { data: restroom } = await admin
    .from("restrooms")
    .select("id,status,latitude,longitude,hours,access_code,access_instructions,directions,description")
    .eq("id", restroomId)
    .maybeSingle();
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
    return Response.json({ error: "This restroom is not accepting detail suggestions." }, { status: 404 });
  }

  try {
    let proposedValue = "";
    let proposedPayload: Record<string, unknown> | null = null;
    if (updateType === "hours") {
      let schedule;
      try {
        schedule = normalizeHoursSchedule(body?.hoursSchedule, false);
      } catch (error) {
        if (error instanceof InvalidHoursSchedule) throw new InvalidSuggestion(error.message);
        throw error;
      }
      proposedValue = formatHoursSchedule(schedule);
      proposedPayload = {
        hoursSchedule: schedule,
        timezone: schedule.mode === "scheduled" ? timeZoneAt(restroom.latitude, restroom.longitude) : null,
      };
    } else if (updateType === "code") {
      proposedValue = suggestionText(body?.value, "Access code", 1, 40);
    } else if (updateType === "access") {
      proposedValue = suggestionText(body?.value, "Access details", 2, 500);
    } else if (updateType === "directions") {
      proposedValue = suggestionText(body?.value, "Directions", 2, 500);
    } else {
      proposedValue = suggestionText(body?.value, "Description", 2, 1000);
    }

    const currentValue = updateType === "code" ? restroom.access_code
      : updateType === "access" ? restroom.access_instructions
      : updateType === "directions" ? restroom.directions
      : updateType === "description" ? restroom.description
      : restroom.hours;
    if (typeof currentValue === "string" && currentValue.trim().toLowerCase() === proposedValue.toLowerCase()) {
      throw new InvalidSuggestion("That information is already listed for this restroom.");
    }

    const { data: existing } = await admin
      .from("restroom_updates")
      .select("id")
      .eq("restroom_id", restroomId)
      .eq("user_id", authData.user.id)
      .eq("update_type", updateType)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (existing) throw new InvalidSuggestion("You already have a pending suggestion for this detail.");

    const { data: suggestion, error } = await admin.from("restroom_updates").insert({
      restroom_id: restroomId,
      user_id: authData.user.id,
      update_type: updateType,
      proposed_value: proposedValue,
      proposed_payload: proposedPayload,
      status: "pending",
    }).select("id").single();
    if (error || !suggestion) throw error || new Error("Suggestion was not returned");
    return Response.json({ submitted: true, suggestionId: suggestion.id });
  } catch (error) {
    if (error instanceof InvalidSuggestion) return Response.json({ error: error.message }, { status: 400 });
    console.error("Restroom detail suggestion failed", { error: error instanceof Error ? error.message : "Unknown error" });
    return Response.json({ error: "We couldn’t save this suggestion." }, { status: 500 });
  }
}
