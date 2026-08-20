// @vitest-environment jsdom

/**
 * useRouter()'s returned object must be referentially stable across renders.
 *
 * It wasn't: push/replace were individually memoized but the object wrapping
 * them was a fresh literal every render. AssessmentTake's countdown depends
 * on it (through submitAnswers), so an unstable router reset the countdown to
 * its starting value on every render — the timer looked frozen, because it
 * was recomputing back to the same anchor point faster than the display could
 * show it move. This asserts the property whose absence caused that.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRouter } from './next-navigation';

describe('useRouter', () => {
  it('returns the same object across re-renders', () => {
    const { result, rerender } = renderHook(() => useRouter());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('stays stable across many renders, not just one', () => {
    const { result, rerender } = renderHook(() => useRouter());
    const first = result.current;

    for (let i = 0; i < 5; i++) rerender();

    expect(result.current).toBe(first);
  });
});
