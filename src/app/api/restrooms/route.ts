import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { formatHoursSchedule, InvalidHoursSchedule, normalizeHoursSchedule } from "@/lib/hours";
import { timeZoneAt } from "@/lib/server/timezone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const allowedFeatures = new Set([
  "Accessible",
  "Baby changing",
  "Gender neutral",
  "Free",
  "Single stall",
  "Code available",
]);

class InvalidSubmission extends Error {}

function text(value: unknown, label: string, min: number, max: number, required = true) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && result.length < min) throw new InvalidSubmission(`${label} is required.`);
  if (result.length > max) throw new InvalidSubmission(`${label} is too long.`);
  return result;
}

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user) return Response.json({ error: "Sign in before adding a restroom." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "restroom-submit",
    limit: 10,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Restroom submissions are not configured." }, { status: 503 });
  let uploadedPath: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new InvalidSubmission("Choose a valid map location.");
    }
    let hoursSchedule;
    try {
      hoursSchedule = normalizeHoursSchedule(body.hoursSchedule, true);
    } catch (error) {
      if (error instanceof InvalidHoursSchedule) throw new InvalidSubmission(error.message);
      throw error;
    }
    const timezone = hoursSchedule.mode === "scheduled" ? timeZoneAt(latitude, longitude) : null;

    const features = Array.isArray(body.features)
      ? Array.from(new Set(body.features.filter((feature): feature is string => typeof feature === "string" && allowedFeatures.has(feature))))
      : [];
    const accessCode = text(body.accessCode, "Access code", 0, 40, false);
    if (accessCode && !features.includes("Code available")) features.push("Code available");

    const candidatePath = typeof body.coverPhotoStoragePath === "string" ? body.coverPhotoStoragePath : "";
    if (candidatePath) {
      const prefix = `${authData.user.id}/`;
      const fileName = candidatePath.slice(prefix.length);
      if (!candidatePath.startsWith(prefix) || !/^[0-9a-f-]+\.(jpg|png|webp)$/.test(fileName)) {
        throw new InvalidSubmission("The uploaded photo is invalid.");
      }
      const { data: objects, error: storageError } = await admin.storage
        .from("restroom-photos")
        .list(authData.user.id, { limit: 1, search: fileName });
      if (storageError || !objects?.some((object) => object.name === fileName)) {
        throw new InvalidSubmission("Finish uploading the photo before submitting.");
      }
      uploadedPath = candidatePath;
    }

    const coverPhotoUrl = uploadedPath
      ? admin.storage.from("restroom-photos").getPublicUrl(uploadedPath).data.publicUrl
      : null;
    const { data: createdRestroom, error } = await admin.from("restrooms").insert({
      name: text(body.name, "Name", 2, 120),
      address: text(body.address, "Address", 5, 240),
      latitude,
      longitude,
      hours: formatHoursSchedule(hoursSchedule),
      hours_schedule_status: hoursSchedule.mode,
      timezone,
      weekly_hours: hoursSchedule.periods,
      is_open_now: null,
      directions: text(body.directions, "Directions", 2, 500),
      access_code: accessCode || null,
      access_instructions: text(body.accessInstructions, "Access note", 0, 500, false) || null,
      cover_photo_url: coverPhotoUrl,
      cover_photo_storage_path: uploadedPath,
      features,
      created_by: authData.user.id,
      status: "pending",
    }).select("id").single();
    if (error || !createdRestroom) throw error || new Error("Restroom was not created");
    return Response.json({ submitted: true });
  } catch (error) {
    if (uploadedPath) await admin.storage.from("restroom-photos").remove([uploadedPath]).catch(() => undefined);
    if (error instanceof InvalidSubmission) return Response.json({ error: error.message }, { status: 400 });
    console.error("Restroom submission failed", { error: error instanceof Error ? error.message : "Unknown error" });
    return Response.json({ error: "We couldn’t save the restroom. Please try again." }, { status: 500 });
  }
}
