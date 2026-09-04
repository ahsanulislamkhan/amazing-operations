import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./config";

export async function createSupabaseServerClient(options: { persistent?: boolean } = {}) {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            cookieStore.set(name, value, options.persistent === false
              ? { ...cookieOptions, maxAge: undefined, expires: undefined }
              : cookieOptions);
          });
        } catch {
          // A Server Component can read cookies but cannot write them. The proxy
          // refreshes the session before protected data is rendered.
        }
      },
    },
  });
}
