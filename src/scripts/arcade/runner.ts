// "Mascot Runner" — vanilla Canvas endless runner.
// Fixed logical resolution (600×400) scaled to the container; the backing
// store follows CSS size × devicePixelRatio (capped at 2). requestAnimationFrame
// with delta-time, so speed is frame-rate independent. Assets per run: ONE
// mascot render + up to 8 pack renders, decoded once and reused every frame.
// Jump = tap / click / Space / ↑; a second press in mid-air DOUBLE-JUMPS.
// Jump buffering + coyote time keep it responsive on touch.
import { getBest, higherIsBetter, load, recordBest, save } from "./storage";
import { setShare } from "./share";

interface Img { src: string; w: number; h: number }
interface Mascot { id: string; label: string; color: string; textOn: "light" | "dark"; img: Img }
interface RunnerData { crew: Mascot[]; packs: { id: string; img: Img }[]; url: string }

// --- World constants (logical px / seconds) ------------------------------
const W = 600;
const H = 400;
const GROUND = 340; // ground top
const PX_PER_M = 20;
const GRAVITY = 2600;
const JUMP_V = 880; // ~149px apex
const DOUBLE_V = 780;
const START_SPEED = 300;
const MAX_SPEED = 760;
const ACCEL_PER_PX = 0.02; // speed gained per px travelled
const BUFFER_S = 0.12; // jump pressed this long before landing still fires
const COYOTE_S = 0.08;
const PLAYER = { x: 92, w: 62, h: 76 };
const PACK = { w: 34, h: 44 };
const PACK_POINTS = 25;
const PACKS_PER_RUN = 8;

interface Obstacle { x: number; w: number; h: number; hue: number }
interface Pickup { x: number; y: number; img: number; taken: boolean; t: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number }

type State = "ready" | "running" | "paused" | "over";

const OB_COLORS = ["#ff4f9a", "#38c6f4", "#ffc93c", "#a6e04a", "#7b3ff2", "#ff8a1f"];

