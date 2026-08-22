import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_EMAIL } from "@/lib/site";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalUrl(value: unknown) {
  const candidate = text(value, 500);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user?.email) return Response.json({ error: "Sign in before claiming a business." }, { status: 401 });
  const limit = await consumeRateLimit(request, { bucket: "business-claim", limit: 5, windowSeconds: 24 * 60 * 60, identifier: authData.user.id, includeAddress: false });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const restroomId = text(body?.restroomId, 36);
  const businessName = text(body?.businessName, 120);
  const claimantRole = text(body?.claimantRole, 80);
  const businessEmail = text(body?.businessEmail, 254).toLowerCase();
  const proofDetails = text(body?.proofDetails, 2000);
  const websiteUrl = optionalUrl(body?.websiteUrl);
  if (!uuidPattern.test(restroomId) || businessName.length < 2 || claimantRole.length < 2) {
    return Response.json({ error: "Add your business name and your role at the business." }, { status: 400 });
  }
  if (businessEmail && !/^\S+@\S+\.\S+$/.test(businessEmail)) return Response.json({ error: "Enter a valid business email." }, { status: 400 });
  if (text(body?.websiteUrl, 500) && !websiteUrl) return Response.json({ error: "Enter a valid business website URL." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Business claims are not configured." }, { status: 503 });
  const [{ data: restroom }, { data: existingProfile }, { data: existingClaim }] = await Promise.all([
    admin.from("restrooms").select("id,name").eq("id", restroomId).eq("status", "published").maybeSingle(),
    admin.from("business_profiles").select("id").eq("restroom_id", restroomId).eq("status", "verified").maybeSingle(),
    admin.from("business_claims").select("id,status").eq("restroom_id", restroomId).eq("claimant_user_id", authData.user.id).in("status", ["pending", "needs_info"]).maybeSingle(),
  ]);
  if (!restroom) return Response.json({ error: "This restroom listing is not available to claim." }, { status: 404 });
  if (existingProfile) return Response.json({ error: "This listing has already been claimed. Contact support if ownership changed." }, { status: 409 });
  if (existingClaim) return Response.json({ error: `You already have a ${existingClaim.status.replace("_", " ")} claim for this listing.`, claimId: existingClaim.id }, { status: 409 });

  const { data: claim, error } = await admin.from("business_claims").insert({
    restroom_id: restroomId,
    claimant_user_id: authData.user.id,
    business_name: businessName,
    claimant_role: claimantRole,
    contact_email: authData.user.email.toLowerCase(),
    business_email: businessEmail || null,
    website_url: websiteUrl,
    proof_details: proofDetails || null,
  }).select("id").single();
  if (error || !claim) {
    console.error("Business claim submission failed", { error: error?.message });
    return Response.json({ error: "Your claim could not be submitted. Please try again." }, { status: 500 });
  }
  const subject = encodeURIComponent(`Business claim proof ${claim.id}`);
  const emailBody = encodeURIComponent(`Claim ID: ${claim.id}\nBusiness: ${businessName}\nRestroom: ${restroom.name}\n\nPlease attach proof that you own or manage this business.`);
  return Response.json({ submitted: true, claimId: claim.id, proofEmailUrl: `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${emailBody}` });
}
