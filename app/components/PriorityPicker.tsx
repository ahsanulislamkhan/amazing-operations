"use client";

import "./priority-picker.css";

export default function PriorityPicker({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="priority-picker" role="group" aria-label="Priority">
      <button className={!value ? "is-selected" : ""} type="button" aria-pressed={!value} onClick={() => onChange(false)}>Normal</button>
      <button className={value ? "is-selected is-selected--high" : ""} type="button" aria-pressed={value} onClick={() => onChange(true)}>High</button>
    </div>
  );
}
