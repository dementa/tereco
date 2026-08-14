'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface DropdownMenuItem {
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  /** Renders in red — for destructive actions. */
  danger?: boolean;
  disabled?: boolean;
  /** Draws a divider above this item. */
  separatorBefore?: boolean;
}

/**
 * A "⋯" overflow menu — the one row-action affordance, replacing strips of
 * unlabelled icon buttons. Rendered through a portal with fixed positioning:
 * the DataTable wraps its rows in `overflow-x-auto`, which would clip an
 * absolutely-positioned menu, so the menu lives on document.body and is
 * pinned to the trigger's rect (flipping above when there's no room below).
 */
export function DropdownMenu({
  items,
  label = 'Actions',
  triggerClassName,
  icon: Icon = MoreHorizontal,
}: {
  items: DropdownMenuItem[];
  label?: string;
  /**
   * Overrides the bare icon-button trigger. Row menus want the borderless
   * default; a menu sitting in a toolbar next to real buttons needs a border
   * and their height, or the row stops reading as one row.
   */
  triggerClassName?: string;
  /** Swaps the trigger glyph — cards read as "⋮" (vertical), table rows as "⋯" (horizontal). */
  icon?: React.ElementType;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const estHeight = items.length * 40 + 12;
      const below = b.bottom + 4;
      const top = below + estHeight > window.innerHeight ? Math.max(8, b.top - estHeight - 4) : below;
      setCoords({ top, right: Math.max(8, window.innerWidth - b.right) });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={
          triggerClassName ??
          `inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#171717] ${
            open ? 'bg-[#F5F5F5] text-[#171717]' : ''
          }`
        }
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 95 }}
            className="w-52 rounded-xl border border-[#E0E0E0] bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, i) => (
              <div key={`${item.label}-${i}`}>
                {item.separatorBefore && <div className="my-1 h-px bg-[#EAEAEA]" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                    item.danger ? 'text-[#C0392B] hover:bg-[#FDECEA]' : 'text-[#404040] hover:bg-[#F5F5F5]'
                  }`}
                >
                  {item.icon && <item.icon className="h-4 w-4 shrink-0" aria-hidden />}
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
