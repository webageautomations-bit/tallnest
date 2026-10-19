/**
 * Stat count-up when scrolled into view — the same mechanism (and the same
 * `data-count` / `data-suffix` markup API, timing and threshold) as the
 * corporate Flagship section, extracted as a module so the Jingo zone can
 * reuse it. The final value is server-rendered; JS only animates toward it,
 * and under reduced motion the final value is left in place.
 *
 *   <div data-count="35" data-suffix="+">35+</div>
 */
export function initCountUps(root: ParentNode = document): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count);
    const suffix = el.dataset.suffix ?? "";
    if (!Number.isFinite(to)) return;
    if (reduce) {
      el.textContent = `${to}${suffix}`;
      return;
    }
    el.textContent = `0${suffix}`;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(el);
          let v = 0;
          const step = Math.max(1, Math.ceil(to / 28));
          const timer = setInterval(() => {
            v += step;
            if (v >= to) {
              v = to;
              clearInterval(timer);
            }
            el.textContent = `${v}${suffix}`;
          }, 22);
        });
      },
      { threshold: 0.5 },
    );
    io.observe(el);
  });
}
