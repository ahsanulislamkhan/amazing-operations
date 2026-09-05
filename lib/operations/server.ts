import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ActionResult,
  AuditEventDTO,
  NotificationPreferencesDTO,
  NoticeDTO,
  OperationsSnapshot,
  StaffDTO,
  TaskAssigneeDTO,
  TaskDTO,
  TaskItemDTO,
  TaskNoteDTO,
  WarehouseDTO,
} from "./types";

type AuthenticatedContext = {
  supabase: SupabaseClient;
  profile: StaffDTO;
};

const defaultPreferences: NotificationPreferencesDTO = {
  assignment: { inApp: true, email: true },
  reassignment: { inApp: true, email: true },
  task_changed: { inApp: true, email: true },
  note_added: { inApp: true, email: false },
  task_delayed: { inApp: true, email: true },
  task_completed: { inApp: true, email: true },
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapStaff(rowValue: unknown): StaffDTO {
  const row = asObject(rowValue);
  return {
    id: String(row.id ?? ""),
    authUserId: row.auth_user_id ? String(row.auth_user_id) : null,
    fullName: String(row.full_name ?? ""),
    email: String(row.email ?? ""),
    role: row.role === "manager" ? "manager" : "warehouse_team",
    status: ["uninvited", "invited", "active", "suspended", "archived"].includes(String(row.status))
      ? row.status as StaffDTO["status"]
      : "uninvited",
    location: String(row.location || "Melbourne, Australia"),
    gender: row.gender === "Male" || row.gender === "Female" ? row.gender : "Prefer not to say",
    dateOfBirth: row.date_of_birth ? String(row.date_of_birth) : null,
    warehouseIds: asArray(row.staff_warehouses).map((membership) => String(asObject(membership).warehouse_id ?? "")).filter(Boolean),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

function mapTask(rowValue: unknown, staffNames: ReadonlyMap<string, string>): TaskDTO {
  const row = asObject(rowValue);
  const warehouse = asObject(row.warehouse);
  const items: TaskItemDTO[] = asArray(row.items).map((itemValue) => {
    const item = asObject(itemValue);
    return {
      id: String(item.id ?? ""),
      name: String(item.name ?? ""),
      quantity: String(item.quantity ?? ""),
      sortOrder: Number(item.sort_order ?? 0),
    };
  });
  const assignees: TaskAssigneeDTO[] = asArray(row.assignments).flatMap((assignmentValue) => {
    const assignment = asObject(assignmentValue);
    const staffId = String(assignment.staff_id ?? "");
    if (!staffId) return [];
    return [{
      id: staffId,
      fullName: staffNames.get(staffId) ?? "Former team member",
    }];
  });
  const notes: TaskNoteDTO[] = asArray(row.notes).map((noteValue) => {
    const note = asObject(noteValue);
    const authorId = String(note.author_id ?? "");
    return {
      id: String(note.id ?? ""),
      body: String(note.body ?? ""),
      authorId,
      authorName: staffNames.get(authorId) ?? "Operations team",
      createdAt: String(note.created_at ?? ""),
    };
  });
  return {
    id: String(row.id ?? ""),
    invoice: String(row.invoice ?? ""),
    type: row.type === "pickup" || row.type === "container" ? row.type : "delivery",
    warehouseId: String(row.warehouse_id ?? ""),
    warehouseName: String(warehouse.name ?? ""),
    assignees,
    scheduledAt: String(row.scheduled_at ?? ""),
    status: row.status === "in_progress" || row.status === "complete" || row.status === "delayed" ? row.status : "pending",
    description: String(row.description ?? ""),
    priority: Boolean(row.priority),
    items: items.sort((left, right) => left.sortOrder - right.sortOrder),
    notes: notes.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    version: Number(row.version ?? 1),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

function mapWarehouse(rowValue: unknown): WarehouseDTO {
  const row = asObject(rowValue);
  return {
    id: String(row.id ?? ""),
    officeType: String(row.office_type ?? "Warehouse"),
    name: String(row.name ?? ""),
    address: String(row.address ?? ""),
    status: row.status === "archived" ? "archived" : "active",
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

export async function getAuthenticatedContext(): Promise<ActionResult<AuthenticatedContext>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Operations is not connected to Supabase yet.", code: "NOT_CONFIGURED" };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { ok: false, error: "Your session has expired. Please sign in again.", code: "AUTH_REQUIRED" };

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, auth_user_id, full_name, email, role, status, location, gender, date_of_birth, archived_at, staff_warehouses(warehouse_id)")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (error) return { ok: false, error: "We could not load your account.", code: error.code };
  if (!data) return { ok: false, error: "This login is not connected to an Operations staff profile.", code: "PROFILE_MISSING" };
  const profile = mapStaff(data);
  if (profile.status !== "active" || profile.archivedAt) {
    await supabase.auth.signOut();
    return { ok: false, error: "This account is not active. Ask a manager for access.", code: "ACCOUNT_INACTIVE" };
  }
  return { ok: true, data: { supabase, profile } };
}

export async function requireManager(): Promise<ActionResult<AuthenticatedContext>> {
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  if (context.data.profile.role !== "manager") {
    return { ok: false, error: "Manager access is required for this action.", code: "FORBIDDEN" };
  }
  return context;
}

export async function loadOperationsSnapshot(): Promise<ActionResult<OperationsSnapshot>> {
  const context = await getAuthenticatedContext();
  if (!context.ok) return context;
  const { supabase, profile } = context.data;

  const reminders = await supabase.rpc("refresh_my_task_reminders");
  if (reminders.error) return { ok: false, error: "Task reminders could not be refreshed. Please retry.", code: reminders.error.code };

  const [tasksResult, warehousesResult, staffResult, noticesResult, preferencesResult, auditResult] = await Promise.all([
    supabase.from("tasks").select(`
      id, invoice, type, warehouse_id, scheduled_at, status, description, priority, version, archived_at,
      warehouse:warehouses(id, name),
      items:task_items(id, name, quantity, sort_order),
      assignments:task_assignees(staff_id),
      notes:task_notes(id, author_id, body, created_at)
    `).order("scheduled_at", { ascending: true }),
    supabase.from("warehouses").select("id, office_type, name, address, status, archived_at").order("name"),
    profile.role === "manager"
      ? supabase.from("staff_profiles").select("id, auth_user_id, full_name, email, role, status, location, gender, date_of_birth, archived_at, staff_warehouses(warehouse_id)").order("full_name")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("notifications").select("id, event, title, body, task_id, read_at, created_at").eq("staff_id", profile.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("notification_preferences").select("preferences").eq("staff_id", profile.id).maybeSingle(),
    profile.role === "manager"
      ? supabase.from("audit_events").select("id, actor_id, entity_type, entity_id, action, before_data, after_data, created_at, actor:staff_profiles(full_name)").order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = tasksResult.error ?? warehousesResult.error ?? staffResult.error ?? noticesResult.error ?? preferencesResult.error ?? auditResult.error;
  if (firstError) return { ok: false, error: "Operations data could not be loaded.", code: firstError.code };

  const taskRows = asArray(tasksResult.data);
  const staffRows = asArray(staffResult.data);
  const referencedStaffIds = Array.from(new Set(taskRows.flatMap((taskValue) => {
    const task = asObject(taskValue);
    const assigneeIds = asArray(task.assignments).map((assignmentValue) => String(asObject(assignmentValue).staff_id ?? ""));
    const authorIds = asArray(task.notes).map((noteValue) => String(asObject(noteValue).author_id ?? ""));
    return [...assigneeIds, ...authorIds].filter(Boolean);
  })));
  let staffNameRows = staffRows;
  if (profile.role !== "manager" && referencedStaffIds.length) {
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return { ok: false, error: "The secure staff-name directory is not configured.", code: "NOT_CONFIGURED" };
    }
    const { data: directoryRows, error: directoryError } = await admin
      .from("staff_name_directory")
      .select("id, full_name")
      .in("id", referencedStaffIds);
    if (directoryError) {
      return { ok: false, error: "Task staff names could not be loaded.", code: directoryError.code };
    }
    staffNameRows = asArray(directoryRows);
  }
  const staffNames = new Map(staffNameRows.map((staffValue) => {
    const staff = asObject(staffValue);
    return [String(staff.id ?? ""), String(staff.full_name ?? "")] as const;
  }).filter(([id]) => Boolean(id)));

  const preferenceRow = asObject(preferencesResult.data);
  const preferences = { ...defaultPreferences, ...asObject(preferenceRow.preferences) } as NotificationPreferencesDTO;
  const notices: NoticeDTO[] = asArray(noticesResult.data).map((noticeValue) => {
    const notice = asObject(noticeValue);
    return {
      id: String(notice.id ?? ""),
      event: String(notice.event) as NoticeDTO["event"],
      title: String(notice.title ?? ""),
      message: String(notice.body ?? ""),
      taskId: notice.task_id ? String(notice.task_id) : null,
      readAt: notice.read_at ? String(notice.read_at) : null,
      createdAt: String(notice.created_at ?? ""),
    };
  });
  const auditEvents: AuditEventDTO[] = asArray(auditResult.data).map((eventValue) => {
    const event = asObject(eventValue);
    const actor = asObject(event.actor);
    return {
      id: String(event.id ?? ""),
      actorId: event.actor_id ? String(event.actor_id) : null,
      actorName: String(actor.full_name || "System"),
      entityType: String(event.entity_type ?? "record"),
      entityId: event.entity_id ? String(event.entity_id) : null,
      action: String(event.action ?? "changed"),
      beforeData: event.before_data ? asObject(event.before_data) : null,
      afterData: event.after_data ? asObject(event.after_data) : null,
      createdAt: String(event.created_at ?? ""),
    };
  });
  return {
    ok: true,
    data: {
      account: profile,
      tasks: taskRows.map((task) => mapTask(task, staffNames)),
      warehouses: asArray(warehousesResult.data).map(mapWarehouse),
      staff: profile.role === "manager" ? staffRows.map(mapStaff) : [],
      notices,
      auditEvents,
      notificationPreferences: preferences,
    },
  };
}
