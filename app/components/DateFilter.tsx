"use client";

import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DateRange } from "@/lib/operations/types";
import "./date-filter.css";

export type DateFilterProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  mode?: "range" | "single";
  name?: string;
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

export default function DateFilter({ value, onChange, mode = "range", name }: DateFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [activeEndpoint, setActiveEndpoint] = useState<RangeEndpoint>("from");
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromIso(value.from ?? value.to ?? todayInMelbourne()));
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const [error, setError] = useState("");
  const [focusDate, setFocusDate] = useState(value.from ?? todayInMelbourne());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const label = labelForRange(value);
  const weeks = useMemo(() => calendarWeeks(visibleMonth), [visibleMonth]);
  const today = todayInMelbourne();

  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || window.innerWidth <= 700) {
      setPopoverStyle({});
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const availableBelow = Math.max(240, window.innerHeight - rect.bottom - margin * 2);
    const availableAbove = Math.max(240, rect.top - margin * 2);
    const openAbove = availableBelow < 500 && availableAbove > availableBelow;
    setPopoverStyle(openAbove
      ? { position: "fixed", top: "auto", right: Math.max(margin, window.innerWidth - rect.right), bottom: window.innerHeight - rect.top + margin, maxHeight: Math.min(590, availableAbove) }
      : { position: "fixed", top: rect.bottom + margin, right: Math.max(margin, window.innerWidth - rect.right), bottom: "auto", maxHeight: Math.min(590, availableBelow) });
  }, []);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", close);
    const focusFrame = window.requestAnimationFrame(() => {
      const root = rootRef.current;
      (root?.querySelector<HTMLButtonElement>(".date-filter__day--selected") ?? root?.querySelector<HTMLButtonElement>(".date-filter__day--today") ?? root?.querySelector<HTMLButtonElement>(".date-filter__day"))?.focus();
    });
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
    };
  }, [open, positionPopover]);

  function openCalendar() {
    setDraft(value);
    setActiveEndpoint(value.from && !value.to ? "to" : "from");
    setVisibleMonth(monthFromIso(value.from ?? value.to ?? today));
    setFocusDate(value.from ?? value.to ?? today);
    setError("");
    positionPopover();
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
    if (mode === "single") { setDraft({ from: iso, to: iso }); return; }
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

  function moveCalendarFocus(event: ReactKeyboardEvent<HTMLButtonElement>, iso: string) {
    const date = dateFromIso(iso);
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -date.getUTCDay(), End: 6 - date.getUTCDay() };
    if (event.key in offsets) date.setUTCDate(date.getUTCDate() + offsets[event.key]);
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const day = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1));
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, lastDay));
    } else return;
    event.preventDefault();
    const next = isoFromDate(date);
    setFocusDate(next);
    setVisibleMonth(monthFromIso(next));
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  }

  function chooseToday() {
    if (mode === "single") { setDraft({ from: today, to: today }); setVisibleMonth(monthFromIso(today)); return; }
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
    <div className={`date-filter${mode === "single" ? " date-filter--single" : ""}`} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value.from ?? ""} /> : null}
      <button ref={triggerRef} className="date-filter__trigger" type="button" aria-label={mode === "single" ? `Schedule date: ${displayDate(value.from)}` : undefined} aria-haspopup="dialog" aria-expanded={open} onClick={() => open ? setOpen(false) : openCalendar()}>
        {mode === "single" ? <><span>{displayDate(value.from)}</span><img className="schedule-calendar-icon" src="/assets/icon-calendar.svg" alt="" /></> : <>
        <span className={`date-filter__number${value.from ? "" : " date-filter__number--all"}`}>{label.number}</span>
        <span className="date-filter__copy"><span>{label.top}</span><span className="date-filter__month-year">{label.bottom}</span></span>
        <span className={`date-filter__trigger-chevron${open ? " date-filter__trigger-chevron--open" : ""}`} aria-hidden="true"><img src="/assets/icon-dropdown-path.svg" alt="" /></span>
        </>}
      </button>
      {open ? (
        <section className="date-filter__popover" style={popoverStyle} role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <div className="date-filter__body">
            <div className="date-filter__popover-heading">
              <div><span className="date-filter__eyebrow">Schedule</span><h2 id={titleId}>{mode === "single" ? "Schedule date" : "Date range"}</h2></div>
              <span className="date-filter__selection-summary">{mode === "single" ? displayDate(draft.from) : "Inclusive"}</span>
            </div>
            {mode === "range" ? <div className="date-filter__range-fields">
              <button className={activeEndpoint === "from" ? "date-filter__range-field date-filter__range-field--active" : "date-filter__range-field"} type="button" onClick={() => { setActiveEndpoint("from"); setError(""); }}>
                <span>Start date</span><strong>{displayDate(draft.from)}</strong>
              </button>
              <button className={activeEndpoint === "to" ? "date-filter__range-field date-filter__range-field--active" : "date-filter__range-field"} type="button" onClick={() => { setActiveEndpoint("to"); setError(""); }}>
                <span>End date</span><strong>{displayDate(draft.to)}</strong>
              </button>
            </div> : null}
            <div className="date-filter__month-navigation">
              <button className="date-filter__icon-button" type="button" aria-label="Previous month" onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}><img className="date-filter__arrow--left" src="/assets/icon-arrow-right.svg" alt="" /></button>
              <strong>{visibleMonthLabel}</strong>
              <button className="date-filter__icon-button" type="button" aria-label="Next month" onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}><img src="/assets/icon-arrow-right.svg" alt="" /></button>
            </div>
            <div className="date-filter__calendar" role="grid" aria-label={`${visibleMonthLabel} calendar`}>
              <div className="date-filter__weekdays" role="row">{WEEKDAYS.map((weekday) => <span role="columnheader" key={weekday}>{weekday}</span>)}</div>
              <div className="date-filter__days">
                {weeks.map((week, index) => <div className="date-filter__week" role="row" key={index}>{week.map((day) => day.inMonth ? (
                  <span role="gridcell" key={day.iso}><button className={`date-filter__day${day.iso === today ? " date-filter__day--today" : ""}${day.iso === draft.from || day.iso === draft.to ? " date-filter__day--selected" : ""}${draft.from && draft.to && day.iso > draft.from && day.iso < draft.to ? " date-filter__day--in-range" : ""}`} type="button" data-date={day.iso} tabIndex={day.iso === focusDate || (!weeks.flat().some((candidate) => candidate.inMonth && candidate.iso === focusDate) && day.date.getUTCDate() === 1) ? 0 : -1} onFocus={() => setFocusDate(day.iso)} onKeyDown={(event) => moveCalendarFocus(event, day.iso)} aria-label={new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeZone: "UTC" }).format(day.date)} aria-pressed={day.iso === draft.from || day.iso === draft.to} onClick={() => selectDate(day.iso)}>{day.date.getUTCDate()}</button></span>
                ) : <span className="date-filter__empty-day" role="gridcell" aria-hidden="true" key={day.iso} />)}</div>)}
              </div>
            </div>
            {error ? <p className="date-filter__error" role="alert">{error}</p> : null}
            <div className="date-filter__quick-actions"><button type="button" onClick={chooseToday}>Today</button>{mode === "range" ? <button type="button" onClick={chooseAll}>All Dates</button> : null}</div>
          </div>
          <div className="date-filter__actions"><button className="date-filter__action date-filter__action--secondary" type="button" onClick={() => { setDraft(value); setError(""); setOpen(false); triggerRef.current?.focus(); }}>Cancel</button><button className="date-filter__action date-filter__action--primary" type="button" onClick={apply}>Done</button></div>
        </section>
      ) : null}
    </div>
  );
}
