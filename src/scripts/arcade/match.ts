// "Flavour Match" — client logic. Data (product pack renders, levels) comes
// from the page as JSON, built from jingo-products.ts.
import { getBest, recordBest } from "./storage";
import { setShare } from "./share";

interface Img { src: string; w: number; h: number }
interface PoolItem { id: string; name: string; tint: string; img: Img }
interface Level { id: string; label: string; pairs: number }
interface MatchData { levels: Level[]; pool: PoolItem[]; logo: Img; url: string }
interface Best { moves: number; ms: number }

const MISS_BEAT = 900; // ms a mismatched pair stays face-up
const WIN_BEAT = 450;

const better = (a: Best, b: Best) => a.moves < b.moves || (a.moves === b.moves && a.ms < b.ms);
const secs = (ms: number) => Math.max(1, Math.round(ms / 1000));
const bestText = (b: Best | null) => (b ? `${b.moves} moves · ${secs(b.ms)}s` : "—");

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function initMatch(): void {
  const root = document.querySelector<HTMLElement>("[data-match]");
  const raw = document.getElementById("match-data")?.textContent;
  if (!root || !raw) return;
  const { levels, pool, logo, url } = JSON.parse(raw) as MatchData;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const screens = { intro: $("[data-screen=intro]"), play: $("[data-screen=play]"), win: $("[data-screen=win]") };
  const board = $("[data-board]");
  const hud = {
    level: $("[data-hud-level]"),
    moves: $("[data-hud-moves]"),
    time: $("[data-hud-time]"),
    pairs: $("[data-hud-pairs]"),
  };
  const live = $("[data-live]");

  let level = levels[0];
  let first: HTMLButtonElement | null = null;
  let lock = false;
  let moves = 0;
  let matched = 0;
  let startedAt = 0;
  let timer = 0;

  const show = (name: keyof typeof screens) => {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
    if (root.getBoundingClientRect().top < 80) root.scrollIntoView({ block: "start", behavior: "instant" });
  };

  const paintBests = () => {
    for (const l of levels) {
      const el = root.querySelector<HTMLElement>(`[data-best-for="${l.id}"]`);
      const b = getBest<Best>(`match-${l.id}`);
      if (el) el.textContent = b ? `Best: ${bestText(b)}` : "No best yet";
    }
  };

  const elapsed = () => (startedAt ? performance.now() - startedAt : 0);
  const tick = () => {
    hud.time.textContent = `${Math.floor(elapsed() / 1000)}s`;
  };
  const stopTimer = () => window.clearInterval(timer);

  const updateHud = () => {
    hud.level.textContent = level.label;
    hud.moves.textContent = String(moves);
    hud.pairs.textContent = `${matched}/${level.pairs}`;
  };

  const cardLabel = (btn: HTMLButtonElement, i: number) => {
    const name = btn.dataset.name ?? "";
    if (btn.classList.contains("is-matched")) return `Card ${i + 1}: ${name}, matched`;
    if (btn.classList.contains("is-up")) return `Card ${i + 1}: ${name}`;
    return `Card ${i + 1}, face down`;
  };
  const relabel = (btn: HTMLButtonElement) => {
    btn.setAttribute("aria-label", cardLabel(btn, Number(btn.dataset.index)));
  };

  const deal = () => {
    stopTimer();
    first = null;
    lock = false;
    moves = 0;
    matched = 0;
    startedAt = 0;
    hud.time.textContent = "0s";
    updateHud();

    const picks = shuffle(pool).slice(0, level.pairs);
    const deck = shuffle([...picks, ...picks]);
    board.dataset.level = level.id;
    board.replaceChildren(
      ...deck.map((p, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mc";
        btn.dataset.id = p.id;
        btn.dataset.name = p.name;
        btn.dataset.index = String(i);
        btn.style.setProperty("--tint", p.tint);
        btn.innerHTML =
          `<span class="mc-inner">` +
          `<span class="mc-face mc-back"><img src="${logo.src}" alt="" width="${logo.w}" height="${logo.h}" decoding="async"></span>` +
          `<span class="mc-face mc-front"><img src="${p.img.src}" alt="" width="${p.img.w}" height="${p.img.h}" decoding="async"></span>` +
          `</span>`;
        relabel(btn);
        return btn;
      }),
    );
    show("play");
  };

  const win = () => {
    stopTimer();
    const ms = elapsed();
    const result: Best = { moves, ms };
    const { best, isNew } = recordBest<Best>(`match-${level.id}`, result, better);
    $("[data-win-level]").textContent = `${level.label} · ${level.pairs} pairs`;
    $("[data-win-moves]").textContent = String(moves);
    $("[data-win-time]").textContent = `${secs(ms)}s`;
    $("[data-win-best]").textContent = bestText(best);
    $("[data-win-new]").hidden = !isNew;
    setShare(`I cleared Flavour Match (${level.label}) in ${moves} moves / ${secs(ms)} seconds. Beat it.`, url);
    paintBests();
    show("win");
    live.textContent = `Board cleared in ${moves} moves and ${secs(ms)} seconds.${isNew ? " New best!" : ""}`;
    $("#fm-win-h").focus({ preventScroll: true });
  };

  board.addEventListener("click", (e) => {
    const card = (e.target as HTMLElement).closest<HTMLButtonElement>(".mc");
    if (!card || lock || card.classList.contains("is-up")) return;

    if (!startedAt) {
      startedAt = performance.now();
      timer = window.setInterval(tick, 250);
    }
    card.classList.add("is-up");
    relabel(card);

    if (!first) {
      first = card;
      live.textContent = card.dataset.name ?? "";
      return;
    }

    const a = first;
    const b = card;
    first = null;
    moves++;
    if (a.dataset.id === b.dataset.id) {
      for (const c of [a, b]) {
        c.classList.add("is-matched");
        c.setAttribute("aria-disabled", "true");
        relabel(c);
      }
      matched++;
      updateHud();
      live.textContent = `${b.dataset.name} — match! ${level.pairs - matched} pairs left.`;
      if (matched === level.pairs) {
        lock = true;
        window.setTimeout(win, WIN_BEAT);
      }
    } else {
      updateHud();
      lock = true;
      a.classList.add("is-miss");
      b.classList.add("is-miss");
      live.textContent = `${b.dataset.name} — no match.`;
      window.setTimeout(() => {
        for (const c of [a, b]) {
          c.classList.remove("is-up", "is-miss");
          relabel(c);
        }
        lock = false;
      }, MISS_BEAT);
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-level]").forEach((btn) =>
    btn.addEventListener("click", () => {
      level = levels.find((l) => l.id === btn.dataset.level) ?? levels[0];
      deal();
    }),
  );
  $("[data-restart]").addEventListener("click", deal);
  $("[data-again]").addEventListener("click", deal);
  root.querySelectorAll<HTMLButtonElement>("[data-change]").forEach((btn) =>
    btn.addEventListener("click", () => {
      stopTimer();
      paintBests();
      show("intro");
    }),
  );

  // The clock doesn't run while the tab is hidden.
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (!startedAt || screens.play.hidden) return;
    if (document.hidden) {
      hiddenAt = performance.now();
      stopTimer();
    } else if (hiddenAt) {
      startedAt += performance.now() - hiddenAt;
      hiddenAt = 0;
      timer = window.setInterval(tick, 250);
    }
  });

  paintBests();
}
