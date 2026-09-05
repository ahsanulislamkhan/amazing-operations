"use client";

import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";

type TaskFilterSelectProps = {
  label: string;
  value?: string;
  defaultValue?: string;
  options: Array<string | { value: string; label: string }>;
  onChange?: (value: string) => void;
  name?: string;
  required?: boolean;
};

export default function TaskFilterSelect({ label, value, defaultValue, options, onChange, name, required }: TaskFilterSelectProps) {
  const normalizedOptions = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? normalizedOptions[0]?.value ?? "");
  const selectedValue = value ?? uncontrolledValue;
  const selectedLabel = normalizedOptions.find((option) => option.value === selectedValue)?.label ?? selectedValue;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, normalizedOptions.findIndex((option) => option.value === selectedValue)));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function choose(option: string) {
    if (value === undefined) setUncontrolledValue(option);
    onChange?.(option);
    setActiveIndex(normalizedOptions.findIndex((item) => item.value === option));
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (!open) return;
      event.preventDefault();
      choose(normalizedOptions[activeIndex].value);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) {
      setActiveIndex(Math.max(0, normalizedOptions.findIndex((option) => option.value === selectedValue)));
      setOpen(true);
      return;
    }
    setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + normalizedOptions.length) % normalizedOptions.length);
  }

  return (
    <div className={`task-filter-select${open ? " is-open" : ""}`} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
      <button
        ref={triggerRef}
        className="task-filter-select__trigger"
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-required={required || undefined}
        onClick={() => {
          setActiveIndex(Math.max(0, normalizedOptions.findIndex((option) => option.value === selectedValue)));
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedLabel}</span>
        <img src="/assets/icon-dropdown-path.svg" alt="" />
      </button>
      {open ? (
        <div className="task-filter-select__menu" id={listboxId} role="listbox" aria-label={label}>
          {normalizedOptions.map((option, index) => (
            <button
              className={`${option.value === selectedValue ? "is-selected" : ""}${index === activeIndex ? " is-active" : ""}`}
              type="button"
              role="option"
              aria-selected={option.value === selectedValue}
              key={option.value}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => choose(option.value)}
            >
              <span className="task-filter-select__check" aria-hidden="true">{option.value === selectedValue ? "✓" : ""}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
