'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Extra path prefixes that also count as "on this item" — defaults to just `href`. */
  activePrefixes?: string[];
};

type MobileNavDrawerProps = {
  /** Portal name shown in the drawer header, e.g. "TERECO Admin". */
  title: string;
  /** Usually the signed-in user's name. */
  subtitle?: string;
  items: NavItem[];
  /** Optional second group, rendered under `secondaryLabel` (admin's System block). */
  secondaryItems?: NavItem[];
  secondaryLabel?: string;
  onSignOut: () => void;
};

const linkClass = (active: boolean) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
    active ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'
  }`;

/**
 * Mobile navigation: a hamburger in the top bar that opens a left slide-in
 * drawer holding the same links as the desktop sidebar. It replaced a bottom
 * tab bar, which could not hold the longer portals' nav (admin has 6 + 7
 * items) without hiding most of it behind a "More" sheet.
 *
 * Renders the trigger button; the drawer itself is fixed-position, so this
 * can sit anywhere in the mobile header.
 */
export function MobileNavDrawer({
  title,
  subtitle,
  items,
  secondaryItems = [],
  secondaryLabel = 'System',
  onSignOut,
}: MobileNavDrawerProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Route changes come from tapping a link in here (or a back gesture) — let the
  // drawer get out of the way rather than making the user close it by hand.
  // Adjusted during render rather than in an effect so the closed drawer never
  // paints over the new page first.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      // Keep tabbing inside the sheet while it owns the screen.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : (item.activePrefixes ?? [item.href]).some((prefix) => pathname.startsWith(prefix));

  const renderLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} className={linkClass(isActive(item))}>
        <Icon className="w-4.5 h-4.5 shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls={panelId}
        className="md:hidden -ml-1 p-2 rounded-lg text-text-secondary hover:bg-bg-muted"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div
        onClick={close}
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 print:hidden ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} navigation`}
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] bg-bg-card border-r border-border shadow-xl flex flex-col transition-transform duration-200 ease-out print:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        // Fully hidden from tab order and screen readers while closed — it stays
        // mounted so the slide transition has something to animate.
        inert={!open}
      >
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <div className="w-9 h-9 rounded-lg bg-primary-700 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">TC</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary-900 truncate">{title}</p>
            {subtitle && <p className="text-xs text-text-muted truncate">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close navigation menu"
            className="p-2 -mr-1 rounded-lg text-text-muted hover:bg-bg-muted"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map(renderLink)}

          {secondaryItems.length > 0 && (
            <>
              <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-faint">
                {secondaryLabel}
              </p>
              {secondaryItems.map(renderLink)}
            </>
          )}
        </nav>

        <div className="p-3 border-t border-border pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              close();
              onSignOut();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-error hover:bg-error-bg"
          >
            <LogOut className="w-4.5 h-4.5" /> Sign out
          </button>
        </div>
      </div>
    </>
  );
}
