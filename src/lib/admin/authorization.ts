import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function configuredOwnerEmails() {
  return new Set(
    (process.env.OWNER_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isOwnerEmail(email?: string | null) {
  return Boolean(email && configuredOwnerEmails().has(email.toLowerCase()));
}

export async function getOwnerAccess(): Promise<{
  configured: boolean;
  user: User | null;
  authorized: boolean;
}> {
  const owners = configuredOwnerEmails();
  const supabase = await createClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  return {
    configured: owners.size > 0,
    user: data.user,
    authorized: Boolean(data.user?.email && owners.has(data.user.email.toLowerCase())),
  };
}

