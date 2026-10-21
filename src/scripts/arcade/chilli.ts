// "Chilli Chaska Challenge" — keep the heat in the sweet spot.
// Needle sweeps the gauge; tap / click / Space stops it. Inside the green zone
// = points by accuracy ("Perfect!" dead-centre) and the next, harder round.
// Outside = lose a life (3 lives). Reduced motion: slower sweep, no shake or
// flames — still fully playable.
import { LIVES, judge, sweep, sweepSpeed, zoneCentre, zoneWidth } from "./chilli-logic";
import { getBest, higherIsBetter, recordBest } from "./storage";
import { setShare } from "./share";

interface ChilliData { url: string }

const RESULT_BEAT = 800; // ms the stopped needle + verdict stay up
const BEST_KEY = "chilli-timing"; // the old hold-to-burst bests were a different scale

export function initChilli(): void {
  const root = document.querySelector<HTMLElement>("[data-chilli]");
  const raw = document.getElementById("chilli-data")?.textContent;
  if (!root || !raw) return;
  const { url } = JSON.parse(raw) as ChilliData;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const screens = { intro: $("[data-screen=intro]"), play: $("[data-screen=play]"), end: $("[data-screen=end]") };
  const stage = $("[data-stage]");
  const track = $("[data-track]");
  const zone = $("[data-sweet]");
  const needle = $("[data-needle]");
  const verdict = $("[data-verdict]");
  const msg = $("[data-msg]");
  const stopBtn = $<HTMLButtonElement>("[data-stop]");
  const live = $("[data-live]");

  let round = 1;
  let lives = LIVES;
  let score = 0;
  let hits = 0;
  let perfects = 0;
  let p = 0; // needle 0..1
  let dir: 1 | -1 = 1;
  let zc = 0.5;
  let zw = zoneWidth(1);
  let speed = sweepSpeed(1, reduced);
  let sweeping = false;
  let raf = 0;
  let last = 0;
  let trackW = track.clientWidth;
  new ResizeObserver(() => {
    trackW = track.clientWidth;
    paintNeedle();
  }).observe(track);

  const show = (name: keyof typeof screens) => {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  };

  const paintHud = () => {
    $("[data-hud-round]").textContent = String(round);
    $("[data-hud-score]").textContent = String(score);
    $("[data-hud-lives]").innerHTML = Array.from({ length: LIVES }, (_, i) => `<span class="${i < lives ? "" : "off"}">♥</span>`).join("");
    $("[data-hud-lives-chip]").setAttribute("aria-label", `Lives: ${lives} of ${LIVES}`);
  };

  const inZone = () => Math.abs(p - zc) <= zw / 2;
  const paintNeedle = () => {
    needle.style.transform = `translateX(${(p * trackW).toFixed(1)}px)`;
    stage.classList.toggle("is-calm", sweeping && inZone());
  };

  const placeZone = () => {
    zw = zoneWidth(round);
    zc = zoneCentre(zw);
    speed = sweepSpeed(round, reduced);
    zone.style.left = `${((zc - zw / 2) * 100).toFixed(2)}%`;
    zone.style.width = `${(zw * 100).toFixed(2)}%`;
    root.dataset.zoneWidth = zw.toFixed(4);
    root.dataset.speed = speed.toFixed(3);
  };

  const frame = (now: number) => {
    if (!sweeping) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ({ p, dir } = sweep(p, dir, speed, dt));
    paintNeedle();
    raf = requestAnimationFrame(frame);
  };

  const startSweep = () => {
    sweeping = true;
    stopBtn.disabled = false;
    stage.classList.remove("is-burn", "is-happy", "is-perfect");
    verdict.textContent = "";
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const endRun = () => {
    const { best, isNew } = recordBest<number>(BEST_KEY, score, higherIsBetter);
    $("[data-end-title]").textContent = `You survived ${hits} round${hits === 1 ? "" : "s"}.`;
    $("[data-end-rounds]").textContent = String(hits);
    $("[data-end-score]").textContent = String(score);
    $("[data-end-perfects]").textContent = String(perfects);
    $("[data-end-best]").textContent = String(best);
    $("[data-end-new]").hidden = !isNew;
    setShare(`I survived ${hits} round${hits === 1 ? "" : "s"} of the Chilli Chaska Challenge (score ${score}). Your turn.`, url);
    show("end");
    live.textContent = `Run over. ${hits} rounds survived, score ${score}.${isNew ? " New best!" : ""}`;
    $("[data-end-title]").focus({ preventScroll: true });
  };

  const stop = () => {
    if (!sweeping) return;
    sweeping = false;
    cancelAnimationFrame(raf);
    stopBtn.disabled = true;
    const r = judge(p, zc, zw, round);
    root.dataset.lastStop = p.toFixed(4);
    stage.classList.remove("is-calm");
    if (r.hit) {
      score += r.points;
      hits++;
      if (r.perfect) perfects++;
      stage.classList.add(r.perfect ? "is-perfect" : "is-happy");
      verdict.textContent = `${r.grade} +${r.points}`;
      verdict.dataset.kind = r.perfect ? "perfect" : "hit";
      round++;
      msg.textContent = `Round ${round} — faster, and a smaller sweet spot.`;
    } else {
      lives--;
      stage.classList.add("is-burn");
      verdict.textContent = `${r.grade} −1 life`;
      verdict.dataset.kind = "miss";
      msg.textContent = lives > 0 ? `Missed the sweet spot. ${lives} li${lives === 1 ? "fe" : "ves"} left — same round, new spot.` : "Burnt out!";
    }
    live.textContent = verdict.textContent;
    paintHud();
    window.setTimeout(() => {
      if (lives <= 0) {
        endRun();
        return;
      }
      placeZone();
      startSweep();
    }, RESULT_BEAT + (r.hit ? 0 : 250));
  };

  const start = () => {
    round = 1;
    lives = LIVES;
    score = 0;
    hits = 0;
    perfects = 0;
    p = 0;
    dir = 1;
    show("play");
    root.scrollIntoView({ block: "start", behavior: "instant" });
    trackW = track.clientWidth;
    placeZone();
    paintHud();
    msg.textContent = "Stop the needle inside the green sweet spot.";
    paintNeedle();
    startSweep();
    stopBtn.focus({ preventScroll: true });
  };

  // --- Input: touch + mouse (pointerdown = instant), keyboard Space --------
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    stop();
  };
  stopBtn.addEventListener("pointerdown", onPointer);
  stage.addEventListener("pointerdown", onPointer);
  track.parentElement!.addEventListener("pointerdown", onPointer);
  stopBtn.addEventListener("click", (e) => {
    // Keyboard Enter on the focused button (pointer clicks were handled on pointerdown).
    if ((e as MouseEvent).detail === 0) stop();
  });
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || screens.play.hidden) return;
    e.preventDefault();
    if (!e.repeat) stop();
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space" && !screens.play.hidden) e.preventDefault(); // no button click
  });
  document.addEventListener("visibilitychange", () => {
    // Pause the sweep while hidden; resume where it was.
    if (document.hidden && sweeping) {
      cancelAnimationFrame(raf);
    } else if (!document.hidden && sweeping) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });

  $("[data-start]").addEventListener("click", start);
  $("[data-again]").addEventListener("click", start);

  const best = getBest<number>(BEST_KEY);
  if (best) $("[data-intro-best]").textContent = `Your best: ${best}`;
}
