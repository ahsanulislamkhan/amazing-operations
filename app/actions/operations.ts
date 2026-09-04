"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { processEmailOutbox } from "@/lib/email/outbox";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedContext, loadOperationsSnapshot, requireManager } from "@/lib/operations/server";
import {
  createStaffInputSchema,
  normalizeStaffInput,
  saveStaffInputSchema,
  staffInvitationCanRetry,
  staffInvitationError,
  staffPersistenceError,
} from "@/lib/operations/staff";
import type { ActionResult, CreateStaffInviteResult, NotificationPreferencesDTO, OperationsSnapshot } from "@/lib/operations/types";

const uuid = z.guid();
const taskItemSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(200), quantity: z.string().trim().min(1).max(100) });
const createTaskSchema = z.object({
  invoice: z.string().trim().min(2).max(64),
  type: z.enum(["delivery", "pickup", "container"]),
  warehouseId: uuid,
  scheduledAt: z.iso.datetime({ offset: true }),
  status: z.enum(["pending", "in_progress", "complete", "delayed"]).default("pending"),
  description: z.string().trim().max(2000),
  priority: z.boolean(),
  assigneeIds: z.array(uuid).min(1),
  items: z.array(taskItemSchema).min(1),
  note: z.string().trim().max(4000).optional(),
});
const updateTaskSchema = createTaskSchema.omit({ invoice: true }).extend({ id: uuid, version: z.number().int().positive(), archivedAt: z.string().nullable().optional() });

async function refreshAfterMutation(): Promise<ActionResult<OperationsSnapshot>> {
  after(async () => {
    try {
      await processEmailOutbox();
    } catch (error) {
      console.error("Immediate email outbox processing failed; the scheduled retry will handle it.", error);
    }
  });
  return loadOperationsSnapshot();
}

export async function loadOperationsAction(): Promise<ActionResult<OperationsSnapshot>> {
  return loadOperationsSnapshot();
}

