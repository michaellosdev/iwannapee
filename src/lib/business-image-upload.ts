import { createClient } from "@/lib/supabase/client";

export async function uploadBusinessImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024) throw new Error("Use a JPG, PNG, or WebP image up to 8 MB.");
  const response = await fetch("/api/storage/business-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: file.type, size: file.size }) });
  const signed = (await response.json()) as { path?: string; token?: string; error?: string };
  if (!response.ok || !signed.path || !signed.token) throw new Error(signed.error || "The upload could not start.");
  const supabase = createClient();
  if (!supabase) throw new Error("Image storage is not connected.");
  const { error } = await supabase.storage.from("business-creatives").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return signed.path;
}
