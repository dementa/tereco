'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

interface PromoSlide {
  id: string;
  kind: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
}

/** How long a slide holds before the next one comes round. */
const ADVANCE_MS = 7000;

/**
 * The dashboard promo strip.
 *
 * Built on native CSS scroll-snap rather than a transform-driven slider or a
 * gesture library. Swipe, momentum, keyboard scrolling and screen-reader
 * traversal all come free and behave the way the platform does, which matters
 * more here than anywhere else in TERECO: these are ten-year-olds on shared
 * school machines and mid-range phones.
 *
 * Auto-advance is a real accessibility hazard — content that moves under a
 * reader who has not finished the sentence. Three things keep it honest:
 * it stops permanently the moment the learner touches the control, it never
 * starts at all under prefers-reduced-motion, and it pauses while the tab is
 * hidden. There is always a manual way to every slide.
 */
export function PromoCarousel({ slides }: { slides: PromoSlide[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // Set once the learner scrolls, swipes, or presses anything. Auto-advance
  // never resumes: taking the wheel back off someone is worse than not
  // advancing at all.
  const [userTookOver, setUserTookOver] = useState(false);

  const scrollTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[i] as HTMLElement | undefined;
    if (child) track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
  }, []);

  // Which slide is actually in view, read from scroll position rather than
  // tracked in state — a swipe moves the scroller without going through us,
  // and the dots must follow the content, not our idea of it.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Nearest child by actual offset, not scrollLeft / width. The track has
        // a gap between slides, so every slide sits a little further along than
        // its index times the width — dividing drifts, and the dots would stop
        // agreeing with the content on a narrow screen.
        const children = Array.from(track.children) as HTMLElement[];
        let nearest = 0;
        let best = Infinity;
        children.forEach((child, i) => {
          const distance = Math.abs(child.offsetLeft - track.scrollLeft);
          if (distance < best) {
            best = distance;
            nearest = i;
          }
        });
        setIndex(nearest);
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (userTookOver || slides.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = setInterval(() => {
      // Nothing to see on a hidden tab, and advancing there just means the
      // learner returns to a slide they never saw start.
      if (document.hidden) return;
      setIndex((i) => {
        const next = (i + 1) % slides.length;
        scrollTo(next);
        return next;
      });
    }, ADVANCE_MS);

    return () => clearInterval(timer);
  }, [userTookOver, slides.length, scrollTo]);

  // An empty strip is worse than no strip: it takes the same space above the
  // fold and says nothing.
  if (slides.length === 0) return null;

  const takeOver = () => setUserTookOver(true);
  const step = (delta: number) => {
    takeOver();
    scrollTo(Math.min(Math.max(index + delta, 0), slides.length - 1));
  };

  return (
    <section aria-label="Suggestions for you" className="relative">
      <div
        ref={trackRef}
        onPointerDown={takeOver}
        onKeyDown={takeOver}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide) => (
          <div key={slide.id} className="snap-start shrink-0 w-full">
            <Link
              href={slide.href}
              onClick={takeOver}
              className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
            >
              <div className="rounded-2xl border border-primary-200 bg-primary-100 p-5 sm:p-6 h-full">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden />
                  {slide.eyebrow}
                </p>
                <p className="text-lg sm:text-xl font-bold text-primary-900 mt-1.5 break-words">
                  {slide.title}
                </p>
                <p className="text-sm text-primary-800/80 mt-1">{slide.body}</p>
                <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-primary-700">
                  {slide.ctaLabel}
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </span>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-between mt-2.5">
          {/*
            Dots are buttons, not decoration: on a phone the arrows are the
            wrong target size for a child and swiping is the real control, but
            a learner who cannot swipe reliably still needs a way through.
          */}
          <div className="flex gap-1.5">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => {
                  takeOver();
                  scrollTo(i);
                }}
                aria-label={`Show suggestion ${i + 1} of ${slides.length}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all ${
                  i === index ? 'w-5 bg-primary-700' : 'w-2 bg-primary-200 hover:bg-primary-400'
                }`}
              />
            ))}
          </div>

          {/* Hidden on touch widths, where swiping is the natural control. */}
          <div className="hidden sm:flex gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={index === 0}
              aria-label="Previous suggestion"
              className="p-1.5 rounded-lg text-text-muted hover:text-primary-900 hover:bg-bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={index === slides.length - 1}
              aria-label="Next suggestion"
              className="p-1.5 rounded-lg text-text-muted hover:text-primary-900 hover:bg-bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
