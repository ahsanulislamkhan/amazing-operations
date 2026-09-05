"use client";

import { useEffect, useId, useRef, useState } from "react";
import DateFilter from "./DateFilter";
import TaskFilterSelect from "./TaskFilterSelect";
import { loadAuditPageAction, type AuditPage } from "../actions/audit";
import { auditChanges, auditCsv, auditReference } from "@/lib/operations/audit";
import type { AuditEventDTO, DateRange } from "@/lib/operations/types";

type NamedRecord = { id: string; name: string };
const entityOptions = ["tasks", "task_items", "task_assignees", "task_notes", "warehouses", "staff_profiles", "staff_warehouses"];
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
const when = (value: string) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function AuditHistory({ staff, warehouses, onOpenRecord, loadPage = loadAuditPageAction }: { staff: NamedRecord[]; warehouses: NamedRecord[]; onOpenRecord?: (event: AuditEventDTO) => void; loadPage?: typeof loadAuditPageAction }) {
  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [page, setPage] = useState<AuditPage>({ events: [], cursor: null });
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<AuditEventDTO | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const generation = useRef(0);
  const filters = { search, actor, entity, action, from: range.from, to: range.to };

  useEffect(() => {
    const request = ++generation.current;
    const timer = window.setTimeout(async () => {
      setPending(true); setError("");
      try {
        const result = await loadPage({ search, actor, entity, action, from: range.from, to: range.to, cursor: null });
        if (request !== generation.current) return;
        if (result.ok) setPage(result.data); else { setPage({ events: [], cursor: null }); setError(result.error); }
      } catch { if (request === generation.current) setError("Could not load history. Please retry."); }
      finally { if (request === generation.current) setPending(false); }
    }, 250);
    return () => { window.clearTimeout(timer); generation.current = request + 1; };
  }, [search, actor, entity, action, range.from, range.to, retry, loadPage]);

  useEffect(() => { if (selected) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [selected]);

  async function loadOlder() {
    const request = generation.current;
    setPending(true); setError("");
    try {
      const result = await loadPage({ ...filters, cursor: page.cursor });
      if (request !== generation.current) return;
      if (result.ok) setPage((current) => ({ events: [...current.events, ...result.data.events.filter((event) => !current.events.some((existing) => existing.id === event.id))], cursor: result.data.cursor }));
      else setError(result.error);
    } catch { if (request === generation.current) setError("Could not load older history. Please retry."); }
    finally { if (request === generation.current) setPending(false); }
  }
  function exportLoaded() {
    const url = URL.createObjectURL(new Blob(["\ufeff", auditCsv(page.events)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "operations-audit-loaded-results.csv"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function valueFor(field: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (field === "warehouse_id") return warehouses.find((row) => row.id === value)?.name ?? "Former warehouse";
    if (["staff_id", "author_id", "assigned_by", "created_by"].includes(field)) return staff.find((row) => row.id === value)?.name ?? "Former staff member";
    if (["warehouse_ids", "warehouseIds"].includes(field) && Array.isArray(value)) return value.map((id) => warehouses.find((row) => row.id === id)?.name ?? "Former warehouse").join(", ") || "None";
    if (field.endsWith("_at") && typeof value === "string" && !Number.isNaN(Date.parse(value))) return when(value);
    return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value).replaceAll("_", " ");
  }
  return <div className="settings-view audit-history">
    <div className="settings-intro"><h2>Audit History</h2><p>Who changed what, and when. History is read-only.</p></div>
    <div className="audit-filters">
      <input aria-label="Search audit history" type="search" placeholder="Search invoice, name or note" value={search} onChange={(event) => setSearch(event.target.value)} />
      <TaskFilterSelect label="Audit actor" value={actor} onChange={setActor} options={[{ value: "", label: "All people" }, { value: "system", label: "System" }, ...staff.map((row) => ({ value: row.id, label: row.name }))]} />
      <TaskFilterSelect label="Audit record type" value={entity} onChange={setEntity} options={[{ value: "", label: "All records" }, ...entityOptions.map((option) => ({ value: option, label: label(option) }))]} />
      <TaskFilterSelect label="Audit action" value={action} onChange={setAction} options={[{ value: "", label: "All actions" }, { value: "insert", label: "Created" }, { value: "update", label: "Updated" }, { value: "delete", label: "Removed" }, { value: "warehouse_access_changed", label: "Warehouse access" }]} />
      <DateFilter value={range} onChange={setRange} />
    </div>
    <div className="audit-toolbar"><button type="button" className="secondary-button" onClick={() => { setSearch(""); setActor(""); setEntity(""); setAction(""); setRange({ from: null, to: null }); }}>Clear filters</button><button type="button" className="secondary-button" disabled={!page.events.length || pending} onClick={exportLoaded}>Export loaded results</button></div>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p> : null}
    <div className="audit-events" aria-busy={pending}>
      <div className="audit-event audit-event--heading" aria-hidden="true"><span>When</span><span>Person</span><span>Record</span><span>Action</span></div>
      {page.events.map((event) => <button className="audit-event" type="button" key={event.id} aria-label={`View change: ${auditReference(event)}, ${event.actorName}, ${when(event.createdAt)}`} onClick={() => setSelected(event)}><time dateTime={event.createdAt}>{when(event.createdAt)}</time><span>{event.actorName}</span><span><strong>{auditReference(event)}</strong><small>{label(event.entityType)}</small></span><span>{label(event.action.toLowerCase())}</span></button>)}
      {!pending && !page.events.length && !error ? <p className="settings-empty-state">No history matches these filters.</p> : null}
    </div>
    <div className="audit-toolbar"><span role="status">{pending ? "Loading history…" : `${page.events.length} events loaded`}</span>{page.cursor ? <button className="secondary-button" type="button" disabled={pending} onClick={() => void loadOlder()}>Load older activity</button> : null}</div>
    <dialog ref={dialogRef} className="audit-detail" aria-labelledby={dialogTitleId} onCancel={() => setSelected(null)} onClose={() => setSelected(null)} onClick={(event) => { if (event.target === dialogRef.current) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left) setSelected(null); } }}>
      {selected ? <><header><div><h2 id={dialogTitleId}>Change details</h2><p>{selected.actorName} · {when(selected.createdAt)}</p></div><button type="button" className="secondary-button" autoFocus onClick={() => setSelected(null)}>Close</button></header>
        <h3>{auditReference(selected)}</h3><p>{label(selected.action.toLowerCase())} · {label(selected.entityType)}</p>
        <div className="audit-differences"><div className="audit-difference"><strong>Field</strong><strong>Before</strong><strong>After</strong></div>{auditChanges(selected).map((change) => <div className="audit-difference" key={change.field}><strong>{label(change.field)}</strong><span>{valueFor(change.field, change.before)}</span><span>{valueFor(change.field, change.after)}</span></div>)}</div>
        {!auditChanges(selected).length ? <p>No visible field changes in this event.</p> : null}
        {onOpenRecord ? <button className="primary-button" type="button" onClick={() => { const event = selected; setSelected(null); onOpenRecord(event); }}>Open related record</button> : null}
      </> : null}
    </dialog>
  </div>;
}
