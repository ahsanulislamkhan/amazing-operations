"use server";

import { z } from "zod";
import { requireManager } from "@/lib/operations/server";
import { isIsoDate, type ActionResult, type AuditEventDTO } from "@/lib/operations/types";
import { melbourneDayBoundary } from "@/lib/operations/audit";

const date = z.string().refine(isIsoDate).nullable();
const schema = z.object({
  search: z.string().max(160), actor: z.union([z.guid(), z.literal(""), z.literal("system")]),
  entity: z.enum(["", "tasks", "task_items", "task_assignees", "task_notes", "warehouses", "staff_profiles", "staff_warehouses"]),
  action: z.enum(["", "insert", "update", "delete", "warehouse_access_changed"]),
  from: date, to: date,
  cursor: z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.guid() }).nullable(),
});
export type AuditPage = { events: AuditEventDTO[]; cursor: { createdAt: string; id: string } | null };

export async function loadAuditPageAction(input: unknown): Promise<ActionResult<AuditPage>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the audit filters." };
  const filters = parsed.data;
  if (filters.from && filters.to && filters.from > filters.to) return { ok: false, error: "End date must be on or after start date." };
  const context = await requireManager();
  if (!context.ok) return context;
  let query = context.data.supabase.from("audit_events")
    .select("id, actor_id, entity_type, entity_id, action, before_data, after_data, created_at, actor:staff_profiles(full_name)")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
  if (filters.actor === "system") query = query.is("actor_id", null);
  else if (filters.actor) query = query.eq("actor_id", filters.actor);
  if (filters.entity) query = query.eq("entity_type", filters.entity);
  if (filters.action === "warehouse_access_changed") query = query.in("action", ["warehouse_access_changed", "replace"]);
  else if (filters.action) query = query.eq("action", filters.action);
  if (filters.from) query = query.gte("created_at", melbourneDayBoundary(filters.from));
  if (filters.to) query = query.lt("created_at", melbourneDayBoundary(filters.to, true));
  const search = filters.search.trim().replace(/[^\p{L}\p{N}\s@_\-]/gu, "").slice(0, 160);
  if (search) query = query.or(["after_data->>invoice", "before_data->>invoice", "after_data->>full_name", "before_data->>full_name", "after_data->>name", "before_data->>name", "after_data->>body", "before_data->>body", "entity_type", "action"].map((field) => `${field}.ilike.%${search}%`).join(","));
  if (filters.cursor) query = query.or(`created_at.lt.${filters.cursor.createdAt},and(created_at.eq.${filters.cursor.createdAt},id.lt.${filters.cursor.id})`);
  const { data, error } = await query;
  if (error) return { ok: false, error: "Audit history could not be loaded. Please retry.", code: error.code };
  const events = (data ?? []).slice(0, 50).map((row): AuditEventDTO => {
    const actor = row.actor as unknown as { full_name?: string } | null;
    return { id: row.id, actorId: row.actor_id, actorName: actor?.full_name ?? "System", entityType: row.entity_type, entityId: row.entity_id, action: row.action, beforeData: row.before_data, afterData: row.after_data, createdAt: row.created_at };
  });
  const last = events.at(-1);
  return { ok: true, data: { events, cursor: (data?.length ?? 0) > 50 && last ? { createdAt: last.createdAt, id: last.id } : null } };
}
