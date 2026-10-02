/**
 * Stand-in for `next/link` inside the Electron renderer, alongside the
 * next-navigation shim and for the same reason: shared web components (the
 * Library's cards, breadcrumb and quiz links) import it, and there is no
 * Next.js runtime here.
 *
 * The desktop routes by hash (`#/library/<id>`), so an app path becomes a hash
 * link; the hash router picks the change up. Anything else — a full URL, an
 * existing hash — is left alone.
 */

import { forwardRef, type AnchorHTMLAttributes } from 'react';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  // Accepted and ignored: they mean nothing without Next's router.
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
};

export function toHashHref(href: string): string {
  return href.startsWith('/') ? `#${href}` : href;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  const { href, ...rest } = props;
  // Router-only props must not reach the DOM as unknown attributes.
  delete rest.prefetch;
  delete rest.replace;
  delete rest.scroll;
  return <a ref={ref} href={toHashHref(href)} {...rest} />;
});

export default Link;
