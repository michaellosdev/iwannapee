import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const backupDirectory = process.argv[2] ? path.resolve(process.argv[2]) : "";
const targetUrl = process.env.SUPABASE_RESTORE_TEST_URL;
const targetSecret = process.env.SUPABASE_RESTORE_TEST_SECRET_KEY;
const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!backupDirectory) throw new Error("Pass the Storage backup directory containing manifest.json.");
if (!targetUrl || !targetSecret) throw new Error("SUPABASE_RESTORE_TEST_URL and SUPABASE_RESTORE_TEST_SECRET_KEY are required.");
if (process.env.CONFIRM_STORAGE_RESTORE_TARGET !== "DISPOSABLE_TEST_PROJECT") throw new Error("Set CONFIRM_STORAGE_RESTORE_TARGET=DISPOSABLE_TEST_PROJECT after verifying the target.");
if (sourceUrl && new URL(sourceUrl).hostname === new URL(targetUrl).hostname) throw new Error("Refusing to restore Storage objects into the source project.");

const manifest = JSON.parse(await readFile(path.join(backupDirectory, "manifest.json"), "utf8"));
const admin = createClient(targetUrl, targetSecret, { auth: { autoRefreshToken: false, persistSession: false } });
const bucketOptions = {
  "restroom-photos": { public: true, fileSizeLimit: 8_388_608, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
  "profile-avatars": { public: true, fileSizeLimit: 2_097_152, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
  "business-creatives": { public: true, fileSizeLimit: 8_388_608, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
};
const allowedBuckets = new Set(Object.keys(bucketOptions));
const targetProject = new URL(targetUrl).hostname.split(".")[0];
if (manifest.sourceProject && manifest.sourceProject === targetProject) {
  throw new Error("Refusing to restore a backup into its source project.");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateManifestFile(file) {
  if (!file || !allowedBuckets.has(file.bucket) || typeof file.path !== "string") {
    throw new Error("Storage manifest contains an unsupported bucket or path.");
  }
  const segments = file.path.split("/");
  if (!segments.length || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    throw new Error(`Storage manifest contains an unsafe path in ${file.bucket}.`);
  }
  return segments;
}

for (const [bucket, options] of Object.entries(bucketOptions)) {
  const { error } = await admin.storage.createBucket(bucket, options);
  if (error && !error.message.toLowerCase().includes("already exists")) throw new Error(`${bucket}: ${error.message}`);
  if (error) {
    const { error: updateError } = await admin.storage.updateBucket(bucket, options);
    if (updateError) throw new Error(`${bucket}: ${updateError.message}`);
  }
}

let verified = 0;
for (const file of manifest.files || []) {
  const segments = validateManifestFile(file);
  const bytes = await readFile(path.join(backupDirectory, file.bucket, ...segments));
  const expectedHash = typeof file.sha256 === "string" ? file.sha256 : sha256(bytes);
  if (Number.isFinite(file.size) && bytes.length !== file.size) throw new Error(`${file.bucket}/${file.path}: local backup size mismatch.`);
  if (sha256(bytes) !== expectedHash) throw new Error(`${file.bucket}/${file.path}: local backup checksum mismatch.`);

  const { error } = await admin.storage.from(file.bucket).upload(file.path, bytes, { contentType: file.type, upsert: true });
  if (error) throw new Error(`${file.bucket}/${file.path}: ${error.message}`);
  const { data: restored, error: downloadError } = await admin.storage.from(file.bucket).download(file.path);
  if (downloadError || !restored) throw new Error(`${file.bucket}/${file.path}: restored object could not be downloaded.`);
  const restoredBytes = Buffer.from(await restored.arrayBuffer());
  if (restoredBytes.length !== bytes.length || sha256(restoredBytes) !== expectedHash) {
    throw new Error(`${file.bucket}/${file.path}: restored object checksum mismatch.`);
  }
  verified += 1;
}

if (verified !== (manifest.files || []).length) throw new Error("Storage restore verification count failed.");
console.log(`Storage restore validation passed: ${verified} objects restored and checksum-verified on the disposable target.`);
