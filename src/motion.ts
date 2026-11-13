import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** True when the person has asked their system for less motion. Every animation here checks it. */
export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** What `countTo` writes to and reads the clock from, so the animation can be driven in a test. */
export type CountHost = {
  requestAnimationFrame: (callback: (now: number) => void) => number;
  cancelAnimationFrame: (handle: number) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
  now: () => number;
  reducedMotion: () => boolean;
};

const browserHost: CountHost = {
  requestAnimationFrame: (callback) => requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => cancelAnimationFrame(handle),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
  now: () => performance.now(),
  reducedMotion: prefersReducedMotion
};

/**
 * Counts `element` from `from` to `to`, and returns the function that stops it.
 *
 * Separate from the hook on purpose: the hook is React's half -- a ref, an effect, a cleanup --
 * and this is the animation. Driven with a `host`, the whole thing can be played out against a
 * fake clock, which is how the gate measures where it stops rather than waiting to see.
 */
export function countTo(
  element: { textContent: string | null },
  from: number,
  to: number,
  format: (value: number) => string,
  durationMs = 750,
  host: CountHost = browserHost
): () => void {
  const show = (next: number) => {
    element.textContent = format(next);
  };
  if (host.reducedMotion() || from === to) {
    show(to);
    return () => {};
  }

  let frame = 0;
  let settled = false;
  const start = host.now();
  const tick = (now: number) => {
    const progress = Math.min((now - start) / durationMs, 1);
    // In-between frames move in whole rupees (no flickering paise); the last frame is exact.
    const current = from + (to - from) * easeOutExpo(progress);
    show(progress < 1 ? Math.round(current / 100) * 100 : to);
    if (progress < 1) {
      frame = host.requestAnimationFrame(tick);
    } else {
      settled = true;
    }
  };
  show(from);
  frame = host.requestAnimationFrame(tick);

  /*
   * A page that is not being painted gets no animation frames, and a browser does not always
   * admit this: visibilityState can read "visible" while requestAnimationFrame is suspended,
   * which leaves the figure frozen on its first frame -- a balance of three lakh showing as
   * zero. The timer is the floor under that: a little past the animation's own length, whatever
   * the frames did or did not do, the figure shows its real value.
   */
  const floor = host.setTimeout(() => {
    if (!settled) {
      host.cancelAnimationFrame(frame);
      show(to);
    }
  }, durationMs + 300);

  return () => {
    host.clearTimeout(floor);
    host.cancelAnimationFrame(frame);
    show(to);
  };
}

/**
 * Counts the number shown in `ref` from its previous value to `value` (from 0 on first paint),
 * so a changed figure is noticed. It writes text straight to the element on each frame; React
 * never re-renders per frame, and the element must have no React-managed children.
 */
export function useCountUp(
  /* HTMLElement or SVGElement: the figure in the middle of a ring is an SVG <text>. */
  ref: RefObject<HTMLElement | SVGElement | null>,
  value: number,
  format: (value: number) => string,
  durationMs = 750
) {
  const previous = useRef<number | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const from = previous.current ?? 0;
    previous.current = value;
    return countTo(element, from, value, (next) => formatRef.current(next), durationMs);
  }, [ref, value, durationMs]);
}

/**
 * Panels that start below the fold stay parked until they scroll into view, then rise into place,
 * so a long page reads top to bottom. Re-arms when `key` changes (a new page). Nothing is hidden
 * under reduced motion or without IntersectionObserver.
 */
export function useScrollReveal(containerRef: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;

    let observer: IntersectionObserver | null = null;
    // Let the page's own entrance and first data render settle before measuring positions.
    const timer = window.setTimeout(() => {
      const fold = window.innerHeight;
      const targets = [...root.querySelectorAll<HTMLElement>(".panel")].filter(
        (element) => element.getBoundingClientRect().top > fold
      );
      if (targets.length === 0) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const element = entry.target as HTMLElement;
            element.classList.remove("reveal-pending");
            element.classList.add("revealed");
            observer?.unobserve(element);
          }
        },
        { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
      );
      for (const element of targets) {
        element.classList.add("reveal-pending");
        observer.observe(element);
      }
    }, 420);

    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      root.querySelectorAll(".reveal-pending").forEach((element) => element.classList.remove("reveal-pending"));
    };
  }, [containerRef, key]);
}
