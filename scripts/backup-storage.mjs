import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const buckets = ["restroom-photos", "profile-avatars", "business-creatives"];
const output = path.resolve(process.argv[2] || `.data/backups/storage-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const manifest = { createdAt: new Date().toISOString(), sourceProject: new URL(url).hostname.split(".")[0], files: [] };

async function listFiles(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error && error.message.toLowerCase().includes("not found")) return [];
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const entry of data || []) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) files.push({ path: objectPath, metadata: entry.metadata || {} });
      else files.push(...await listFiles(bucket, objectPath));
    }
    if (!data || data.length < 100) break;
  }
  return files;
}

await mkdir(output, { recursive: true });
for (const bucket of buckets) {
  const files = await listFiles(bucket);
  for (const file of files) {
    const { data, error } = await admin.storage.from(bucket).download(file.path);
    if (error) throw new Error(`${bucket}/${file.path}: ${error.message}`);
    const bytes = Buffer.from(await data.arrayBuffer());
    const destination = path.join(output, bucket, ...file.path.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    manifest.files.push({
      bucket,
      path: file.path,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      type: data.type || file.metadata.mimetype || "application/octet-stream",
    });
  }
  console.log(`${bucket}: backed up ${files.length} objects.`);
}

await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Storage backup complete: ${manifest.files.length} objects in ${output}`);
