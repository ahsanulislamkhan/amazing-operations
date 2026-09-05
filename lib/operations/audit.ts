import type { AuditEventDTO } from "./types.ts";

const ignoredFields = new Set(["id", "updated_at", "created_at", "version", "auth_user_id", "avatar_url", "pre_archive_status"]);
export function auditReference(event: AuditEventDTO) {
  const values = event.afterData ?? event.beforeData ?? {};
  return String(values.invoice ?? values.full_name ?? values.name ?? values.body ?? "Related record");
}
export function auditChanges(event: AuditEventDTO) {
  const before = event.beforeData ?? {};
  const after = event.afterData ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !ignoredFields.has(key) && JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .map((key) => ({ field: key, before: before[key] ?? null, after: after[key] ?? null }));
}
export function auditCsv(events: AuditEventDTO[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [["When (Melbourne)", "Actor", "Record", "Action", "Reference", "Changed fields"], ...events.map((event) => [
    new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt)),
    event.actorName, event.entityType, event.action, auditReference(event), auditChanges(event).map((change) => change.field).join(", "),
  ])].map((row) => row.map(cell).join(",")).join("\r\n");
}

export function melbourneDayBoundary(date: string, nextDay = false) {
  const [year, month, day] = date.split("-").map(Number);
  const local = new Date(Date.UTC(year, month - 1, day + (nextDay ? 1 : 0)));
  const target = local.getTime();
  let instant = target;
  for (let iteration = 0; iteration < 3; iteration++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const displayed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    instant += target - displayed;
  }
  return new Date(instant).toISOString();
}
