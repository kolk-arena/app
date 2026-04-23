'use client';

import { useEffect, useState } from 'react';

type TypewriterQuoteProps = {
  text: string;
  isActive: boolean;
  speedMs?: number;
  className?: string;
};

/**
 * SSR/CSR hydration-safe typewriter.
 *
 * `prefers-reduced-motion` is a browser-only media query. Reading it during
 * render would return `false` on the server (no `window`) and possibly `true`
 * on the client, which caused a hydration mismatch (React dropped the
 * server tree and shifted layout on reduced-motion devices). We now
 * initialise `reduceMotion` to `false` so SSR and first-CSR-render agree,
 * then update inside `useEffect` once `window.matchMedia` is available.
 * Reduced-motion users see one frame of empty text before it snaps to full —
 * cheaper than a hydration restart. The media-query change is also wired
 * so toggling the OS setting mid-session updates live.
 */
export function TypewriterQuote({
  text,
  isActive,
  speedMs = 30,
  className = '',
}: TypewriterQuoteProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [visibleCount, setVisibleCount] = useState(() => (isActive ? 0 : text.length));
  const isTyping = isActive && !reduceMotion && visibleCount < text.length;

  // Sync the motion preference after mount — no-op on SSR.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // If the user prefers reduced motion, snap to the full text immediately
  // after the first client render. This is idempotent for repeat mounts.
  useEffect(() => {
    if (reduceMotion) {
      setVisibleCount(text.length);
    }
  }, [reduceMotion, text.length]);

  // Reset the typing position when the source text actually changes. The
  // slider parent remounts this component on (level, scenarioTitle) key
  // flips, but a same-mount text change (e.g. locale switch that swaps
  // `requestContext` while keeping the active slot) would otherwise
  // leave `visibleCount` pointing at the previous string's length and
  // freeze the animation. Depends on `text` only so `isActive` /
  // `reduceMotion` state transitions don't also reset.
  useEffect(() => {
    setVisibleCount(isActive && !reduceMotion ? 0 : text.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reset ONLY when `text` changes
  }, [text]);

  useEffect(() => {
    if (!isActive || reduceMotion || visibleCount >= text.length) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      setVisibleCount((count) => Math.min(text.length, count + 1));
    }, speedMs);
    return () => window.clearTimeout(timeout);
  }, [isActive, reduceMotion, speedMs, text.length, visibleCount]);

  const visibleText = isActive && !reduceMotion ? text.slice(0, visibleCount) : text;
  const remainingText = isActive && !reduceMotion ? text.slice(visibleCount) : '';

  return (
    <p className={className} aria-live="off">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {visibleText}
        {isTyping && (
          <span className="ml-[1px] inline-block h-[1em] w-[2px] animate-pulse bg-slate-950 align-middle" />
        )}
        {remainingText && <span className="invisible select-none">{remainingText}</span>}
      </span>
    </p>
  );
}
