import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { setLenis } from "./anchors";

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth wheel scrolling (Lenis) wired into the GSAP ticker so ScrollTrigger
 * stays in sync. Loaded only from motion.ts — i.e. when motion is allowed and
 * the primary pointer is a mouse/trackpad (Lenis does nothing for touch
 * scrolling, so touch devices skip this bundle). Anchor clicks are handled by
 * anchors.ts, which hands off to this instance via setLenis().
 */
export function initLenis(): void {
  const lenis = new Lenis({
    duration: 1.1,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time: number) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  setLenis(lenis);
}