export async function createTaskAction(input: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the task details.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { data, error } = await context.data.supabase.rpc("create_operations_task", {
    task_invoice: parsed.data.invoice.toUpperCase(),
    task_type_value: parsed.data.type,
    task_warehouse_id: parsed.data.warehouseId,
    task_scheduled_at: parsed.data.scheduledAt,
    task_status_value: parsed.data.status,
    task_description: parsed.data.description,
    task_priority: parsed.data.priority,
    task_assignee_ids: parsed.data.assigneeIds,
    task_items_value: parsed.data.items,
    task_note: parsed.data.note || null,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "The task could not be created.", code: error?.code };
  return refreshAfterMutation();
}

export async function updateTaskAction(input: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the task details.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("update_operations_task", {
    target_task_id: parsed.data.id,
    expected_version: parsed.data.version,
    task_type_value: parsed.data.type,
    task_warehouse_id: parsed.data.warehouseId,
    task_scheduled_at: parsed.data.scheduledAt,
    task_status_value: parsed.data.status,
    task_description: parsed.data.description,
    task_priority: parsed.data.priority,
    task_assignee_ids: parsed.data.assigneeIds,
    task_items_value: parsed.data.items,
    task_note: parsed.data.note || null,
  });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
}

export async function archiveTaskAction(taskIdValue: unknown, restore = false): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = uuid.safeParse(taskIdValue);
  if (!parsed.success) return { ok: false, error: "Invalid task.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("set_task_archived", { target_task_id: parsed.data, restore_task: restore });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
}

export async function updateAssignedTaskProgressAction(input: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = z.object({ taskId: uuid, status: z.enum(["pending", "in_progress", "complete", "delayed"]), version: z.number().int().positive(), note: z.string().trim().max(4000).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the task update.", code: "INVALID_INPUT" };
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("update_assigned_task_progress", {
    target_task_id: parsed.data.taskId,
    next_status: parsed.data.status,
    note_body: parsed.data.note || null,
    expected_version: parsed.data.version,
  });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
}

export async function updateProfileAction(input: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = z.object({ fullName: z.string().trim().min(2).max(120), location: z.string().trim().min(2).max(240) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your name and location.", code: "INVALID_INPUT" };
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("update_own_profile", { profile_full_name: parsed.data.fullName, profile_location: parsed.data.location });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
}

export async function saveNotificationPreferencesAction(input: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const channel = z.object({ inApp: z.boolean(), email: z.boolean() });
  const schema = z.object({ assignment: channel, reassignment: channel, task_changed: channel, note_added: channel, task_delayed: channel, task_completed: channel });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the notification preferences.", code: "INVALID_INPUT" };
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("save_notification_preferences", { next_preferences: parsed.data as NotificationPreferencesDTO });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
}

export async function markNotificationsReadAction(notificationIdsValue: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = z.array(uuid).max(100).safeParse(notificationIdsValue);
  if (!parsed.success) return { ok: false, error: "Invalid notifications.", code: "INVALID_INPUT" };
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("mark_notifications_read", { notification_ids: parsed.data });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
}

export async function saveStaffAction(input: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = saveStaffInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the staff details.", code: "INVALID_INPUT" };
  const staff = normalizeStaffInput(parsed.data);
  const context = await requireManager();
  if (!context.ok) return context;

  if (staff.id) {
    const { data: existing, error: existingError } = await context.data.supabase
      .from("staff_profiles")
      .select("email, auth_user_id")
      .eq("id", staff.id)
      .single();
    if (existingError || !existing) {
      return { ok: false, error: "Staff member not found.", code: existingError?.code ?? "STAFF_NOT_FOUND" };
    }
    if (existing.auth_user_id && existing.email.toLowerCase() !== staff.email) {
      return {
        ok: false,
        error: "A linked login email cannot be changed here. Ask a Supabase administrator to migrate the login first.",
        code: "LINKED_EMAIL_LOCKED",
      };
    }
  }

  const { error } = await context.data.supabase.rpc("save_staff_profile", {
    target_staff_id: staff.id ?? null,
    staff_full_name: staff.fullName,
    staff_email: staff.email,
    staff_role: staff.role,
    staff_location: staff.location,
    staff_warehouse_ids: staff.warehouseIds,
    staff_gender: staff.gender,
    staff_date_of_birth: staff.dateOfBirth || null,
  });
  if (error) return { ok: false, error: staffPersistenceError(error), code: error.code };
  return refreshAfterMutation();
}

type StaffInviteRecord = {
  id: string;
  email: string;
  full_name: string;
  status?: string;
};

type StaffInviteAttempt =
  | { ok: true }
  | { ok: false; error: string; code?: string; retryAvailable: boolean; invitationSent: boolean };

async function staffAccessRedirectUrl() {
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  return `${origin}/auth/callback?next=/auth/update-password`;
}

async function inviteSavedStaff(
  supabase: SupabaseClient,
  staff: StaffInviteRecord,
): Promise<StaffInviteAttempt> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: "Secure Supabase invitation credentials are not configured.",
      code: "NOT_CONFIGURED",
      retryAvailable: true,
      invitationSent: false,
    };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(staff.email, {
    data: { staff_profile_id: staff.id, full_name: staff.full_name },
    redirectTo: await staffAccessRedirectUrl(),
  });
  if (error) {
    return { ok: false, error: staffInvitationError(error), code: error.code, retryAvailable: staffInvitationCanRetry(error), invitationSent: false };
  }

  const { error: updateError } = await supabase
    .from("staff_profiles")
    .update({ auth_user_id: data.user.id, status: "invited" })
    .eq("id", staff.id)
    .select("id")
    .single();

  if (!updateError) return { ok: true };

  return {
    ok: false,
    error: "The invitation was created, but it could not be linked to the staff profile.",
    code: updateError.code,
    retryAvailable: false,
    invitationSent: true,
  };
}

async function profileCreatedFailure(
  invite: Extract<StaffInviteAttempt, { ok: false }>,
): Promise<CreateStaffInviteResult> {
  const refreshed = await loadOperationsSnapshot();
  if (invite.invitationSent) {
    return {
      ok: false,
      error: `${invite.error} The email may already be in the member's inbox, but the profile remains uninvited. Ask a Supabase administrator to link the login before retrying.`,
      code: invite.code ?? "INVITE_LINK_FAILED",
      profileCreated: true,
      data: refreshed.ok ? refreshed.data : undefined,
    };
  }
  const recovery = invite.retryAvailable
    ? "Use Resend invitation from the member menu when you are ready to try again."
    : "Edit the member to use another email, or ask a Supabase administrator to resolve the existing login before resending.";
  return {
    ok: false,
    error: `The staff profile and warehouse access were saved, but the invitation was not sent. ${invite.error} ${recovery}`,
    code: invite.code ?? "INVITE_FAILED",
    profileCreated: true,
    data: refreshed.ok ? refreshed.data : undefined,
  };
}

export async function createAndInviteStaffAction(input: unknown): Promise<CreateStaffInviteResult> {
  const parsed = createStaffInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the staff details.",
      code: "INVALID_INPUT",
      profileCreated: false,
    };
  }
  const staff = normalizeStaffInput(parsed.data);
  const context = await requireManager();
  if (!context.ok) return { ...context, profileCreated: false };

  if (!createSupabaseAdminClient()) {
    return {
      ok: false,
      error: "Secure Supabase invitation credentials are not configured.",
      code: "NOT_CONFIGURED",
      profileCreated: false,
    };
  }

  const { data: existing, error: duplicateLookupError } = await context.data.supabase
    .from("staff_profiles")
    .select("id")
    .eq("email", staff.email)
    .maybeSingle();
  if (duplicateLookupError) {
    return {
      ok: false,
      error: "We could not check whether this email is already in use. Please try again.",
      code: duplicateLookupError.code,
      profileCreated: false,
    };
  }
  if (existing) {
    return {
      ok: false,
      error: "A staff profile already uses this email address. Edit or restore that member instead.",
      code: "DUPLICATE_EMAIL",
      profileCreated: false,
    };
  }

  const { data: staffIdValue, error: saveError } = await context.data.supabase.rpc("save_staff_profile", {
    target_staff_id: null,
    staff_full_name: staff.fullName,
    staff_email: staff.email,
    staff_role: staff.role,
    staff_location: staff.location,
    staff_warehouse_ids: staff.warehouseIds,
    staff_gender: staff.gender,
    staff_date_of_birth: staff.dateOfBirth || null,
  });
  const staffId = uuid.safeParse(staffIdValue);
  if (saveError || !staffId.success) {
    return {
      ok: false,
      error: staffPersistenceError(saveError),
      code: saveError?.code ?? "STAFF_SAVE_FAILED",
      profileCreated: false,
    };
  }

  const invitation = await inviteSavedStaff(context.data.supabase, {
    id: staffId.data,
    email: staff.email,
    full_name: staff.fullName,
  });
  if (!invitation.ok) return profileCreatedFailure(invitation);

  const refreshed = await refreshAfterMutation();
  if (!refreshed.ok) return { ...refreshed, profileCreated: true };
  return refreshed;
}

export async function setStaffStateAction(input: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = z.object({ staffId: uuid, action: z.enum(["suspend", "reactivate", "archive", "restore"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid staff action.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("set_staff_state", { target_staff_id: parsed.data.staffId, state_action: parsed.data.action });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
}

export async function inviteStaffAction(staffIdValue: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = uuid.safeParse(staffIdValue);
  if (!parsed.success) return { ok: false, error: "Invalid staff member.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { data: staff, error: staffError } = await context.data.supabase.from("staff_profiles").select("id, email, full_name, status, auth_user_id").eq("id", parsed.data).single();
  if (staffError || !staff) return { ok: false, error: "Staff member not found.", code: staffError?.code };
  if (staff.status !== "uninvited" && staff.status !== "invited") {
    return { ok: false, error: "Only pending staff members can be invited.", code: "INVALID_STAFF_STATE" };
  }

  if (staff.auth_user_id) {
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: false, error: "Secure Supabase invitation credentials are not configured.", code: "NOT_CONFIGURED" };
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(staff.auth_user_id);
    if (authError || !authData.user) {
      return { ok: false, error: "The linked Supabase login could not be verified. Ask a Supabase administrator to review this member.", code: authError?.code ?? "AUTH_USER_MISSING" };
    }
    if (authData.user.email?.toLowerCase() !== staff.email.toLowerCase()) {
      return { ok: false, error: "The staff email does not match the linked Supabase login. Correct the member record before resending access.", code: "AUTH_EMAIL_MISMATCH" };
    }
    if (authData.user.email_confirmed_at) {
      const { error: stateError } = await context.data.supabase.from("staff_profiles").update({ status: "invited" }).eq("id", staff.id);
      if (stateError) return { ok: false, error: "The staff profile could not be prepared for password recovery.", code: stateError.code };
      const { error: resetError } = await context.data.supabase.auth.resetPasswordForEmail(staff.email, { redirectTo: await staffAccessRedirectUrl() });
      if (resetError) return { ok: false, error: resetError.message, code: resetError.code };
      return refreshAfterMutation();
    }
  }

  const invitation = await inviteSavedStaff(context.data.supabase, staff);
  if (!invitation.ok) return { ok: false, error: invitation.error, code: invitation.code };
  return refreshAfterMutation();
}

export async function sendStaffPasswordResetAction(staffIdValue: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = uuid.safeParse(staffIdValue);
  if (!parsed.success) return { ok: false, error: "Invalid staff member.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { data: staff, error } = await context.data.supabase
    .from("staff_profiles")
    .select("email, status, auth_user_id")
    .eq("id", parsed.data)
    .single();
  if (error || !staff) return { ok: false, error: "Staff member not found.", code: error?.code };
  if (!staff.auth_user_id) {
    return { ok: false, error: "This member does not have a linked login yet. Send an invitation first.", code: "LOGIN_NOT_LINKED" };
  }
  if (!(["invited", "active", "suspended"] as const).includes(staff.status)) {
    return { ok: false, error: "Password resets are only available for invited or active linked accounts.", code: "INVALID_STAFF_STATE" };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Secure Supabase invitation credentials are not configured.", code: "NOT_CONFIGURED" };
  const { data: authData, error: authError } = await admin.auth.admin.getUserById(staff.auth_user_id);
  if (authError || !authData.user) {
    return { ok: false, error: "The linked Supabase login could not be verified. Ask a Supabase administrator to review this member.", code: authError?.code ?? "AUTH_USER_MISSING" };
  }
  if (authData.user.email?.toLowerCase() !== staff.email.toLowerCase()) {
    return { ok: false, error: "The staff email does not match the linked Supabase login. Correct the member record before sending a reset.", code: "AUTH_EMAIL_MISMATCH" };
  }

  const { error: resetError } = await context.data.supabase.auth.resetPasswordForEmail(staff.email, { redirectTo: await staffAccessRedirectUrl() });
  if (resetError) return { ok: false, error: resetError.message, code: resetError.code };
  return refreshAfterMutation();
}

const warehouseSchema = z.object({ id: uuid.optional(), officeType: z.string().trim().min(2).max(120), name: z.string().trim().min(2).max(120), address: z.string().trim().min(2).max(300) });

export async function saveWarehouseAction(input: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = warehouseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the warehouse details.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("save_warehouse", { target_warehouse_id: parsed.data.id ?? null, warehouse_office_type: parsed.data.officeType, warehouse_name: parsed.data.name, warehouse_address: parsed.data.address });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
}

export async function setWarehouseArchivedAction(warehouseIdValue: unknown, restore = false): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = uuid.safeParse(warehouseIdValue);
  if (!parsed.success) return { ok: false, error: "Invalid warehouse.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("set_warehouse_archived", { target_warehouse_id: parsed.data, restore_warehouse: restore });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
}
