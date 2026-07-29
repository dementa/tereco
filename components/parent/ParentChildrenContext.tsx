'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface LinkedChild {
  id: string;
  systemId: string | null;
  name: string;
  relationship: string | null;
  isPrimary: boolean;
  className: string | null;
}

interface ParentChildrenValue {
  children: LinkedChild[];
  loading: boolean;
  selectedId: string | null;
  selectChild: (id: string) => void;
}

const ParentChildrenContext = createContext<ParentChildrenValue | null>(null);

/**
 * Loads the caller's linked children once and keeps the selected child in the
 * `?child=` query param — so a link into e.g. /parent/results carries which
 * child it's about, and switching children is just a dropdown, not a
 * separate fetch per page.
 */
export function ParentChildrenProvider({ children: nodes }: { children: React.ReactNode }) {
  const [linkedChildren, setLinkedChildren] = useState<LinkedChild[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlChildId = searchParams.get('child');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/parent/children');
        const data = await res.json();
        if (!cancelled && data.success) setLinkedChildren(data.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedId = useMemo(() => {
    if (urlChildId && linkedChildren.some((c) => c.id === urlChildId)) return urlChildId;
    return linkedChildren[0]?.id ?? null;
  }, [urlChildId, linkedChildren]);

  // Once children load, put the default selection in the URL so it's shareable.
  useEffect(() => {
    if (!loading && selectedId && selectedId !== urlChildId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('child', selectedId);
      router.replace(`${pathname}?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selectedId, urlChildId, pathname]);

  function selectChild(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('child', id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <ParentChildrenContext.Provider value={{ children: linkedChildren, loading, selectedId, selectChild }}>
      {nodes}
    </ParentChildrenContext.Provider>
  );
}

export function useParentChildren(): ParentChildrenValue {
  const ctx = useContext(ParentChildrenContext);
  if (!ctx) throw new Error('useParentChildren must be used within ParentChildrenProvider');
  return ctx;
}
