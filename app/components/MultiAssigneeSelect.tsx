"use client";

import { useEffect, useId, useRef, useState } from "react";

export type AssigneeOption = { id: string; name: string };

export default function MultiAssigneeSelect({ options, selectedIds, onChange }: { options: AssigneeOption[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selected = options.filter((option) => selectedIds.includes(option.id));
  const label = selected.length === 0 ? "Select team members" : selected.length === 1 ? selected[0].name : `${selected.length} team members`;

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]);
  }

  return (
    <div className="multi-assignee" ref={rootRef}>
      {selectedIds.map((id) => <input type="hidden" name="assigneeIds" value={id} key={id} />)}
      <button ref={buttonRef} className="multi-assignee__trigger" type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} onClick={() => setOpen((current) => !current)}>
        <span className={selected.length ? "" : "multi-assignee__placeholder"}>{label}</span><img src="/assets/icon-dropdown-path.svg" alt="" />
      </button>
      {open ? (
        <div className="multi-assignee__menu" id={listboxId} role="listbox" aria-multiselectable="true">
          {options.length ? options.map((option) => {
            const checked = selectedIds.includes(option.id);
            return <button className="multi-assignee__option" type="button" role="option" aria-selected={checked} key={option.id} onClick={() => toggle(option.id)}><span className={`multi-assignee__check${checked ? " multi-assignee__check--selected" : ""}`} aria-hidden="true">{checked ? "✓" : ""}</span><span>{option.name}</span></button>;
          }) : <p className="multi-assignee__empty">No active team members have access to this warehouse.</p>}
        </div>
      ) : null}
    </div>
  );
}
