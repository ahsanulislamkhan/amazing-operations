"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedContext } from "@/lib/operations/server";
import type { ActionResult, AppRole } from "@/lib/operations/types";

const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
  rememberDevice: z.boolean(),
});

export async function signInAction(input: unknown): Promise<ActionResult<{ role: AppRole }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid work email and password.", code: "INVALID_INPUT" };
  const supabase = await createSupabaseServerClient({ persistent: parsed.data.rememberDevice });
  if (!supabase) return { ok: false, error: "Operations authentication has not been configured yet.", code: "NOT_CONFIGURED" };

  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email.toLowerCase(), password: parsed.data.password });
  if (error) return { ok: false, error: "The email or password is incorrect.", code: error.code };
  const context = await getAuthenticatedContext();
  if (!context.ok) {
    await supabase.auth.signOut();
    return context;
  }
  return { ok: true, data: { role: context.data.profile.role } };
}

export async function signOutAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  return { ok: true, data: undefined };
}

export async function requestPasswordResetAction(emailValue: unknown): Promise<ActionResult> {
  const parsed = z.email().max(254).safeParse(emailValue);
  if (!parsed.success) return { ok: false, error: "Enter a valid work email.", code: "INVALID_INPUT" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Operations authentication has not been configured yet.", code: "NOT_CONFIGURED" };
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(parsed.data.toLowerCase(), { redirectTo: `${origin}/auth/callback?next=/auth/update-password` });
  return { ok: true, data: undefined };
}

const passwordSetupSchema = z.object({
  password: z.string().min(10, "Use at least 10 characters.").max(1024),
  tokenHash: z.string().min(1).optional(),
  type: z.enum(["invite", "recovery"]).optional(),
});

export async function updatePasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = passwordSetupSchema.safeParse(typeof input === "string" ? { password: input } : input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a stronger password.", code: "INVALID_INPUT" };
  if (Boolean(parsed.data.tokenHash) !== Boolean(parsed.data.type)) {
    return { ok: false, error: "This password link is incomplete. Ask your manager for a new email.", code: "INVALID_LINK" };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Operations authentication has not been configured yet.", code: "NOT_CONFIGURED" };

  if (parsed.data.tokenHash && parsed.data.type) {
    const { error: verificationError } = await supabase.auth.verifyOtp({
      token_hash: parsed.data.tokenHash,
      type: parsed.data.type,
    });
    if (verificationError) return { ok: false, error: "This password link has expired or was already used. Ask your manager for a new email.", code: verificationError.code };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: error.message, code: error.code };
  const { error: activationError } = await supabase.rpc("activate_invited_profile");
  if (activationError) return { ok: false, error: activationError.message, code: activationError.code };
  return { ok: true, data: undefined };
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ email: z.email(), currentPassword: z.string().min(1), newPassword: z.string().min(10, "Use at least 10 characters.").max(1024) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the password fields.", code: "INVALID_INPUT" };
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  const { supabase, profile } = context.data;
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: profile.email, password: parsed.data.currentPassword });
  if (signInError) return { ok: false, error: "The current password is incorrect.", code: signInError.code };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return { ok: false, error: error.message, code: error.code };
  return { ok: true, data: undefined };
}

export async function requestOwnPasswordResetAction(): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestHeaders.get("origin") ?? "https://amazing-operations-dashboard.vercel.app";
  const { error } = await context.data.supabase.auth.resetPasswordForEmail(context.data.profile.email, {
    redirectTo: `${origin}/auth/callback?next=/auth/update-password`,
  });
  if (error) return { ok: false, error: error.status === 429 ? "Please wait a minute before requesting another reset email." : "The reset email could not be sent. Please try again or contact your manager.", code: error.code };
  return { ok: true, data: undefined };
}
