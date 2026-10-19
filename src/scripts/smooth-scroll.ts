import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

/**
 * Smooth scroll (Lenis) wired into the GSAP ticker so ScrollTrigger stays in
 * sync for later entrance reveals. Skipped entirely under reduced-motion.
 */
// Anchor offset: the target's CSS scroll-margin-top is the single source of
// header clearance. Lenis' scrollTo(element) already subtracts it (as do native
// scrollIntoView and no-JS hash jumps), so no extra offset is passed here —
// adding one on top would double the gap.

export function initSmoothScroll(): void {
  if (prefersReducedMotion) {
    // Native smooth scroll; header clearance comes from scroll-margin-top.
    wireAnchors(null);
    return;
  }

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

  wireAnchors(lenis);
  honorInitialHash(lenis);
}

/**
 * Resolve a link to a same-page fragment. Handles both bare hashes ("#id") and
 * absolute-path hashes ("/#id" or "/path#id") when the path matches the current
 * page — so e.g. the header "Jingo" link (/#jingo) scrolls smoothly on the
 * homepage but navigates normally from another page.
 */
function samePageHash(link: HTMLAnchorElement): string | null {
  const href = link.getAttribute("href");
  if (!href) return null;
  if (href.startsWith("#")) return href === "#" ? null : href;
  try {
    const url = new URL(link.href, location.href);
    if (url.pathname === location.pathname && url.hash && url.hash !== "#") {
      return url.hash;
    }
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}

/** Smooth-scroll same-page hash links (header clearance via scroll-margin). */
function wireAnchors(lenis: Lenis | null): void {
  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement)?.closest?.("a[href]") as
      | HTMLAnchorElement
      | null;
    if (!link) return;
    const hash = samePageHash(link);
    if (!hash) return;
    const target = document.querySelector(hash);
    if (!target) return; // let the browser handle non-existent targets
    e.preventDefault();
    if (lenis) {
      lenis.scrollTo(target as HTMLElement);
    } else {
      (target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
    }
    history.pushState(null, "", hash);
  });
}

/** Arriving with a hash (e.g. from "/#jingo" on another page): land on it
 *  (clear of the header via scroll-margin), without an animated scroll. */
function honorInitialHash(lenis: Lenis | null): void {
  if (!location.hash) return;
  const target = document.querySelector(location.hash);
  if (!target) return;
  requestAnimationFrame(() => {
    if (lenis) {
      lenis.scrollTo(target as HTMLElement, { immediate: true });
    } else {
      (target as HTMLElement).scrollIntoView({ block: "start" });
    }
  });
}