function mix(hex: string, toward: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex);
  const b = p(toward);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export function initRunner(): void {
  const root = document.querySelector<HTMLElement>("[data-runner]");
  const raw = document.getElementById("runner-data")?.textContent;
  if (!root || !raw) return;
  const { crew, packs, url } = JSON.parse(raw) as RunnerData;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const screens = { rm: $("[data-screen=rm]"), select: $("[data-screen=select]"), play: $("[data-screen=play]") };
  const stage = $("[data-stage]");
  const canvas = $<HTMLCanvasElement>("[data-canvas]");
  const ctx = canvas.getContext("2d", { alpha: false });
  const over = $("[data-over]");
  const pauseBtn = $<HTMLButtonElement>("[data-pause]");
  const live = $("[data-live]");
  if (!ctx) {
    stage.textContent = "Sorry — your browser can't run this game (no Canvas support).";
    return;
  }

  const show = (name: keyof typeof screens) => {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  };

  // --- Character select ---------------------------------------------------
  let chosen = crew.find((m) => m.id === load<string>("runner:mascot")) ?? crew[0];
  const picks = [...root.querySelectorAll<HTMLButtonElement>("[data-pick]")];
  const choose = (id: string, focus = false) => {
    chosen = crew.find((m) => m.id === id) ?? crew[0];
    for (const b of picks) {
      const on = b.dataset.pick === chosen.id;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    $("[data-go-name]").textContent = chosen.label;
    save("runner:mascot", chosen.id);
  };
  picks.forEach((b, i) => {
    b.addEventListener("click", () => choose(b.dataset.pick!));
    b.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowDown: 3, ArrowLeft: -1, ArrowUp: -3 }[e.key];
      if (!step) return;
      e.preventDefault();
      choose(picks[(i + step + picks.length) % picks.length].dataset.pick!, true);
    });
  });
  choose(chosen.id);

  const paintBest = () => {
    const best = getBest<number>("runner");
    $("[data-select-best]").textContent = best ? `Your best: ${best}` : "";
  };

  // --- Canvas sizing ------------------------------------------------------
  let scale = 1;
  const resize = () => {
    const cssW = canvas.clientWidth || W;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    scale = cssW / W;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round((cssW * H) / W * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    if (state !== "running") draw(0);
  };
  new ResizeObserver(resize).observe(canvas);

  // --- Run state ----------------------------------------------------------
  let state: State = "ready";
  let mascotImg: HTMLImageElement | null = null;
  let packImgs: HTMLImageElement[] = [];
  let theme = { skyTop: "", skyBottom: "", hillFar: "", hillNear: "", ground: "", groundDark: "" };
  let y = GROUND - PLAYER.h; // player top
  let vy = 0;
  let onGround = true;
  let canDouble = true;
  let sinceGround = 0;
  let bufferT = -1;
  let speed = START_SPEED;
  let dist = 0;
  let collected = 0;
  let nextSpawn = 0;
  let clock = 0;
  let obstacles: Obstacle[] = [];
  let pickups: Pickup[] = [];
  let sparks: Spark[] = [];
  let raf = 0;
  let last = 0;

  const meters = () => Math.floor(dist / PX_PER_M);
  const score = () => meters() + collected * PACK_POINTS;

  const reset = () => {
    y = GROUND - PLAYER.h;
    vy = 0;
    onGround = true;
    canDouble = true;
    sinceGround = 0;
    bufferT = -1;
    speed = START_SPEED;
    dist = 0;
    collected = 0;
    clock = 0;
    nextSpawn = W + 200;
    obstacles = [];
    pickups = [];
    sparks = [];
  };

  // Spawn the next crate (and maybe packs) ahead, keeping every gap jumpable.
  const spawn = () => {
    const tall = Math.random() < Math.min(0.45, dist / 30000);
    const h = tall ? 70 + Math.random() * 24 : 34 + Math.random() * 30;
    const w = 34 + Math.random() * (speed > 520 ? 40 : 24);
    const x = nextSpawn;
    obstacles.push({ x, w, h, hue: Math.floor(Math.random() * OB_COLORS.length) });
    // Packs: a low row before the crate, or an arc over it.
    if (packImgs.length && Math.random() < 0.75) {
      const img = Math.floor(Math.random() * packImgs.length);
      if (Math.random() < 0.5) {
        const py = GROUND - h - 70;
        pickups.push({ x: x + w / 2 - PACK.w / 2, y: py, img, taken: false, t: Math.random() * 6 });
      } else {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          pickups.push({ x: x - 150 - i * 46, y: GROUND - PACK.h - 14, img, taken: false, t: i });
        }
      }
    }
    const minGap = speed * 0.9 + 140; // longer than a full jump at this speed
    nextSpawn = x + w + minGap + Math.random() * 260;
  };

  const jump = () => {
    if (state === "ready") {
      state = "running";
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    if (state !== "running") return;
    if (onGround || sinceGround < COYOTE_S) {
      vy = -JUMP_V;
      onGround = false;
      sinceGround = COYOTE_S; // consume coyote time
      canDouble = true;
    } else if (canDouble) {
      vy = -DOUBLE_V;
      canDouble = false;
    } else {
      bufferT = BUFFER_S; // remember the press for the landing
    }
  };

  const hit = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  const update = (dt: number) => {
    clock += dt;
    speed = Math.min(MAX_SPEED, START_SPEED + dist * ACCEL_PER_PX);
    const dx = speed * dt;
    dist += dx;
    nextSpawn -= dx;
    while (nextSpawn < W + 120) spawn();

    // Player physics
    vy += GRAVITY * dt;
    y += vy * dt;
    if (y >= GROUND - PLAYER.h) {
      y = GROUND - PLAYER.h;
      vy = 0;
      if (!onGround) {
        onGround = true;
        canDouble = true;
        sinceGround = 0;
        if (bufferT > 0) {
          bufferT = -1;
          jump();
        }
      }
    } else if (onGround) {
      onGround = false;
    }
    if (!onGround) sinceGround += dt;
    if (bufferT > 0) bufferT -= dt;

    // Forgiving hitbox
    const px = PLAYER.x + 14;
    const py = y + 10;
    const pw = PLAYER.w - 28;
    const ph = PLAYER.h - 16;

    for (const o of obstacles) {
      o.x -= dx;
      if (hit(px, py, pw, ph, o.x + 3, GROUND - o.h + 3, o.w - 6, o.h - 3)) {
        gameOver();
        return;
      }
    }
    for (const p of pickups) {
      p.x -= dx;
      p.t += dt;
      if (!p.taken && hit(px, py, pw, ph, p.x, p.y, PACK.w, PACK.h)) {
        p.taken = true;
        collected++;
        for (let i = 0; i < 6 && sparks.length < 24; i++) {
          sparks.push({ x: p.x + PACK.w / 2, y: p.y + PACK.h / 2, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 260, life: 0.5 });
        }
      }
    }
    for (const s of sparks) {
      s.life -= dt;
      s.vy += 900 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    // Recycle off-screen entities (rare — no per-frame allocation churn).
    if (obstacles.length && obstacles[0].x + obstacles[0].w < -20) obstacles.shift();
    if (pickups.length && (pickups[0].x < -60 || pickups[0].taken)) pickups.shift();
    if (sparks.length && sparks[0].life <= 0) sparks.shift();
  };

  // --- Drawing --------------------------------------------------------------
  const roundRect = (x: number, yy: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, yy, w, h, r);
    else ctx.rect(x, yy, w, h); // Safari < 16
  };

  const drawHills = (offset: number, color: string, base: number, amp: number, period: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    const o = offset % period;
    for (let x = -o; x <= W + period; x += period / 2) {
      ctx.quadraticCurveTo(x + period / 4, base - amp, x + period / 2, base);
    }
    ctx.lineTo(W, GROUND);
    ctx.closePath();
    ctx.fill();
  };

  const draw = (_dt: number) => {
    // Sky
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, theme.skyTop || "#ffe9f2");
    g.addColorStop(1, theme.skyBottom || "#fff6e9");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun + clouds (slow parallax)
    ctx.fillStyle = "rgba(255, 201, 60, 0.9)";
    ctx.beginPath();
    ctx.arc(500, 74, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 260 - dist * 0.08) % (W + 200) + W + 200) % (W + 200) - 100;
      const cy = 60 + i * 34;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 42, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 30, cy - 8, 28, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawHills(dist * 0.15, theme.hillFar || "#ffd3e3", GROUND - 40, 70, 360);
    drawHills(dist * 0.35, theme.hillNear || "#ffb8d6", GROUND - 10, 40, 240);

    // Ground with speed stripes
    ctx.fillStyle = theme.ground || "#e0202b";
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = theme.groundDark || "#b8141e";
    const stripe = 48;
    for (let x = -(dist % stripe); x < W; x += stripe) ctx.fillRect(x, GROUND + 18, 24, 6);
    ctx.fillStyle = "#24121a";
    ctx.fillRect(0, GROUND - 2, W, 4);

    // Obstacles — candy crates
    for (const o of obstacles) {
      const top = GROUND - o.h;
      ctx.fillStyle = OB_COLORS[o.hue];
      roundRect(o.x, top, o.w, o.h, 8);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#24121a";
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(o.x + 6, top + 6, 6, o.h - 14);
    }

    // Pickups
    for (const p of pickups) {
      if (p.taken) continue;
      const img = packImgs[p.img];
      const bob = Math.sin(p.t * 4) * 3;
      if (img) ctx.drawImage(img, p.x, p.y + bob, PACK.w, PACK.h);
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      ctx.fillStyle = `rgba(255, 201, 60, ${Math.max(0, s.life * 2)})`;
      ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
    }

    // Player — single render, animated by bob/tilt transforms.
    const lift = GROUND - PLAYER.h - y;
    ctx.fillStyle = "rgba(36,18,26,0.22)";
    ctx.beginPath();
    const sh = Math.max(0.35, 1 - lift / 220);
    ctx.ellipse(PLAYER.x + PLAYER.w / 2, GROUND + 2, 24 * sh, 6 * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mascotImg) {
      const running = onGround && state === "running";
      const bob = running ? Math.abs(Math.sin(clock * 16)) * -5 : 0;
      const tilt = running ? Math.sin(clock * 16) * 0.06 : onGround ? 0 : Math.max(-0.35, Math.min(0.25, vy / 2600));
      ctx.save();
      ctx.translate(PLAYER.x + PLAYER.w / 2, y + PLAYER.h / 2 + bob);
      ctx.rotate(tilt);
      ctx.drawImage(mascotImg, -PLAYER.w / 2, -PLAYER.h / 2, PLAYER.w, PLAYER.h);
      ctx.restore();
    }

    // HUD (drawn in-canvas: no DOM layout per frame)
    // Sized so it never renders below ~20px / ~13px on screen, however
    // small the canvas is scaled (phones).
    const big = Math.max(22, 20 / scale);
    const small = Math.max(14, 13 / scale);
    ctx.textBaseline = "top";
    ctx.textAlign = "right";
    ctx.font = `700 ${big}px 'General Sans', Arial, sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#fff6e9";
    const hud = `${score()}`;
    ctx.strokeText(hud, W - 14, 12);
    ctx.fillStyle = "#24121a";
    ctx.fillText(hud, W - 14, 12);
    ctx.font = `600 ${small}px 'General Sans', Arial, sans-serif`;
    const sub = `${meters()}m · ${collected} pack${collected === 1 ? "" : "s"}`;
    ctx.strokeText(sub, W - 14, 16 + big);
    ctx.fillText(sub, W - 14, 16 + big);

    if (state === "ready" || state === "paused") {
      ctx.fillStyle = "rgba(36,18,26,0.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff6e9";
      ctx.font = `700 ${Math.max(30, 24 / scale)}px 'General Sans', Arial, sans-serif`;
      ctx.fillText(state === "ready" ? "Tap to run!" : "Paused", W / 2, H / 2 - 34);
      ctx.font = `600 ${Math.max(16, 13 / scale)}px 'General Sans', Arial, sans-serif`;
      ctx.fillText(state === "ready" ? "Tap or Space to jump" : "Tap to carry on", W / 2, H / 2 + 14);
      if (state === "ready") ctx.fillText("Again in mid-air to double-jump", W / 2, H / 2 + 20 + Math.max(16, 13 / scale));
    }
  };

  const frame = (now: number) => {
    if (state !== "running") return;
    const dt = Math.min(0.033, (now - last) / 1000); // clamp long frames (tab hiccups)
    last = now;
    update(dt);
    if (state === "running") {
      draw(dt);
      raf = requestAnimationFrame(frame);
    } else {
      draw(0);
    }
  };

  const pause = () => {
    if (state !== "running") return;
    state = "paused";
    cancelAnimationFrame(raf);
    draw(0);
    pauseBtn.setAttribute("aria-label", "Resume");
  };
  const resume = () => {
    if (state !== "paused") return;
    state = "running";
    pauseBtn.setAttribute("aria-label", "Pause");
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const gameOver = () => {
    state = "over";
    cancelAnimationFrame(raf);
    const s = score();
    const { best, isNew } = recordBest<number>("runner", s, higherIsBetter);
    $("[data-over-score]").textContent = String(s);
    $("[data-over-dist]").textContent = `${meters()}m`;
    $("[data-over-packs]").textContent = String(collected);
    $("[data-over-best]").textContent = String(best);
    $("[data-over-new]").hidden = !isNew;
    setShare(
      `I ran ${meters()}m as ${chosen.label} and grabbed ${collected} Jingo pack${collected === 1 ? "" : "s"} in Mascot Runner (score ${s}). Beat it.`,
      url,
    );
    pauseBtn.hidden = true;
    over.hidden = false;
    live.textContent = `Game over. Score ${s}, ${meters()} metres, ${collected} packs.${isNew ? " New best!" : ""}`;
    window.setTimeout(() => {
      over.scrollIntoView({ block: "nearest" });
      $("#rn-over-h").focus({ preventScroll: true });
    }, 60);
  };

  const begin = async () => {
    show("play");
    root.scrollIntoView({ block: "start" });
    over.hidden = true;
    pauseBtn.hidden = false;
    pauseBtn.setAttribute("aria-label", "Pause");
    const c = chosen.color;
    theme = {
      skyTop: mix(c, "#ffffff", 0.72),
      skyBottom: mix(c, "#fff6e9", 0.9),
      hillFar: mix(c, "#ffffff", 0.55),
      hillNear: mix(c, "#ffffff", 0.35),
      ground: c,
      groundDark: mix(c, "#24121a", 0.25),
    };
    reset();
    state = "ready";
    resize();
    // One mascot + a handful of packs per run, decoded before the first frame.
    const pool = packs.slice().sort(() => Math.random() - 0.5).slice(0, PACKS_PER_RUN);
    try {
      [mascotImg, ...packImgs] = await Promise.all([loadImage(chosen.img.src), ...pool.map((p) => loadImage(p.img.src))]);
    } catch {
      /* draw what loaded; shapes still render */
    }
    draw(0);
    stage.focus({ preventScroll: true });
  };

  // --- Input ------------------------------------------------------------------
  stage.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return; // pause button
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    stage.focus({ preventScroll: true });
    if (state === "paused") resume();
    else jump();
  });
  document.addEventListener("keydown", (e) => {
    if (screens.play.hidden || state === "over") return;
    if (e.code === "Space" || e.code === "ArrowUp") {
      if ((e.target as HTMLElement).closest?.("[data-pause]") && e.code === "Space") return; // let Space press the pause button
      e.preventDefault();
      if (e.repeat) return;
      if (state === "paused") resume();
      else jump();
    } else if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "running") pause();
      else if (state === "paused") resume();
    }
  });
  pauseBtn.addEventListener("click", () => (state === "running" ? pause() : resume()));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("blur", pause);

  $("[data-go]").addEventListener("click", begin);
  $("[data-again]").addEventListener("click", begin);
  $("[data-change]").addEventListener("click", () => {
    paintBest();
    show("select");
    root.scrollIntoView({ block: "start" });
  });
  $("[data-optin]").addEventListener("click", () => {
    show("select");
    picks.find((b) => b.getAttribute("aria-checked") === "true")?.focus();
  });

  paintBest();
  show(matchMedia("(prefers-reduced-motion: reduce)").matches ? "rm" : "select");

  // Test hook — compiled in ONLY when the build sets PUBLIC_ARCADE_DEBUG
  // (Vite drops this block from normal production builds).
  if (import.meta.env.PUBLIC_ARCADE_DEBUG) {
    (window as unknown as { __runner: unknown }).__runner = {
      snap: () => ({
        state, y, vy, onGround, speed, dist, collected, score: score(),
        obstacles: obstacles.map((o) => ({ x: o.x, w: o.w, h: o.h })),
      }),
    };
  }
}
