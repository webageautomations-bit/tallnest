// "Mascot Runner" — rendering + input over the pure world in runner-world.ts.
// Vanilla Canvas, fixed 600×400 logical resolution scaled to the container
// (backing store = CSS size × devicePixelRatio, capped at 2);
// requestAnimationFrame with delta-time. Assets per run: ONE mascot render +
// up to 8 pack renders, reused every frame. Scenery is shapes/gradients only,
// pre-rendered once per run into 3 parallax strips (far silhouettes, near
// candy hills, ground) and scrolled at different speeds.
//
// Controls: jump = tap / click / Space / ↑ (again in mid-air = double-jump);
// fast-fall = ↓ / swipe down. Touch: a swipe-down is told apart from a tap
// within the first ~60ms, so a swipe never fires a jump first.
import {
  GROUND,
  H,
  HB,
  PACK,
  PLAYER,
  STEP,
  W,
  createWorld,
  fastFall,
  jump,
  meters,
  score,
  step,
  type Obstacle,
  type World,
} from "./runner-world";
import { getBest, higherIsBetter, load, recordBest, save } from "./storage";
import { setShare } from "./share";

interface Img { src: string; w: number; h: number }
interface Mascot { id: string; label: string; color: string; textOn: "light" | "dark"; img: Img }
interface RunnerData { crew: Mascot[]; packs: { id: string; img: Img }[]; url: string }

const PACKS_PER_RUN = 8;
const TAP_DECIDE_MS = 60; // touch: time to tell a tap from a swipe-down
const SWIPE_PX = 18;
const OB_COLORS = ["#ff4f9a", "#38c6f4", "#ffc93c", "#a6e04a", "#7b3ff2", "#ff8a1f"];
const INK = "#24121a";

type State = "ready" | "running" | "paused" | "over";

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

