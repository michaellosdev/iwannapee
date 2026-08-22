import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const maximumPhotoBytes = 8 * 1024 * 1024;
const storedFilePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export class InvalidStoredPhoto extends Error {}

function matchesImageSignature(bytes: Uint8Array, extension: string) {
  if (extension === "jpg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === "png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (extension === "webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function normalizePaths(value: unknown, maximum: number) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maximum) {
    throw new InvalidStoredPhoto(`Add no more than ${maximum} photos.`);
  }
  const paths = Array.from(new Set(value.filter((path): path is string => typeof path === "string")));
  if (paths.length !== value.length) throw new InvalidStoredPhoto("The uploaded photo list is invalid.");
  return paths;
}

export async function verifyUploadedPhotos(
  admin: SupabaseClient,
  userId: string,
  value: unknown,
  maximum: number,
) {
  const paths = normalizePaths(value, maximum);
  const prefix = `${userId}/`;
  const removablePaths = paths.filter((path) => path.startsWith(prefix) && storedFilePattern.test(path.slice(prefix.length)));

  try {
    return await Promise.all(paths.map(async (path) => {
      const fileName = path.slice(prefix.length);
      if (!path.startsWith(prefix) || !storedFilePattern.test(fileName)) {
        throw new InvalidStoredPhoto("One of the uploaded photos is invalid.");
      }

      const extension = fileName.split(".").at(-1)?.toLowerCase() || "";
      const { data, error } = await admin.storage.from("restroom-photos").download(path);
      if (error || !data) throw new InvalidStoredPhoto("Finish uploading every photo before submitting.");
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (bytes.length < 32 || bytes.length > maximumPhotoBytes || !matchesImageSignature(bytes, extension)) {
        throw new InvalidStoredPhoto("Use valid JPG, PNG, or WebP photos up to 8 MB each.");
      }

      const publicUrl = admin.storage.from("restroom-photos").getPublicUrl(path).data.publicUrl;
      return { path, publicUrl };
    }));
  } catch (error) {
    await removeUploadedPhotos(admin, removablePaths);
    throw error;
  }
}

export async function removeUploadedPhotos(admin: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return;
  await admin.storage.from("restroom-photos").remove(paths).catch(() => undefined);
}
