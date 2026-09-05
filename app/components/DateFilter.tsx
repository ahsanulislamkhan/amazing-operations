"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DateRange } from "@/lib/operations/types";
import "./date-filter.css";

export type DateFilterProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
};

type RangeEndpoint = "from" | "to";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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

function isoFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dateFromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function monthFromIso(value: string) {
  const date = dateFromIso(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
}

function shiftMonth(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12));
}

function displayDate(value: string | null) {
  if (!value) return "Choose date";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateFromIso(value));
}

function labelForRange(range: DateRange) {
  if (!range.from && !range.to) return { number: "All", top: "All dates", bottom: "No date limit" };
  const format = (value: string) => displayDate(value);
  if (range.from === range.to && range.from) {
    const date = dateFromIso(range.from);
    return {
      number: new Intl.DateTimeFormat("en-AU", { day: "numeric", timeZone: "UTC" }).format(date),
      top: new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(date),
      bottom: new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(date),
    };
  }
  return { number: "Range", top: range.from ? format(range.from) : "Any start", bottom: range.to ? format(range.to) : "Any end" };
}

function calendarWeeks(month: Date) {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 12));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + week * 7 + day);
    return { date, iso: isoFromDate(date), inMonth: date.getUTCMonth() === month.getUTCMonth() };
  }));
}

export default function DateFilter({ value, onChange }: DateFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [activeEndpoint, setActiveEndpoint] = useState<RangeEndpoint>("from");
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromIso(value.from ?? value.to ?? todayInMelbourne()));
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const label = labelForRange(value);
  const weeks = useMemo(() => calendarWeeks(visibleMonth), [visibleMonth]);
  const today = todayInMelbourne();

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

  function openCalendar() {
    setDraft(value);
    setActiveEndpoint(value.from && !value.to ? "to" : "from");
    setVisibleMonth(monthFromIso(value.from ?? value.to ?? today));
    setError("");
    setOpen(true);
  }

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

  function selectDate(iso: string) {
    setError("");
    if (activeEndpoint === "from") {
      setDraft((current) => ({ from: iso, to: current.to && current.to >= iso ? current.to : null }));
      setActiveEndpoint("to");
      return;
    }
    if (draft.from && iso < draft.from) {
      setError("End date cannot be earlier than the start date. Choose another end date.");
      return;
    }
    setDraft((current) => ({ from: current.from ?? iso, to: iso }));
    setActiveEndpoint("from");
  }

  function chooseToday() {
    onChange({ from: today, to: today });
    setDraft({ from: today, to: today });
    setError("");
    setOpen(false);
    triggerRef.current?.focus();
  }

  function chooseAll() {
    onChange({ from: null, to: null });
    setDraft({ from: null, to: null });
    setError("");
    setOpen(false);
    triggerRef.current?.focus();
  }

  const visibleMonthLabel = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(visibleMonth);

  return (
    <div className="date-filter" ref={rootRef}>
      <button ref={triggerRef} className="date-filter__trigger" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => open ? setOpen(false) : openCalendar()}>
        <span className={`date-filter__number${value.from ? "" : " date-filter__number--all"}`}>{label.number}</span>
        <span className="date-filter__copy"><span>{label.top}</span><span className="date-filter__month-year">{label.bottom}</span></span>
        <span className={`date-filter__trigger-chevron${open ? " date-filter__trigger-chevron--open" : ""}`} aria-hidden="true"><img src="/assets/icon-dropdown-path.svg" alt="" /></span>
      </button>
      {open ? (
        <section className="date-filter__popover" role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <div className="date-filter__popover-heading">
            <div><span className="date-filter__eyebrow">Schedule</span><h2 id={titleId}>Date range</h2></div>
            <span className="date-filter__selection-summary">Inclusive</span>
          </div>
          <div className="date-filter__range-fields">
            <button className={activeEndpoint === "from" ? "date-filter__range-field date-filter__range-field--active" : "date-filter__range-field"} type="button" onClick={() => { setActiveEndpoint("from"); setError(""); }}>
              <span>Start date</span><strong>{displayDate(draft.from)}</strong>
            </button>
            <button className={activeEndpoint === "to" ? "date-filter__range-field date-filter__range-field--active" : "date-filter__range-field"} type="button" onClick={() => { setActiveEndpoint("to"); setError(""); }}>
              <span>End date</span><strong>{displayDate(draft.to)}</strong>
            </button>
          </div>
          <div className="date-filter__month-navigation">
            <button className="date-filter__icon-button" type="button" aria-label="Previous month" onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}><img className="date-filter__arrow--left" src="/assets/icon-arrow-right.svg" alt="" /></button>
            <strong>{visibleMonthLabel}</strong>
            <button className="date-filter__icon-button" type="button" aria-label="Next month" onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}><img src="/assets/icon-arrow-right.svg" alt="" /></button>
          </div>
          <div className="date-filter__calendar" role="grid" aria-label={`${visibleMonthLabel} calendar`}>
            <div className="date-filter__weekdays" role="row">{WEEKDAYS.map((weekday) => <span role="columnheader" key={weekday}>{weekday}</span>)}</div>
            <div className="date-filter__days">
              {weeks.map((week, index) => <div className="date-filter__week" role="row" key={index}>{week.map((day) => day.inMonth ? (
                <span role="gridcell" key={day.iso}><button className={`date-filter__day${day.iso === today ? " date-filter__day--today" : ""}${day.iso === draft.from || day.iso === draft.to ? " date-filter__day--selected" : ""}${draft.from && draft.to && day.iso > draft.from && day.iso < draft.to ? " date-filter__day--in-range" : ""}`} type="button" aria-label={new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeZone: "UTC" }).format(day.date)} aria-pressed={day.iso === draft.from || day.iso === draft.to} onClick={() => selectDate(day.iso)}>{day.date.getUTCDate()}</button></span>
              ) : <span className="date-filter__empty-day" role="gridcell" aria-hidden="true" key={day.iso} />)}</div>)}
            </div>
          </div>
          {error ? <p className="date-filter__error" role="alert">{error}</p> : null}
          <div className="date-filter__quick-actions"><button type="button" onClick={chooseToday}>Today</button><button type="button" onClick={chooseAll}>All Dates</button></div>
          <div className="date-filter__actions"><button className="date-filter__action date-filter__action--secondary" type="button" onClick={() => { setDraft(value); setError(""); setOpen(false); triggerRef.current?.focus(); }}>Cancel</button><button className="date-filter__action date-filter__action--primary" type="button" onClick={apply}>Apply range</button></div>
        </section>
      ) : null}
    </div>
  );
}
