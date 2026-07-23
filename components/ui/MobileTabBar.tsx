'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type TabItem = {
  href: string;
  label: string;
  /** Shorter label for the tight tab-bar slot; falls back to `label`. */
  short?: string;
  icon: LucideIcon;
  exact?: boolean;
};

type MobileTabBarProps = {
  /** Core tabs, always visible. */
  tabs: TabItem[];
  /** Extra links tucked behind the "More" tab. */
  moreItems?: TabItem[];
  onSignOut: () => void;
};

export function MobileTabBar({ tabs, moreItems = [], onSignOut }: MobileTabBarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const isActive = (item: TabItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const moreActive = moreItems.some(isActive);

  return (
    <>
      {moreOpen && <div className="fixed inset-0 z-40 bg-black/20 md:hidden" aria-hidden="true" />}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-bg-card border-t border-primary-100 pb-[env(safe-area-inset-bottom)]">
        {moreOpen && (
          <div
            ref={panelRef}
            className="absolute bottom-full left-0 right-0 bg-bg-card border-t border-primary-100 rounded-t-2xl shadow-lg py-2 max-h-[60vh] overflow-y-auto"
          >
            {moreItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 text-sm ${
                    active ? 'text-primary-700 font-medium' : 'text-text-secondary'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => {
                setMoreOpen(false);
                onSignOut();
              }}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-error"
            >
              <LogOut className="w-4.5 h-4.5" /> Sign out
            </button>
          </div>
        )}

        <div className="flex items-stretch">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] leading-tight ${
                  active ? 'text-primary-700' : 'text-text-secondary'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.short ?? item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] leading-tight ${
              moreActive || moreOpen ? 'text-primary-700' : 'text-text-secondary'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            More
          </button>
        </div>
      </nav>
    </>
  );
}
