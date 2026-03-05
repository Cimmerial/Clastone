import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import './ThemedDropdown.css';

export type ThemedDropdownOption<T extends string = string> = { value: T; label: string };

type Props<T extends string = string> = {
  value: T;
  options: ThemedDropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** When set, trigger always shows this label instead of the selected option (e.g. for preset buttons). */
  triggerLabel?: string;
  id?: string;
  'aria-label'?: string;
};

type ListPosition = { top: number; left: number; minWidth: number } | null;

export function ThemedDropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  triggerLabel,
  id,
  'aria-label': ariaLabel
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [listPosition, setListPosition] = useState<ListPosition>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setListPosition(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setListPosition({
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: rect.width
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      const listId = (e.target as Element)?.closest?.('.themed-dropdown-list');
      if (listId) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const display = triggerLabel ?? selected?.label ?? placeholder;

  const handleSelect = (optValue: T) => {
    onChange(optValue);
    setOpen(false);
  };

  const listContent = listPosition && (
    <ul
      className="themed-dropdown-list themed-dropdown-list--portal"
      role="listbox"
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        top: listPosition.top,
        left: listPosition.left,
        minWidth: listPosition.minWidth
      }}
    >
      {options.map((opt) => (
        <li
          key={opt.value}
          role="option"
          aria-selected={opt.value === value}
          className={`themed-dropdown-option ${opt.value === value ? 'themed-dropdown-option--selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            handleSelect(opt.value as T);
          }}
        >
          {opt.label}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="themed-dropdown" ref={ref} id={id}>
      <button
        ref={triggerRef}
        type="button"
        className="themed-dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? display}
      >
        <span className="themed-dropdown-value">{display}</span>
        <span className="themed-dropdown-chevron" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && listContent && createPortal(listContent, document.body)}
    </div>
  );
}
