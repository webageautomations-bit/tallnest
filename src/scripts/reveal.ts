import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// Shared timing tokens so the whole page animates with one rhythm.
const EASE = "power3.out";

/**
 * Restrained, on-scroll entrance reveals for supporting elements
 * (eyebrows, paragraphs, cards, stats) — a simple fade + rise.
 *
 *   [data-reveal]                 — single element that rises + fades in.
 *   [data-reveal-group] +         — container whose [data-reveal-item]
 *     [data-reveal-item]            children stagger in when it enters view.
 *
 * Under prefers-reduced-motion nothing is hidden or animated.
 */
export function initReveals(): void {
  if (prefersReducedMotion) return;

  // fromTo (explicit visible end state) so the CSS first-paint pre-hide
  // (html.reveal-active [data-reveal]{opacity:0}) can never leave an element
  // stuck hidden — GSAP always animates it back to autoAlpha:1.
  gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 24 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.6,
        ease: EASE,
        scrollTrigger: { trigger: el, start: "top 85%" },
      },
    );
  });

  gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
    const items = group.querySelectorAll<HTMLElement>("[data-reveal-item]");
    if (!items.length) return;
    gsap.fromTo(
      items,
      { autoAlpha: 0, y: 24 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.55,
        ease: EASE,
        stagger: 0.1,
        scrollTrigger: { trigger: group, start: "top 80%" },
      },
    );
  });
}

/**
 * Signature heading reveal — blur-to-focus, line by line (SplitText).
 *
 *   [data-reveal-heading]         — h1 / section h2 to reveal by lines.
 *   [data-reveal-now]             — play immediately on load (the hero h1);
 *                                   otherwise plays once on scroll into view.
 *
 * Robustness: waits for fonts before splitting (correct line breaks, no swap
 * reflow), re-splits on resize, reverts each split once played (tidy DOM +
 * screen-reader-correct text). FOUC is handled by the `reveal-active` class on
 * <html> (set by an inline head script) — headings are only hidden when JS is
 * actually running and motion is allowed. Under reduced motion this is a no-op.
 */
export async function initHeadingReveals(): Promise<void> {
  if (prefersReducedMotion) return;

  const heads = gsap.utils.toArray<HTMLElement>("[data-reveal-heading]");
  if (!heads.length) return;

  // Correct line breaks require the real fonts to be in place first.
  await document.fonts.ready;
  // fonts.ready can resolve before a face has even been requested; make sure
  // each heading's exact face is loaded so line breaks are measured right.
  await Promise.all(
    heads.map((h) => {
      const cs = getComputedStyle(h);
      return document.fonts
        .load(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`)
        .catch(() => undefined);
    }),
  );
  // Let an initial hash jump (smooth-scroll's honorInitialHash runs in rAF)
  // settle first, so "already scrolled past" below is measured correctly.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const played = new WeakSet<HTMLElement>();
  const splits = new Map<HTMLElement, SplitText>();
  const triggers = new Map<HTMLElement, ScrollTrigger>();

  const cleanup = (el: HTMLElement) => {
    const s = splits.get(el);
    if (s) {
      s.revert(); // restores original markup (accessible text, no will-change)
      splits.delete(el);
    }
    const trig = triggers.get(el);
    if (trig) {
      trig.kill();
      triggers.delete(el);
    }
    // Keep the heading visible after revert (inline opacity beats the CSS hide).
    gsap.set(el, { opacity: 1, visibility: "visible" });
  };

  const buildOne = (el: HTMLElement) => {
    if (played.has(el)) {
      gsap.set(el, { opacity: 1, visibility: "visible" });
      return;
    }
    // Already scrolled past (e.g. arrived via an anchor further down): show it
    // statically. Animating offscreen gains nothing, and the split → revert
    // re-wrap can change its line count, shifting everything below — including
    // the anchor the visitor just landed on.
    if (el.getBoundingClientRect().bottom <= 0) {
      played.add(el);
      gsap.set(el, { opacity: 1, visibility: "visible" });
      return;
    }
    // Natural (unsplit) height — the layout the heading must end in.
    const naturalH = el.getBoundingClientRect().height;
    const split = new SplitText(el, {
      type: "lines",
      mask: "lines",
      linesClass: "reveal-line",
      aria: "auto",
    });

    // SplitText treats each word as unbreakable, so a heading that naturally
    // wraps inside a word (e.g. after the hyphen in "pocket-money") splits
    // into a different number of lines and would collapse/grow when the split
    // is reverted — a layout shift. In that case reveal the heading as one
    // block instead: same blur/rise/fade, zero reflow.
    if (Math.abs(el.getBoundingClientRect().height - naturalH) > 1) {
      split.revert();
      gsap.set(el, { autoAlpha: 0, y: 24, filter: "blur(12px)", willChange: "transform, filter, opacity" });
      const animateBlock = () =>
        gsap.to(el, {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.8,
          ease: EASE,
          onComplete: () => {
            played.add(el);
            gsap.set(el, { clearProps: "transform,filter,willChange" });
            cleanup(el);
          },
        });
      if (el.hasAttribute("data-reveal-now")) {
        animateBlock();
      } else {
        triggers.set(
          el,
          ScrollTrigger.create({ trigger: el, start: "top 82%", once: true, onEnter: animateBlock }),
        );
      }
      return;
    }
    splits.set(el, split);

    gsap.set(el, { autoAlpha: 1 }); // reveal container; lines are hidden below
    gsap.set(split.lines, {
      opacity: 0,
      y: 24,
      filter: "blur(12px)",
      willChange: "transform, filter, opacity",
    });

    const animate = () =>
      gsap.to(split.lines, {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.8,
        stagger: 0.09,
        ease: EASE,
        onComplete: () => {
          played.add(el);
          cleanup(el);
        },
      });

    if (el.hasAttribute("data-reveal-now")) {
      animate();
    } else {
      const trig = ScrollTrigger.create({
        trigger: el,
        start: "top 82%",
        once: true,
        onEnter: animate,
      });
      triggers.set(el, trig);
    }
  };

  const build = () => heads.forEach(buildOne);

  build();
  ScrollTrigger.refresh();

  // Re-split unplayed headings on resize so line masks stay correct.
  let resizeTimer: number | undefined;
  window.addEventListener(
    "resize",
    () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        splits.forEach((s) => s.revert());
        splits.clear();
        triggers.forEach((t) => t.kill());
        triggers.clear();
        build();
        ScrollTrigger.refresh();
      }, 200);
    },
    { passive: true },
  );
}
