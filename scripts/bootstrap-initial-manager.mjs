import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.INITIAL_MANAGER_EMAIL?.trim().toLowerCase();
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
if (!url || !key || !email) {
  throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY, and INITIAL_MANAGER_EMAIL are required.");
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: existing, error: profileError } = await supabase.from("staff_profiles").select("id, auth_user_id, full_name").eq("email", email).maybeSingle();
if (profileError) throw profileError;
const profile = existing ?? (await supabase.from("staff_profiles").insert({ full_name: email.split("@")[0], email, role: "manager", status: "uninvited" }).select("id, auth_user_id, full_name").single()).data;
if (!profile) throw new Error("The manager profile could not be created.");
let authUserId = profile.auth_user_id;
if (!authUserId) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { staff_profile_id: profile.id, full_name: profile.full_name },
    redirectTo: `${appUrl}/auth/callback?next=/auth/update-password`,
  });
  if (error) throw error;
  authUserId = data.user.id;
}
const { error: updateError } = await supabase.from("staff_profiles").update({ auth_user_id: authUserId, role: "manager", status: "invited", archived_at: null }).eq("id", profile.id);
if (updateError) throw updateError;
console.log(`Initial manager invitation prepared for ${email}.`);
