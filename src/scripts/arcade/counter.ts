// "Counter Rush" — client loop. Pure visual matching: the browser only knows
// product ids, tints and pack images (no names). Rules come from
// counter-logic.ts; lookalike sets arrive precomputed from the page.
import {
  LIVES,
  SHIFT,
  WRONG_PENALTY,
  buildRound,
  multiplier,
  paramsFor,
  pointsFor,
  type Round,
} from "./counter-logic";
import { getBest, higherIsBetter, recordBest } from "./storage";
import { setShare } from "./share";

interface Img { src: string; w: number; h: number }
interface Pack { id: string; tint: string; img: Img }
interface Customer { id: string; color: string; img: Img }
interface CounterData { products: Pack[]; looks: Record<string, string[]>; customers: Customer[]; url: string }

const SERVE_BEAT = 550; // ms the "thanks" moment lasts before the next customer
const WALKOUT_BEAT = 800;
const ASKS = ["This one, please!", "Got one of these?", "One of these — quick!", "I need this one!", "Do you have this?"];

export function initCounter(): void {
  const root = document.querySelector<HTMLElement>("[data-counter]");
  const raw = document.getElementById("counter-data")?.textContent;
  if (!root || !raw) return;
  const { products, looks: lookObj, customers, url } = JSON.parse(raw) as CounterData;
  const byId = new Map(products.map((p) => [p.id, p]));
  const ids = products.map((p) => p.id);
  const looks = new Map(Object.entries(lookObj));

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const screens = { intro: $("[data-screen=intro]"), play: $("[data-screen=play]"), end: $("[data-screen=end]") };
  const hud = {
    score: $("[data-hud-score]"),
    combo: $("[data-hud-combo]"),
    comboChip: $("[data-hud-combo-chip]"),
    served: $("[data-hud-served]"),
    lives: $("[data-hud-lives]"),
    livesChip: $("[data-hud-lives-chip]"),
  };
  const customerEl = $("[data-customer]");
  const avatar = $<HTMLImageElement>("[data-avatar]");
  const want = $<HTMLImageElement>("[data-want]");
  const wantBox = want.parentElement!;
  const say = $("[data-say]");
  const patienceEl = $("[data-patience]");
  const meta = $("[data-meta]");
  const shelfEl = $("[data-shelf]");
  const live = $("[data-live]");

  let score = 0;
  let served = 0;
  let lives = LIVES;
  let streak = 0;
  let bestStreak = 0;
  let patience = 1; // 0..1
  let patienceMs = 9000;
  let customerNo = 0;
  let round: Round | null = null;
  let lastCustomer = "";
  let running = false;
  let paused = false;
  let locked = false;
  let raf = 0;
  let last = 0;

  const show = (name: keyof typeof screens) => {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  };

  const paintHud = () => {
    hud.score.textContent = String(score);
    const m = multiplier(streak);
    hud.combo.textContent = `×${m}`;
    hud.comboChip.classList.toggle("is-hot", m > 1);
    hud.served.textContent = `${served}/${SHIFT}`;
    hud.lives.innerHTML = Array.from({ length: LIVES }, (_, i) => `<span class="${i < lives ? "" : "off"}">♥</span>`).join("");
    hud.livesChip.setAttribute("aria-label", `Lives: ${lives} of ${LIVES}`);
  };

  const paintPatience = () => {
    patienceEl.style.transform = `scaleX(${Math.max(0, patience)})`;
    patienceEl.classList.toggle("is-low", patience < 0.3);
    patienceEl.classList.toggle("is-mid", patience >= 0.3 && patience < 0.6);
  };

  const pulse = (cls: string) => {
    customerEl.classList.remove("is-new", "is-happy", "is-cross");
    void customerEl.offsetWidth; // restart the CSS animation
    customerEl.classList.add(cls);
  };

  const nextCustomer = () => {
    const params = paramsFor(served);
    patienceMs = params.patienceMs;
    customerNo++;
    round = buildRound(ids, looks, params, Math.random, round?.target);
    const pool = customers.filter((c) => c.id !== lastCustomer);
    const who = pool[Math.floor(Math.random() * pool.length)];
    lastCustomer = who.id;

    avatar.src = who.img.src;
    avatar.width = who.img.w;
    avatar.height = who.img.h;
    customerEl.style.setProperty("--c-color", who.color);

    const target = byId.get(round.target)!;
    want.src = target.img.src;
    want.width = target.img.w;
    want.height = target.img.h;
    wantBox.style.setProperty("--want-tint", target.tint);
    say.textContent = ASKS[Math.floor(Math.random() * ASKS.length)];
    meta.textContent = `Customer ${customerNo} · ${(patienceMs / 1000).toFixed(1)}s`;
    root.dataset.tricky = String(round.tricky);
    root.dataset.patienceMs = String(patienceMs);

    shelfEl.dataset.size = String(round.shelf.length);
    shelfEl.replaceChildren(
      ...round.shelf.map((id, i) => {
        const p = byId.get(id)!;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ct-pack";
        btn.dataset.id = p.id;
        btn.setAttribute("aria-label", `Pack ${i + 1}`);
        btn.style.setProperty("--tint", p.tint);
        btn.innerHTML = `<img src="${p.img.src}" alt="" width="${p.img.w}" height="${p.img.h}" decoding="async">`;
        return btn;
      }),
    );
    patience = 1;
    paintPatience();
    locked = false;
    shelfEl.classList.remove("is-locked");
    pulse("is-new");
    live.textContent = `Customer ${customerNo} wants a pack.`;
  };

  const end = (completed: boolean) => {
    running = false;
    cancelAnimationFrame(raf);
    const { best, isNew } = recordBest<number>("counter", score, higherIsBetter);
    $("[data-end-kicker]").textContent = completed ? "Shift complete" : "Out of lives";
    $("[data-end-title]").textContent = completed ? "Shift done. Legend." : "Counter closed.";
    $("[data-end-served]").textContent = String(served);
    $("[data-end-score]").textContent = String(score);
    $("[data-end-combo]").textContent = `×${multiplier(bestStreak)}`;
    $("[data-end-best]").textContent = String(best);
    $("[data-end-new]").hidden = !isNew;
    setShare(`I served ${served} customer${served === 1 ? "" : "s"} at the Jingo counter. Think you're faster?`, url);
    show("end");
    live.textContent = `${completed ? "Shift complete" : "Out of lives"}. You served ${served} and scored ${score}.`;
    $("[data-end-title]").focus({ preventScroll: true });
  };

  const loseLife = (why: string) => {
    lives--;
    streak = 0;
    paintHud();
    pulse("is-cross");
    live.textContent = why;
    locked = true;
    shelfEl.classList.add("is-locked");
    window.setTimeout(() => (lives <= 0 ? end(false) : nextCustomer()), WALKOUT_BEAT);
  };

  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(100, now - last);
    last = now;
    if (!paused && !locked) {
      patience -= dt / patienceMs;
      paintPatience();
      if (patience <= 0) {
        patience = 0;
        loseLife("Too slow — they walked out. You lost a life.");
      }
    }
    raf = requestAnimationFrame(frame);
  };

  shelfEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".ct-pack");
    if (!btn || !round || locked || !running) return;
    if (btn.dataset.id === round.target) {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      const pts = pointsFor(patience, streak);
      score += pts;
      served++;
      btn.classList.add("is-right");
      locked = true;
      shelfEl.classList.add("is-locked");
      pulse("is-happy");
      say.textContent = "Thanks!";
      live.textContent = `Right pack! +${pts}.`;
      paintHud();
      window.setTimeout(() => (served >= SHIFT ? end(true) : nextCustomer()), SERVE_BEAT);
    } else {
      streak = 0;
      patience -= WRONG_PENALTY;
      btn.classList.remove("is-wrong");
      void btn.offsetWidth;
      btn.classList.add("is-wrong");
      btn.disabled = true;
      pulse("is-cross");
      paintHud();
      paintPatience();
      live.textContent = "Wrong pack!";
      if (patience <= 0) {
        patience = 0;
        loseLife("Wrong pack — they've had enough. You lost a life.");
      }
    }
  });

  const start = () => {
    score = 0;
    served = 0;
    lives = LIVES;
    streak = 0;
    bestStreak = 0;
    customerNo = 0;
    round = null;
    paused = document.hidden;
    paintHud();
    show("play");
    root.scrollIntoView({ block: "start", behavior: "instant" });
    // Warm the cache so packs appear instantly when they first hit the shelf.
    for (const p of products) new Image().src = p.img.src;
    nextCustomer();
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  document.addEventListener("visibilitychange", () => {
    paused = document.hidden;
    last = performance.now();
  });

  $("[data-start]").addEventListener("click", start);
  $("[data-again]").addEventListener("click", start);

  const best = getBest<number>("counter");
  if (best) $("[data-intro-best]").textContent = `Your best: ${best}`;
}
