/**
 * Site-wide scroll-progress bar. Fills left-to-right (inline-start in RTL) as a
 * fraction of total document scroll. Lenis does real scroll (it moves the page's
 * scrollTop), so reading window.scrollY stays in sync with it — and Lenis fires
 * window 'scroll' on each smooth frame, so the bar tracks smoothly with no
 * separate hook. A passive listener + rAF keeps it jank-free. The bar is pinned
 * to the header's measured bottom edge and re-measures on resize.
 */
export function initScrollProgress(): void {
  const wrap = document.getElementById("scroll-progress");
  const bar = wrap?.querySelector<HTMLElement>(".scroll-progress-bar");
  if (!wrap || !bar) return;

  const header = document.getElementById("site-header");

  const setTop = () => {
    const h = header?.offsetHeight ?? 80;
    wrap.style.top = `${h}px`;
  };

  let ticking = false;
  const update = () => {
    ticking = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const y = window.scrollY || doc.scrollTop || 0;
    const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
    bar.style.transform = `scaleX(${p})`;
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  setTop();
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(
    "resize",
    () => {
      setTop();
      update();
    },
    { passive: true },
  );
  // Late layout shifts (fonts, images, reveals) change scrollHeight.
  window.addEventListener("load", update);
}
