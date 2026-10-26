/**
 * Same-page anchor handling — tiny, dependency-free, loaded on every page.
 *
 * Header clearance comes from each target's CSS scroll-margin-top (the single
 * source of anchor offset). Without Lenis (touch devices, reduced motion) the
 * browser scrolls natively (html { scroll-behavior: smooth } handles easing).
 * When Lenis is running (desktop, motion allowed) it registers itself via
 * setLenis() and anchor clicks hand off to it.
 */
import type Lenis from "lenis";

let lenis: Lenis | null = null;

/** Called by smooth-scroll.ts once Lenis is up. */
export function setLenis(instance: Lenis): void {
  lenis = instance;
}

const stripSlash = (p: string) => p.replace(/\/+$/, "") || "/";

/**
 * Resolve a link to a same-page fragment. Handles both bare hashes ("#id") and
 * absolute-path hashes ("/path#id") when the path matches the current page.
 */
function samePageHash(link: HTMLAnchorElement): string | null {
  const href = link.getAttribute("href");
  if (!href) return null;
  if (href.startsWith("#")) return href === "#" ? null : href;
  try {
    const url = new URL(link.href, location.href);
    if (
      stripSlash(url.pathname) === stripSlash(location.pathname) &&
      url.hash &&
      url.hash !== "#"
    ) {
      return url.hash;
    }
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}

/** Document scroll position that lands `el` per its scroll-margin-top,
 *  computed from the real scroll offset (window.scrollY). */
export function anchorY(el: HTMLElement): number {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return el.getBoundingClientRect().top + window.scrollY - margin;
}

function wireAnchors(): void {
  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement)?.closest?.("a[href]") as
      | HTMLAnchorElement
      | null;
    if (!link) return;
    const hash = samePageHash(link);
    if (!hash) return;
    const target = document.querySelector<HTMLElement>(hash);
    if (!target) return; // let the browser handle non-existent targets
    e.preventDefault();
    if (lenis) {
      // Sync Lenis to the real scroll position first (it can lag behind a
      // native scroll that hasn't reached it yet), then scroll to an absolute
      // target — never one computed from Lenis' own remembered position.
      lenis.scrollTo(window.scrollY, { immediate: true, force: true });
      lenis.scrollTo(anchorY(target));
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    history.pushState(null, "", hash);
    // preventDefault() also cancelled the browser's own focus move, so move
    // keyboard focus to the target too — otherwise a skip link (or "#enquire")
    // scrolls but the next Tab starts back at the top of the page.
    if (!target.matches("a[href], button, input, select, textarea, [tabindex]")) {
      target.setAttribute("tabindex", "-1");
      target.dataset.anchorFocus = "";
    }
    target.focus({ preventScroll: true });
  });
}

/** Arriving with a hash: land on it (clear of the header via scroll-margin). */
function honorInitialHash(): void {
  if (!location.hash) return;
  let target: HTMLElement | null = null;
  try {
    target = document.querySelector<HTMLElement>(location.hash);
  } catch {
    return; // not a valid selector
  }
  if (!target) return;
  requestAnimationFrame(() => target!.scrollIntoView({ block: "start" }));
}

export function initAnchors(): void {
  wireAnchors();
  honorInitialHash();
}
