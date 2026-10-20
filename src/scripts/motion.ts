/**
 * Motion bundle — GSAP, ScrollTrigger, SplitText reveals (+ Lenis on fine
 * pointers). Layouts import this dynamically and ONLY when motion is allowed,
 * so prefers-reduced-motion visitors never download GSAP at all.
 */
import { initReveals, initHeadingReveals } from "./reveal";

export async function initMotion(): Promise<void> {
  initReveals();
  const headings = initHeadingReveals();
  // Lenis smooths mouse-wheel scrolling only; touch scrolling is native, so
  // touch-first devices skip it (and its bundle).
  if (matchMedia("(pointer: fine)").matches) {
    const { initLenis } = await import("./smooth-scroll");
    initLenis();
  }
  await headings;
}
