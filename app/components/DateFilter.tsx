"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DateRange } from "@/lib/operations/types";
import "./date-filter.css";

export type DateFilterProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
};

function todayInMelbourne() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function labelForRange(range: DateRange) {
  if (!range.from && !range.to) return { number: "All", top: "All dates", bottom: "No date limit" };
  const format = (value: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" }).format(new Date(`${value}T12:00:00Z`));
  if (range.from === range.to && range.from) {
    const date = new Date(`${range.from}T12:00:00Z`);
    return {
      number: new Intl.DateTimeFormat("en-AU", { day: "numeric", timeZone: "Australia/Melbourne" }).format(date),
      top: new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "Australia/Melbourne" }).format(date),
      bottom: new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "Australia/Melbourne" }).format(date),
    };
  }
  return { number: "Range", top: range.from ? format(range.from) : "Any start", bottom: range.to ? format(range.to) : "Any end" };
}

export default function DateFilter({ value, onChange }: DateFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const label = labelForRange(value);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function apply() {
    if (draft.from && draft.to && draft.to < draft.from) {
      setError("End date cannot be earlier than the start date.");
      return;
    }
    setError("");
    onChange(draft);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function chooseToday() {
    const today = todayInMelbourne();
    onChange({ from: today, to: today });
    setDraft({ from: today, to: today });
    setError("");
    setOpen(false);
  }

  function chooseAll() {
    onChange({ from: null, to: null });
    setDraft({ from: null, to: null });
    setError("");
    setOpen(false);
  }

  return (
    <div className="date-filter" ref={rootRef}>
      <button ref={triggerRef} className="date-filter__trigger" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => {
        if (!current) {
          setDraft(value);
          setError("");
        }
        return !current;
      })}>
        <span className={`date-filter__number${value.from ? "" : " date-filter__number--all"}`}>{label.number}</span>
        <span className="date-filter__copy"><span>{label.top}</span><span className="date-filter__month-year">{label.bottom}</span></span>
        <span className={`date-filter__trigger-chevron${open ? " date-filter__trigger-chevron--open" : ""}`} aria-hidden="true"><img src="/assets/icon-dropdown-path.svg" alt="" /></span>
      </button>
      {open ? (
        <section className="date-filter__popover date-filter__range-popover" role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <div className="date-filter__popover-heading"><div><span className="date-filter__eyebrow">Schedule</span><h2 id={titleId}>Date range</h2></div><span className="date-filter__selection-summary">Inclusive</span></div>
          <div className="date-filter__range-fields">
            <label><span>Start date</span><input type="date" value={draft.from ?? ""} onChange={(event) => { setDraft({ ...draft, from: event.target.value || null }); setError(""); }} /></label>
            <label><span>End date</span><input type="date" value={draft.to ?? ""} onChange={(event) => { setDraft({ ...draft, to: event.target.value || null }); setError(""); }} /></label>
          </div>
          {error ? <p className="date-filter__error" role="alert">{error}</p> : null}
          <div className="date-filter__quick-actions"><button type="button" onClick={chooseToday}>Today</button><button type="button" onClick={chooseAll}>All Dates</button></div>
          <div className="date-filter__actions"><button className="date-filter__action date-filter__action--secondary" type="button" onClick={() => { setDraft(value); setError(""); setOpen(false); }}>Cancel</button><button className="date-filter__action date-filter__action--primary" type="button" onClick={apply}>Apply range</button></div>
        </section>
      ) : null}
    </div>
  );
}
