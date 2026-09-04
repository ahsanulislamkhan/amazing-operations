"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { processEmailOutbox } from "@/lib/email/outbox";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedContext, loadOperationsSnapshot, requireManager } from "@/lib/operations/server";
import type { ActionResult, NotificationPreferencesDTO, OperationsSnapshot } from "@/lib/operations/types";

const uuid = z.uuid();
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

const staffSchema = z.object({
  id: uuid.optional(),
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  role: z.enum(["manager", "warehouse_team"]),
  location: z.string().trim().min(2).max(240),
  warehouseIds: z.array(uuid),
});

export async function saveStaffAction(input: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the staff details.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { error } = await context.data.supabase.rpc("save_staff_profile", {
    target_staff_id: parsed.data.id ?? null,
    staff_full_name: parsed.data.fullName,
    staff_email: parsed.data.email.toLowerCase(),
    staff_role: parsed.data.role,
    staff_location: parsed.data.location,
    staff_warehouse_ids: parsed.data.warehouseIds,
  });
  if (error) return { ok: false, error: error.message, code: error.code };
  return refreshAfterMutation();
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
  const { data: staff, error: staffError } = await context.data.supabase.from("staff_profiles").select("id, email, full_name, status").eq("id", parsed.data).single();
  if (staffError || !staff) return { ok: false, error: "Staff member not found.", code: staffError?.code };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Secure invitation credentials are not configured.", code: "NOT_CONFIGURED" };
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(staff.email, {
    data: { staff_profile_id: staff.id, full_name: staff.full_name },
    redirectTo: `${origin}/auth/callback?next=/auth/update-password`,
  });
  if (error) return { ok: false, error: error.message, code: error.code };
  const { error: updateError } = await context.data.supabase.from("staff_profiles").update({ auth_user_id: data.user.id, status: "invited" }).eq("id", staff.id);
  if (updateError) return { ok: false, error: updateError.message, code: updateError.code };
  return refreshAfterMutation();
}

export async function sendStaffPasswordResetAction(staffIdValue: unknown): Promise<ActionResult<OperationsSnapshot>> {
  const parsed = uuid.safeParse(staffIdValue);
  if (!parsed.success) return { ok: false, error: "Invalid staff member.", code: "INVALID_INPUT" };
  const context = await requireManager();
  if (!context.ok) return context;
  const { data: staff, error } = await context.data.supabase.from("staff_profiles").select("email").eq("id", parsed.data).single();
  if (error || !staff) return { ok: false, error: "Staff member not found.", code: error?.code };
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  const { error: resetError } = await context.data.supabase.auth.resetPasswordForEmail(staff.email, { redirectTo: `${origin}/auth/callback?next=/auth/update-password` });
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
