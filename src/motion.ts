import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** True when the person has asked their system for less motion. Every animation here checks it. */
export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/**
 * Counts the number shown in `ref` from its previous value to `value` (from 0 on first paint),
 * so a changed figure is noticed. It writes text straight to the element on each frame; React
 * never re-renders per frame, and the element must have no React-managed children.
 */
export function useCountUp(
  ref: RefObject<HTMLElement | null>,
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
    const show = (next: number) => {
      element.textContent = formatRef.current(next);
    };
    if (prefersReducedMotion() || from === value) {
      show(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      // In-between frames move in whole rupees (no flickering paise); the last frame is exact.
      const current = from + (value - from) * easeOutExpo(progress);
      show(progress < 1 ? Math.round(current / 100) * 100 : value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    show(from);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      show(value);
    };
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
