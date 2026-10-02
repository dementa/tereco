// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Link, { toHashHref } from './next-link';

describe('next/link shim', () => {
  it('turns app paths into hash routes, and leaves everything else', () => {
    expect(toHashHref('/library/abc')).toBe('#/library/abc');
    expect(toHashHref('#/library')).toBe('#/library');
    expect(toHashHref('https://example.com/x')).toBe('https://example.com/x');
  });

  it('renders a plain anchor without router-only props', () => {
    render(
      <Link href="/library/abc/quiz/q" prefetch={false} scroll={false} className="card">
        Quiz
      </Link>
    );
    const a = screen.getByRole('link', { name: 'Quiz' });
    expect(a.getAttribute('href')).toBe('#/library/abc/quiz/q');
    expect(a.getAttribute('class')).toBe('card');
    expect(a.hasAttribute('prefetch')).toBe(false);
  });
});
