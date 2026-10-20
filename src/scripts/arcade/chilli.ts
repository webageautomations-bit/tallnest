// "Chilli Chaska Challenge" — one-button push-your-luck.
// Hold (touch, mouse, or Space) → heat rises linearly, round score rises with
// heat² (accelerating). Release → bank. Heat reaching this round's hidden,
// random burst point → round score lost. Pointer-cancel, losing capture, tab
// switch or window blur all count as a RELEASE (bank), never a burst.
import { getBest, higherIsBetter, recordBest } from "./storage";
import { setShare } from "./share";

interface ChilliData { rounds: number; url: string; candy: string }

export const FILL_MS = 3600; // full heat in 3.6 s of holding
const BURST_MIN = 0.32;
const BURST_MAX = 0.97;
const LOCKOUT_MS = 700; // pause after a round so a held-over press can't start the next
const MAX_POINTS = 1000;

export const pointsAt = (heat: number): number => Math.round(MAX_POINTS * heat * heat);
export const randomBurst = (): number => BURST_MIN + Math.random() * (BURST_MAX - BURST_MIN);

type Phase = "ready" | "holding" | "lockout" | "done";

export function initChilli(): void {
  const root = document.querySelector<HTMLElement>("[data-chilli]");
  const raw = document.getElementById("chilli-data")?.textContent;
  if (!root || !raw) return;
  const { rounds, url } = JSON.parse(raw) as ChilliData;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const screens = { intro: $("[data-screen=intro]"), play: $("[data-screen=play]"), end: $("[data-screen=end]") };
  const stage = $("[data-stage]");
  const meter = $("[data-meter]");
  const meterFill = $("[data-meter-fill]");
  const heatNum = $("[data-heat-num]");
  const pointsEl = $("[data-points]");
  const burstEl = $("[data-burst]");
  const msg = $("[data-msg]");
  const hold = $<HTMLButtonElement>("[data-hold]");
  const holdLabel = $("[data-hold-label]");
  const roundsEl = $("[data-rounds]");
  const live = $("[data-live]");

  let phase: Phase = "done";
  let round = 0; // 0-based index of the current round
  let results: (number | null)[] = []; // banked points, null = burnt
  let heat = 0;
  let burstAt = randomBurst();
  let raf = 0;
  let last = 0;

  const show = (name: keyof typeof screens) => {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  };
  const total = () => results.reduce<number>((s, r) => s + (r ?? 0), 0);

  const paintHeat = () => {
    stage.style.setProperty("--heat", heat.toFixed(3));
    meterFill.style.transform = `scaleX(${heat})`;
    const pct = Math.min(100, Math.round(heat * 100));
    heatNum.textContent = `${pct}%`;
    meter.setAttribute("aria-valuenow", String(pct));
    pointsEl.textContent = String(pointsAt(heat));
    stage.classList.toggle("is-shaking", phase === "holding" && heat > 0.2 && !reduced);
    stage.classList.toggle("is-sweating", phase === "holding" && heat > 0.45);
  };

  const paintRounds = (list: HTMLElement) => {
    list.replaceChildren(
      ...results.map((r, i) => {
        const li = document.createElement("li");
        li.className = r === null ? "is-burnt" : "is-banked";
        li.textContent = r === null ? `R${i + 1}: burnt` : `R${i + 1}: +${r}`;
        return li;
      }),
    );
  };

  const paintHud = () => {
    $("[data-hud-round]").textContent = `${Math.min(round + 1, rounds)}/${rounds}`;
    $("[data-hud-total]").textContent = String(total());
    paintRounds(roundsEl);
  };

  const readyRound = () => {
    phase = "ready";
    heat = 0;
    burstAt = randomBurst();
    stage.classList.remove("is-burnt");
    burstEl.hidden = true;
    hold.disabled = false;
    holdLabel.textContent = round === 0 ? "Hold to heat up" : `Hold for round ${round + 1}`;
    paintHeat();
    paintHud();
  };

  const finishRound = (banked: number | null) => {
    cancelAnimationFrame(raf);
    hold.classList.remove("is-held");
    results.push(banked);
    phase = "lockout";
    hold.disabled = true;
    paintHeat();
    holdLabel.textContent = banked === null ? "Burnt!" : `Banked +${banked}`;
    if (banked === null) {
      stage.classList.add("is-burnt");
      burstEl.hidden = false;
      msg.textContent = `Burnt at ${Math.round(heat * 100)}% heat — round ${round + 1} score lost.`;
    } else {
      msg.textContent = `Banked +${banked} at ${Math.round(heat * 100)}% heat.`;
    }
    live.textContent = msg.textContent;
    round++;
    paintHud();
    window.setTimeout(() => {
      if (round >= rounds) endRun();
      else {
        readyRound();
        msg.textContent += ` Hold for round ${round + 1}.`;
      }
    }, LOCKOUT_MS + (banked === null ? 300 : 0));
  };

  const frame = (now: number) => {
    if (phase !== "holding") return;
    const dt = Math.min(64, now - last);
    last = now;
    heat = Math.min(1, heat + dt / FILL_MS);
    if (heat >= burstAt) {
      heat = burstAt;
      finishRound(null);
      return;
    }
    paintHeat();
    raf = requestAnimationFrame(frame);
  };

  const press = () => {
    if (phase !== "ready") return;
    phase = "holding";
    hold.classList.add("is-held");
    holdLabel.textContent = "Let go to bank!";
    msg.textContent = "Heating up…";
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const release = () => {
    if (phase !== "holding") return;
    finishRound(pointsAt(heat));
  };

  const endRun = () => {
    phase = "done";
    const t = total();
    const burnt = results.filter((r) => r === null).length;
    const { best, isNew } = recordBest<number>("chilli", t, higherIsBetter);
    $("[data-end-title]").textContent = `You banked ${t}.`;
    $("[data-end-total]").textContent = String(t);
    $("[data-end-burnt]").textContent = `${burnt}/${rounds}`;
    $("[data-end-best]").textContent = String(best);
    $("[data-end-new]").hidden = !isNew;
    paintRounds($("[data-end-rounds]"));
    setShare(`I banked ${t} on the Chilli Chaska Challenge without burning. Your turn.`, url);
    show("end");
    live.textContent = `Run complete. You banked ${t}.${isNew ? " New best run!" : ""}`;
    $("[data-end-title]").focus({ preventScroll: true });
  };

  const start = () => {
    round = 0;
    results = [];
    msg.textContent = `Press and hold to start round 1.`;
    show("play");
    root.scrollIntoView({ block: "start" });
    readyRound();
    hold.focus({ preventScroll: true });
  };

  // --- Input: pointer (touch + mouse) ------------------------------------
  hold.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      hold.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — window listeners below still release */
    }
    press();
  });
  hold.addEventListener("pointerup", release);
  hold.addEventListener("pointercancel", release); // e.g. the browser took over the gesture
  hold.addEventListener("lostpointercapture", release);
  hold.addEventListener("contextmenu", (e) => e.preventDefault()); // long-press menu
  window.addEventListener("pointerup", release);

  // --- Input: keyboard (hold Space) -------------------------------------
  const playing = () => !screens.play.hidden;
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || !playing()) return;
    e.preventDefault(); // no page scroll, no button click
    if (!e.repeat) press();
  });
  document.addEventListener("keyup", (e) => {
    if (e.code !== "Space" || !playing()) return;
    e.preventDefault();
    release();
  });

  // Leaving mid-hold banks — it's never a burst.
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) release();
  });

  $("[data-start]").addEventListener("click", start);
  $("[data-again]").addEventListener("click", start);

  const best = getBest<number>("chilli");
  if (best) $("[data-intro-best]").textContent = `Your best run: ${best}`;
}
