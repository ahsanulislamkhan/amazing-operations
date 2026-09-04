export const APP_TIME_ZONE = "Australia/Melbourne";

export type AppRole = "manager" | "warehouse_team";
export type StaffStatus = "uninvited" | "invited" | "active" | "suspended" | "archived";
export type TaskStatus = "pending" | "in_progress" | "complete" | "delayed";
export type TaskType = "delivery" | "pickup" | "container";
export type NotificationEvent =
  | "assignment"
  | "reassignment"
  | "task_changed"
  | "note_added"
  | "task_delayed"
  | "task_completed"
  | "invitation"
  | "password_reset";

export type DateRange = {
  from: string | null;
  to: string | null;
};

export type StaffDTO = {
  id: string;
  authUserId: string | null;
  fullName: string;
  email: string;
  role: AppRole;
  status: StaffStatus;
  avatarUrl: string;
  location: string;
  warehouseIds: string[];
  archivedAt: string | null;
};

export type WarehouseDTO = {
  id: string;
  officeType: string;
  name: string;
  address: string;
  status: "active" | "archived";
  archivedAt: string | null;
};

export type TaskItemDTO = {
  id: string;
  name: string;
  quantity: string;
  sortOrder: number;
};

export type TaskNoteDTO = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
};

export type TaskAssigneeDTO = Pick<StaffDTO, "id" | "fullName" | "email" | "avatarUrl">;

export type TaskDTO = {
  id: string;
  invoice: string;
  type: TaskType;
  warehouseId: string;
  warehouseName: string;
  assignees: TaskAssigneeDTO[];
  scheduledAt: string;
  status: TaskStatus;
  description: string;
  priority: boolean;
  items: TaskItemDTO[];
  notes: TaskNoteDTO[];
  version: number;
  archivedAt: string | null;
};

export type NoticeDTO = {
  id: string;
  event: NotificationEvent;
  title: string;
  message: string;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type AuditEventDTO = {
  id: string;
  actorId: string | null;
  actorName: string;
  entityType: string;
  entityId: string | null;
  action: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
};

export type NotificationPreferencesDTO = Record<
  Exclude<NotificationEvent, "invitation" | "password_reset">,
  { inApp: boolean; email: boolean }
>;

export type OperationsSnapshot = {
  account: StaffDTO;
  tasks: TaskDTO[];
  warehouses: WarehouseDTO[];
  staff: StaffDTO[];
  notices: NoticeDTO[];
  auditEvents: AuditEventDTO[];
  notificationPreferences: NotificationPreferencesDTO;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  complete: "Complete",
  delayed: "Delayed",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  container: "Container",
};

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeDateRange(range: DateRange): DateRange {
  const from = isIsoDate(range.from) ? range.from : null;
  const to = isIsoDate(range.to) ? range.to : null;
  if (from && to && from > to) return { from: null, to: null };
  return { from, to };
}

export function isTaskInRange(scheduledAt: string, range: DateRange): boolean {
  const normalized = normalizeDateRange(range);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(scheduledAt));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  if (normalized.from && date < normalized.from) return false;
  if (normalized.to && date > normalized.to) return false;
  return true;
}

export function canTeamTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  if (from === "pending") return to === "in_progress" || to === "delayed";
  if (from === "in_progress") return to === "complete" || to === "delayed";
  if (from === "delayed") return to === "in_progress" || to === "complete";
  return false;
}
