import { createClient } from "@/lib/supabase/client";

const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumPhotoBytes = 8 * 1024 * 1024;

export class PhotoUploadError extends Error {}

export function validatePhotoFiles(files: File[], maximum: number) {
  if (files.length > maximum) throw new PhotoUploadError(`Choose no more than ${maximum} photos.`);
  for (const file of files) {
    if (!allowedPhotoTypes.has(file.type) || file.size < 1 || file.size > maximumPhotoBytes) {
      throw new PhotoUploadError("Use JPG, PNG, or WebP photos up to 8 MB each.");
    }
  }
  return files;
}

export async function uploadPhoto(file: File) {
  validatePhotoFiles([file], 1);
  const supabase = createClient();
  if (!supabase) throw new PhotoUploadError("Photo storage is not connected.");

  const signedResponse = await fetch("/api/storage/restroom-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  const signed = (await signedResponse.json()) as { path?: string; token?: string; error?: string };
  if (!signedResponse.ok || !signed.path || !signed.token) {
    throw new PhotoUploadError(signed.error || "Photo upload could not start.");
  }

  const { error } = await supabase.storage
    .from("restroom-photos")
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
  if (error) throw new PhotoUploadError(`Photo upload failed: ${error.message}`);
  return signed.path;
}

export async function uploadPhotos(files: File[], maximum: number) {
  validatePhotoFiles(files, maximum);
  const paths: string[] = [];
  for (const file of files) paths.push(await uploadPhoto(file));
  return paths;
}
