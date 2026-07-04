"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

// Frictionless task creation: the "+ Tarea" affordance turns into a text field
// in place. Type a name, press Enter to add it (the field stays open so you can
// keep adding), Escape or clicking away closes it. No modal, no round-trip.

interface InlineAddTaskProps {
  onAdd: (title: string) => void;
  /** Classes for the collapsed trigger — matches the surrounding surface. */
  triggerClassName: string;
  /** Classes for the expanded input — echo the trigger's shape. */
  inputClassName: string;
  /** Trigger label; omit for an icon-only trigger. */
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
}

export function InlineAddTask({
  onAdd,
  triggerClassName,
  inputClassName,
  label,
  ariaLabel,
  placeholder = "Nombre de la tarea…",
}: InlineAddTaskProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const title = value.trim();
    if (title) onAdd(title);
    setValue("");
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={ariaLabel ?? label ?? "Añadir tarea"}
        className={triggerClassName}
      >
        <Plus className={label ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {label}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      // Belt and braces with the focus effect: the field must be ready to
      // type the instant it appears — click "+", write, Enter.
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          // Stay open (and focused) so several tasks can be added in a row.
        } else if (event.key === "Escape") {
          event.preventDefault();
          setValue("");
          setEditing(false);
        }
      }}
      onBlur={() => {
        commit();
        setEditing(false);
      }}
      placeholder={placeholder}
      aria-label={ariaLabel ?? "Nombre de la tarea"}
      className={inputClassName}
    />
  );
}
