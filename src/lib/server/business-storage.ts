import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const filePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export class InvalidBusinessImage extends Error {}

function validSignature(bytes: Uint8Array, extension: string) {
  if (extension === "jpg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === "png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return extension === "webp" && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export async function verifyBusinessImage(admin: SupabaseClient, userId: string, value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const prefix = `${userId}/`;
  const fileName = value.slice(prefix.length);
  if (!value.startsWith(prefix) || !filePattern.test(fileName)) throw new InvalidBusinessImage("The uploaded business image is invalid.");
  const extension = fileName.split(".").at(-1)?.toLowerCase() || "";
  const { data, error } = await admin.storage.from("business-creatives").download(value);
  if (error || !data) throw new InvalidBusinessImage("Finish uploading the business image before saving.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length < 32 || bytes.length > 8 * 1024 * 1024 || !validSignature(bytes, extension)) {
    await admin.storage.from("business-creatives").remove([value]);
    throw new InvalidBusinessImage("Use a valid JPG, PNG, or WebP image up to 8 MB.");
  }
  return { path: value, publicUrl: admin.storage.from("business-creatives").getPublicUrl(value).data.publicUrl };
}