/** Deterministic PRNG so scenery strips look the same every frame. */
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

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
      const stepBy = { ArrowRight: 1, ArrowDown: 3, ArrowLeft: -1, ArrowUp: -3 }[e.key];
      if (!stepBy) return;
      e.preventDefault();
      choose(picks[(i + stepBy + picks.length) % picks.length].dataset.pick!, true);
    });
  });
  choose(chosen.id);

  const paintBest = () => {
    const best = getBest<number>("runner");
    $("[data-select-best]").textContent = best ? `Your best: ${best}` : "";
  };

  // --- Run state ----------------------------------------------------------
  let state: State = "ready";
  let world: World = createWorld(PACKS_PER_RUN);
  let mascotImg: HTMLImageElement | null = null;
  let packImgs: HTMLImageElement[] = [];
  let theme = { skyTop: "#ffe9f2", skyBottom: "#fff6e9", far: "#ffd3e3", near: "#ffb8d6", ground: "#e0202b", groundDark: "#b8141e", frost: "#fff6e9" };
  let raf = 0;
  let last = 0;
  let acc = 0; // un-simulated frame time
  let scale = 1;
  let pf = 1; // device px per logical px (= the main canvas's) for pre-renders
  let skyCanvas: HTMLCanvasElement | null = null;

  // --- Scenery strips (pre-rendered, tiled) ------------------------------------
  const TILE = W * 2;
  type Strip = { canvas: HTMLCanvasElement; top: number; h: number; speed: number };
  let strips: Strip[] = [];

  const makeStrip = (top: number, h: number, speed: number, paint: (c: CanvasRenderingContext2D) => void): Strip => {
    const c = document.createElement("canvas");
    c.width = Math.round(TILE * pf);
    c.height = Math.round(h * pf);
    const g = c.getContext("2d")!;
    g.setTransform(pf, 0, 0, pf, 0, -top * pf);
    // Paint twice, shifted by a tile, so shapes crossing the seam wrap cleanly.
    for (const off of [0, -TILE]) {
      g.save();
      g.translate(off, 0);
      paint(g);
      g.restore();
    }
    return { canvas: c, top, h, speed };
  };

  const buildScenery = () => {
    // Sky: static gradient + sun, pre-rendered opaque (blitted 1:1 each frame).
    skyCanvas = document.createElement("canvas");
    skyCanvas.width = canvas.width;
    skyCanvas.height = Math.round(GROUND * pf);
    const sg = skyCanvas.getContext("2d", { alpha: false })!;
    sg.setTransform(pf, 0, 0, pf, 0, 0);
    const grad = sg.createLinearGradient(0, 0, 0, GROUND);
    grad.addColorStop(0, theme.skyTop);
    grad.addColorStop(1, theme.skyBottom);
    sg.fillStyle = grad;
    sg.fillRect(0, 0, W, GROUND);
    sg.fillStyle = "rgba(255, 201, 60, 0.9)";
    sg.beginPath();
    sg.arc(500, 74, 34, 0, Math.PI * 2);
    sg.fill();

    // Far: soft hills + lollipop trees, one silhouette colour.
    const far = makeStrip(150, GROUND - 150, 0.12, (g) => {
      const r = seeded(7);
      g.fillStyle = theme.far;
      g.beginPath();
      g.moveTo(0, GROUND);
      for (let x = 0; x <= TILE * 2; x += 200) g.quadraticCurveTo(x + 100, GROUND - 110 - r() * 40, x + 200, GROUND - 40);
      g.lineTo(TILE * 2, GROUND);
      g.fill();
      for (let i = 0; i < 9; i++) {
        const x = r() * TILE * 2;
        const top = GROUND - 120 - r() * 60;
        g.fillRect(x - 3, top, 6, GROUND - top);
        g.beginPath();
        g.arc(x, top, 18 + r() * 10, 0, Math.PI * 2);
        g.fill();
      }
    });
    // Near: candy hills, gumdrops and canes in a stronger tint.
    const near = makeStrip(210, GROUND - 210, 0.4, (g) => {
      const r = seeded(19);
      g.fillStyle = theme.near;
      g.beginPath();
      g.moveTo(0, GROUND);
      for (let x = 0; x <= TILE * 2; x += 150) g.quadraticCurveTo(x + 75, GROUND - 55 - r() * 30, x + 150, GROUND - 14);
      g.lineTo(TILE * 2, GROUND);
      g.fill();
      for (let i = 0; i < 10; i++) {
        const x = r() * TILE * 2;
        if (r() < 0.5) {
          // gumdrop
          const w = 30 + r() * 20;
          g.fillStyle = theme.near;
          g.beginPath();
          g.ellipse(x, GROUND - 6, w / 2, w * 0.7, 0, Math.PI, 0);
          g.fill();
          g.fillStyle = "rgba(255,255,255,0.55)";
          for (let k = 0; k < 4; k++) g.fillRect(x - w / 3 + r() * w * 0.6, GROUND - 10 - r() * w * 0.5, 3, 3);
        } else {
          // candy cane
          const top = GROUND - 70 - r() * 30;
          g.lineCap = "round";
          g.lineWidth = 9;
          g.strokeStyle = "rgba(255,255,255,0.9)";
          g.beginPath();
          g.moveTo(x, GROUND);
          g.lineTo(x, top);
          g.arc(x + 12, top, 12, Math.PI, 0);
          g.stroke();
          g.setLineDash([6, 6]);
          g.strokeStyle = theme.ground;
          g.stroke();
          g.setLineDash([]);
        }
      }
    });
    // Ground: frosting edge, stripes and sprinkles.
    const ground = makeStrip(GROUND - 8, H - GROUND + 8, 1, (g) => {
      const r = seeded(31);
      g.fillStyle = theme.ground;
      g.fillRect(0, GROUND, TILE * 2, H - GROUND);
      g.fillStyle = theme.groundDark;
      for (let x = 0; x < TILE * 2; x += 48) g.fillRect(x, GROUND + 24, 24, 6);
      g.fillStyle = theme.frost;
      g.beginPath();
      g.moveTo(0, GROUND - 2);
      for (let x = 0; x <= TILE * 2; x += 30) g.arc(x + 15, GROUND + 4, 15, Math.PI, 0, true);
      g.lineTo(TILE * 2, GROUND - 2);
      g.fill();
      const sprinkle = ["#ff4f9a", "#38c6f4", "#ffc93c", "#a6e04a", "#ffffff"];
      for (let i = 0; i < 70; i++) {
        g.fillStyle = sprinkle[i % sprinkle.length];
        g.save();
        g.translate(r() * TILE * 2, GROUND + 34 + r() * (H - GROUND - 40));
        g.rotate(r() * Math.PI);
        g.fillRect(-4, -1.5, 8, 3);
        g.restore();
      }
      g.fillStyle = INK;
      g.fillRect(0, GROUND - 2, TILE * 2, 3);
    });
    strips = [far, near, ground];
  };

  // --- Canvas sizing ------------------------------------------------------
  const resize = () => {
    const cssW = canvas.clientWidth || W;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    scale = cssW / W;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(((cssW * H) / W) * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    // Pre-renders match the main canvas's device-pixel density exactly, so
    // they blit 1:1 (no resampling — the cheap path on low-end phones).
    const nextPf = canvas.width / W;
    if (Math.abs(nextPf - pf) > 0.001 || !strips.length) {
      pf = nextPf;
      buildScenery();
    }
    if (state !== "running") draw();
  };
  new ResizeObserver(resize).observe(canvas);

  // --- Drawing --------------------------------------------------------------
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h); // Safari < 16
  };

  const drawObstacle = (o: Obstacle) => {
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    const col = OB_COLORS[o.hue];
    switch (o.kind) {
      case "crate": {
        ctx.fillStyle = col;
        rr(o.x, o.y, o.w, o.h, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillRect(o.x + 6, o.y + 6, 6, o.h - 14);
        break;
      }
      case "wide": {
        const half = o.w / 2;
        [o.x, o.x + half].forEach((x, i) => {
          ctx.fillStyle = OB_COLORS[(o.hue + i) % OB_COLORS.length];
          rr(x, o.y, half, o.h, 7);
          ctx.fill();
          ctx.stroke();
        });
        break;
      }
      case "tall": {
        // Striped candy stick
        ctx.fillStyle = "#fff6e9";
        rr(o.x, o.y, o.w, o.h, o.w / 2);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = col;
        for (let y = o.y - o.w; y < o.y + o.h + o.w; y += 18) {
          ctx.beginPath();
          ctx.moveTo(o.x, y);
          ctx.lineTo(o.x + o.w, y - o.w * 0.6);
          ctx.lineTo(o.x + o.w, y - o.w * 0.6 + 9);
          ctx.lineTo(o.x, y + 9);
          ctx.fill();
        }
        ctx.restore();
        rr(o.x, o.y, o.w, o.h, o.w / 2);
        ctx.stroke();
        break;
      }
      case "gum": {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(o.x, GROUND);
        ctx.bezierCurveTo(o.x, o.y - 4, o.x + o.w, o.y - 4, o.x + o.w, GROUND);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        for (let k = 0; k < 5; k++) ctx.fillRect(o.x + 8 + ((k * 13) % (o.w - 14)), o.y + 10 + ((k * 7) % (o.h - 16)), 3, 3);
        break;
      }
      case "low":
      case "high": {
        // Candy-wrapper bird. Low = warm pink, high = cool grape; a ground
        // shadow shows how high it flies.
        const lift = GROUND - (o.y + o.h);
        ctx.fillStyle = "rgba(36,18,26,0.16)";
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, GROUND + 3, 20 * Math.max(0.35, 1 - lift / 160), 4, 0, 0, Math.PI * 2);
        ctx.fill();
        const flap = Math.sin(o.t * 22) * 9;
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2 + 2;
        // wing (wrapper twist)
        ctx.fillStyle = o.kind === "high" ? "#38c6f4" : "#ffc93c";
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy - 4);
        ctx.lineTo(cx + 6, cy - 16 - flap);
        ctx.lineTo(cx + 16, cy - 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // body
        ctx.fillStyle = o.kind === "high" ? "#7b3ff2" : "#ff4f9a";
        ctx.beginPath();
        ctx.ellipse(cx, cy, o.w / 2 - 4, o.h / 2 - 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // tail twist
        ctx.beginPath();
        ctx.moveTo(o.x + o.w - 6, cy);
        ctx.lineTo(o.x + o.w + 6, cy - 7);
        ctx.lineTo(o.x + o.w + 6, cy + 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // beak + eye (facing left, flying at the runner)
        ctx.fillStyle = "#ff8a1f";
        ctx.beginPath();
        ctx.moveTo(o.x + 4, cy - 3);
        ctx.lineTo(o.x - 7, cy + 1);
        ctx.lineTo(o.x + 4, cy + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(cx - 8, cy - 3, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(cx - 9, cy - 3, 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  };

  const draw = () => {
    const w = world;
    // Background blits in device pixels, 1:1, at whole-pixel offsets.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (skyCanvas) ctx.drawImage(skyCanvas, 0, 0);
    ctx.restore();
    // Clouds drift slowest of all.
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 3; i++) {
      const cx = ((((i * 260 - w.dist * 0.05) % (W + 200)) + W + 200) % (W + 200)) - 100;
      const cy = 56 + i * 30;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 42, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 30, cy - 8, 28, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Parallax strips: far silhouettes (0.12×), near hills (0.4×), ground (1×).
    // Only the visible window is copied, 1:1 in device pixels (no scaling).
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const viewW = canvas.width;
    for (const s of strips) {
      const sw = s.canvas.width;
      const off = Math.round((w.dist * s.speed * pf) % sw);
      const top = Math.round(s.top * pf);
      const first = Math.min(viewW, sw - off);
      ctx.drawImage(s.canvas, off, 0, first, s.canvas.height, 0, top, first, s.canvas.height);
      if (first < viewW) ctx.drawImage(s.canvas, 0, 0, viewW - first, s.canvas.height, first, top, viewW - first, s.canvas.height);
    }
    ctx.restore();

    for (const o of w.obstacles) drawObstacle(o);

    for (const p of w.pickups) {
      if (p.taken) continue;
      const img = packImgs[p.img];
      if (img) {
        // Fit inside the pickup box at the pack's own ratio (packs vary: boxes,
        // pouches, wide cartons); the pickup hitbox stays PACK.w × PACK.h.
        const r = img.naturalWidth / img.naturalHeight;
        const dw = r > PACK.w / PACK.h ? PACK.w : PACK.h * r;
        const dh = r > PACK.w / PACK.h ? PACK.w / r : PACK.h;
        ctx.drawImage(img, p.x + (PACK.w - dw) / 2, p.y + (PACK.h - dh) + Math.sin(p.t * 4) * 3, dw, dh);
      }
    }

    // Player — single render, animated by bob/tilt transforms; stretch on fast-fall.
    const lift = GROUND - PLAYER.h - w.y;
    ctx.fillStyle = "rgba(36,18,26,0.22)";
    const sh = Math.max(0.35, 1 - lift / 220);
    ctx.beginPath();
    ctx.ellipse(PLAYER.x + PLAYER.w / 2, GROUND + 2, 24 * sh, 6 * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mascotImg) {
      const running = w.onGround && state === "running";
      const bob = running ? Math.abs(Math.sin(w.clock * 16)) * -5 : 0;
      const tilt = running ? Math.sin(w.clock * 16) * 0.06 : w.onGround ? 0 : Math.max(-0.35, Math.min(0.25, w.vy / 2600));
      ctx.save();
      ctx.translate(PLAYER.x + PLAYER.w / 2, w.y + PLAYER.h / 2 + bob);
      ctx.rotate(tilt);
      if (w.fastFall) ctx.scale(0.86, 1.14);
      // Fixed height, width from the render's own ratio (no stretching); the
      // hitbox (HB in runner-world.ts) is the same for every character.
      const mw = PLAYER.h * (mascotImg.naturalWidth / mascotImg.naturalHeight);
      ctx.drawImage(mascotImg, -mw / 2, -PLAYER.h / 2, mw, PLAYER.h);
      ctx.restore();
      if (w.fastFall) {
        ctx.strokeStyle = "rgba(36,18,26,0.35)";
        ctx.lineWidth = 2;
        for (const dx of [-12, 0, 12]) {
          ctx.beginPath();
          ctx.moveTo(PLAYER.x + PLAYER.w / 2 + dx, w.y - 4);
          ctx.lineTo(PLAYER.x + PLAYER.w / 2 + dx, w.y - 22);
          ctx.stroke();
        }
      }
    }

    // HUD (in-canvas: no DOM layout per frame); never below ~20px/13px on screen.
    const big = Math.max(22, 20 / scale);
    const small = Math.max(14, 13 / scale);
    ctx.textBaseline = "top";
    ctx.textAlign = "right";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#fff6e9";
    ctx.fillStyle = INK;
    ctx.font = `700 ${big}px 'General Sans', Arial, sans-serif`;
    const hud = `${score(w)}`;
    ctx.strokeText(hud, W - 14, 12);
    ctx.fillText(hud, W - 14, 12);
    ctx.font = `600 ${small}px 'General Sans', Arial, sans-serif`;
    const sub = `${meters(w)}m · ${w.collected} pack${w.collected === 1 ? "" : "s"}`;
    ctx.strokeText(sub, W - 14, 16 + big);
    ctx.fillText(sub, W - 14, 16 + big);

    if (state === "ready" || state === "paused") {
      ctx.fillStyle = "rgba(36,18,26,0.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff6e9";
      const t1 = Math.max(30, 24 / scale);
      const t2 = Math.max(16, 13 / scale);
      ctx.font = `700 ${t1}px 'General Sans', Arial, sans-serif`;
      ctx.fillText(state === "ready" ? "Tap to run!" : "Paused", W / 2, H / 2 - 44);
      ctx.font = `600 ${t2}px 'General Sans', Arial, sans-serif`;
      if (state === "ready") {
        ctx.fillText("Tap / Space / ↑ to jump (again for double)", W / 2, H / 2 + 2);
        ctx.fillText("Swipe down / ↓ to drop fast", W / 2, H / 2 + 8 + t2);
      } else {
        ctx.fillText("Tap to carry on", W / 2, H / 2 + 4);
      }
    }
  };

  // --- Loop -------------------------------------------------------------------
  const frame = (now: number) => {
    if (state !== "running") return;
    acc += Math.min(0.05, (now - last) / 1000); // clamp long frames (tab hiccups)
    last = now;
    // Fixed-step simulation: frame-rate independent, deterministic physics.
    while (acc >= STEP && !world.over) {
      step(world, STEP, Math.random);
      acc -= STEP;
    }
    draw();
    if (world.over) {
      gameOver();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const run = () => {
    state = "running";
    pauseBtn.setAttribute("aria-label", "Pause");
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    if (state !== "running") return;
    state = "paused";
    cancelAnimationFrame(raf);
    draw();
    pauseBtn.setAttribute("aria-label", "Resume");
  };

  /** Jump input: starts a ready run, resumes a paused one, else jumps. */
  const doJump = () => {
    if (state === "ready" || state === "paused") return run();
    if (state === "running") jump(world);
  };
  const doFastFall = () => {
    if (state === "running") fastFall(world);
  };

  const gameOver = () => {
    state = "over";
    cancelAnimationFrame(raf);
    const s = score(world);
    const m = meters(world);
    const { best, isNew } = recordBest<number>("runner", s, higherIsBetter);
    $("[data-over-score]").textContent = String(s);
    $("[data-over-dist]").textContent = `${m}m`;
    $("[data-over-packs]").textContent = String(world.collected);
    $("[data-over-best]").textContent = String(best);
    $("[data-over-new]").hidden = !isNew;
    setShare(
      `I ran ${m}m as ${chosen.label} and grabbed ${world.collected} Jingo pack${world.collected === 1 ? "" : "s"} in Mascot Runner (score ${s}). Beat it.`,
      url,
    );
    pauseBtn.hidden = true;
    over.hidden = false;
    live.textContent = `Game over. Score ${s}, ${m} metres, ${world.collected} packs.${isNew ? " New best!" : ""}`;
    window.setTimeout(() => {
      over.scrollIntoView({ block: "nearest" });
      $("#rn-over-h").focus({ preventScroll: true });
    }, 60);
  };

  const begin = async () => {
    show("play");
    root.scrollIntoView({ block: "start", behavior: "instant" });
    over.hidden = true;
    pauseBtn.hidden = false;
    const c = chosen.color;
    theme = {
      skyTop: mix(c, "#ffffff", 0.74),
      skyBottom: mix(c, "#fff6e9", 0.9),
      far: mix(c, "#ffffff", 0.6),
      near: mix(c, "#ffffff", 0.38),
      ground: c,
      groundDark: mix(c, INK, 0.25),
      frost: "#fff6e9",
    };
    world = createWorld(PACKS_PER_RUN);
    state = "ready";
    strips = [];
    resize(); // rebuilds the scenery for this theme
    const pool = packs.slice().sort(() => Math.random() - 0.5).slice(0, PACKS_PER_RUN);
    try {
      [mascotImg, ...packImgs] = await Promise.all([loadImage(chosen.img.src), ...pool.map((p) => loadImage(p.img.src))]);
    } catch {
      /* draw what loaded; shapes still render */
    }
    draw();
    stage.focus({ preventScroll: true });
  };

  // --- Input ------------------------------------------------------------------
  // Touch: decide tap (jump) vs swipe-down (fast-fall) within TAP_DECIDE_MS.
  let gesture: { id: number; y0: number; decided: "" | "jump" | "fall"; timer: number } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return; // pause button
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    stage.focus({ preventScroll: true });
    if (e.pointerType !== "touch" || state !== "running") {
      doJump();
      return;
    }
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* fine without capture */
    }
    const g = { id: e.pointerId, y0: e.clientY, decided: "" as "" | "jump" | "fall", timer: 0 };
    g.timer = window.setTimeout(() => {
      if (!g.decided) {
        g.decided = "jump";
        doJump();
      }
    }, TAP_DECIDE_MS);
    gesture = g;
  });
  stage.addEventListener("pointermove", (e) => {
    const g = gesture;
    if (!g || e.pointerId !== g.id || g.decided === "fall") return;
    if (e.clientY - g.y0 > SWIPE_PX) {
      window.clearTimeout(g.timer);
      g.decided = "fall";
      doFastFall();
    }
  });
  const endGesture = (e: PointerEvent) => {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    window.clearTimeout(g.timer);
    if (!g.decided && e.type === "pointerup") doJump(); // quick tap
    gesture = null;
  };
  stage.addEventListener("pointerup", endGesture);
  stage.addEventListener("pointercancel", endGesture);

  document.addEventListener("keydown", (e) => {
    if (screens.play.hidden || state === "over") return;
    const target = e.target as HTMLElement;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      if (e.code === "Space" && target.closest?.("[data-pause]")) return; // let Space press the pause button
      e.preventDefault();
      if (!e.repeat) doJump();
    } else if (e.code === "ArrowDown" || e.code === "KeyS") {
      e.preventDefault();
      doFastFall();
    } else if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "running") pause();
      else if (state === "paused") run();
    }
  });
  pauseBtn.addEventListener("click", () => (state === "running" ? pause() : state === "paused" ? run() : undefined));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("blur", pause);

  $("[data-go]").addEventListener("click", begin);
  $("[data-again]").addEventListener("click", begin);
  $("[data-change]").addEventListener("click", () => {
    paintBest();
    show("select");
    root.scrollIntoView({ block: "start", behavior: "instant" });
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
      snap: () => ({ state, ...world, hb: HB }),
      act: (a: "J" | "F") => (a === "J" ? jump(world) : fastFall(world)),
      warp: (m: number) => {
        world.dist = m * 20;
      },
      /** Steps (STEP = 1/120s) until a crash following `plan`; `ticks` = survives. */
      ahead: (plan: [number, "J" | "F"][], ticks = 168) => {
        const w = structuredClone(world);
        for (let t = 0; t < ticks; t++) {
          for (const [at, a] of plan) if (at === t) (a === "J" ? jump : fastFall)(w);
          step(w, STEP, null);
          if (w.over) return t;
        }
        return ticks;
      },
    };
  }
}
