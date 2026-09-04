import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretConfig } from "./config";

export function createSupabaseAdminClient() {
  const config = getSupabaseSecretConfig();
  if (!config) return null;
  return createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
