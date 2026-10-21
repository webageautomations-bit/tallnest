// "Mascot Cup" — rendering + input over the pure world in cup-world.ts.
// Vanilla Canvas at a fixed 720×405 logical resolution, scaled to fit (backing
// store = CSS size × devicePixelRatio, capped at 2). Fixed-step simulation
// (STEP) driven by requestAnimationFrame. The static pitch (sky, stands,
// boards, goals, side trims) is pre-rendered once per match at device-pixel
// density and blitted 1:1; per frame we only draw the ball, two sprites and
// overlays.
//
// FACING: each sprite is mirrored from its SIDE — the left player faces right
// (towards the right-hand goal), the right player faces left — compared with
// the render's natural facing from jingo-mascots.ts (`faces`). So a mascot
// faces the opponent's goal whichever side it's on, and if sides ever swap the
// flip follows automatically.
import {
  BALL_R,
  BODY,
  DIFFICULTY,
  GOAL,
  GOAL_PAUSE_S,
  POWER_R,
  POWER_TTL,
  goalH,
  headR,
  GROUND,
  H,
  HEAD_R,
  STEP,
  W,
  createBrain,
  createWorld,
  facing,
  footBox,
  step,
  think,
  type Brain,
  type Player,
  type PowerKind,
  type Side,
  type World,
} from "./cup-world";

/** Power-up look: a distinct colour + icon each, readable at a glance. */
const POWER_META: Record<PowerKind, { label: string; color: string; fg: string }> = {
  bouncy: { label: "Bouncy ball", color: "#ff4f9a", fg: "#24121a" },
  grow: { label: "Grow", color: "#3fbf6a", fg: "#24121a" },
  biggoal: { label: "Big goal", color: "#38c6f4", fg: "#24121a" },
  speed: { label: "Speed boost", color: "#ffc93c", fg: "#24121a" },
  shrink: { label: "Shrink rival", color: "#7b3ff2", fg: "#ffffff" },
  magnet: { label: "Magnet", color: "#e0202b", fg: "#ffffff" },
};
import { load, save } from "./storage";
import { setShare } from "./share";

interface Img { src: string; w: number; h: number }
interface Mascot { id: string; label: string; color: string; textOn: "light" | "dark"; faces: "left" | "right"; img: Img }
interface CupData { crew: Mascot[]; url: string; logo: Img }
type Level = keyof typeof DIFFICULTY;
interface Record3 { w: number; d: number; l: number }

const INK = "#24121a";
// Every mascot is drawn at the same HEIGHT (the fair baseline); its width comes
// from the image's own natural ratio, so nobody is stretched (khatti-meethi's
// render is landscape, the rest portrait). The COLLISION shape (HEAD_R circle +
// BODY box in cup-world.ts) is identical for every character and is never
// derived from the sprite.
const SPR_H = 100; // sprite height (logical px), head + body + feet
const spriteW = (img: HTMLImageElement) => SPR_H * (img.naturalWidth / img.naturalHeight);

/**
 * Should this sprite be mirrored? Decided by SIDE: the left player attacks the
 * right-hand goal so must face right; the right player must face left. The
 * renders all face RIGHT natively (face drawn right of centre, planted shoe
 * pointing right — `faces` in jingo-mascots.ts), so in practice the RIGHT-side
 * player is mirrored, whichever mascot it is.
 */
export const needsFlip = (side: Side, natural: "left" | "right"): boolean =>
  side === "right" ? natural === "right" : natural === "left";

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

function mix(hex: string, toward: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex);
  const b = p(toward);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
}

export function initCup(): void {
  const root = document.querySelector<HTMLElement>("[data-cup]");
  const raw = document.getElementById("cup-data")?.textContent;
  if (!root || !raw) return;
  const { crew, url, logo } = JSON.parse(raw) as CupData;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const screens = { rm: $("[data-screen=rm]"), select: $("[data-screen=select]"), play: $("[data-screen=play]"), end: $("[data-screen=end]") };
  const stage = $("[data-stage]");
  const canvas = $<HTMLCanvasElement>("[data-canvas]");
  const ctx = canvas.getContext("2d", { alpha: false });
  const pauseBtn = $<HTMLButtonElement>("[data-pause]");
  const live = $("[data-live]");
  if (!ctx) {
    stage.textContent = "Sorry — your browser can't run this game (no Canvas support).";
    return;
  }
  const show = (name: keyof typeof screens) => {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  };

  // --- Select: character + difficulty ---------------------------------------
  let me = crew.find((m) => m.id === load<string>("cup:mascot")) ?? crew[0];
  let level: Level = (load<string>("cup:level") as Level) in DIFFICULTY ? (load<string>("cup:level") as Level) : "normal";
  let cpu = crew[1];

  const radio = (buttons: HTMLButtonElement[], attr: string, value: string, focus = false) => {
    for (const b of buttons) {
      const on = b.getAttribute(attr) === value;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
  };
  const picks = [...root.querySelectorAll<HTMLButtonElement>("[data-pick]")];
  const levels = [...root.querySelectorAll<HTMLButtonElement>("[data-level]")];
  const choose = (id: string, focus = false) => {
    me = crew.find((m) => m.id === id) ?? crew[0];
    radio(picks, "data-pick", me.id, focus);
    $("[data-go-name]").textContent = me.label;
    save("cup:mascot", me.id);
  };
  const chooseLevel = (l: Level, focus = false) => {
    level = l;
    radio(levels, "data-level", l, focus);
    save("cup:level", l);
  };
  const arrowNav = (buttons: HTMLButtonElement[], cols: number, pickFn: (b: HTMLButtonElement) => void) =>
    buttons.forEach((b, i) => {
      b.addEventListener("click", () => pickFn(b));
      b.addEventListener("keydown", (e) => {
        const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
        if (!d) return;
        e.preventDefault();
        const next = buttons[(i + d + buttons.length) % buttons.length];
        pickFn(next);
        next.focus();
      });
    });
  arrowNav(picks, 3, (b) => choose(b.dataset.pick!));
  arrowNav(levels, 3, (b) => chooseLevel(b.dataset.level as Level));
  choose(me.id);
  chooseLevel(level);

  const record = (): Record3 => load<Record3>("cup:record") ?? { w: 0, d: 0, l: 0 };
  const recordText = (r: Record3) => (r.w + r.d + r.l ? `Your record: ${r.w}W · ${r.d}D · ${r.l}L` : "");
  const paintRecord = () => {
    $("[data-select-record]").textContent = recordText(record());
  };

  // --- Match state ---------------------------------------------------------------
  type State = "ready" | "running" | "paused" | "over";
  let state: State = "ready";
  let world: World = createWorld();
  let brain: Brain = createBrain(DIFFICULTY[level]);
  let imgs: [HTMLImageElement | null, HTMLImageElement | null] = [null, null];
  let logoImg: HTMLImageElement | null = null;
  let pitch: HTMLCanvasElement | null = null;
  let pf = 1;
  let scale = 1;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let shownSecond = -1;
  let lastScorer: Side = "left";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ballSprite: HTMLCanvasElement | null = null;
  let ballK = 1; // ball sprite's device px per logical px
  // Goal celebration: confetti in the scorer's colour (not under reduced motion).
  interface Confetti { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string }
  let confetti: Confetti[] = [];
  const team = () => [me, cpu] as const;

  // --- Pitch (static, pre-rendered) ------------------------------------------------
  const buildPitch = () => {
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext("2d", { alpha: false })!;
    g.setTransform(pf, 0, 0, pf, 0, 0);
    // Sky
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, "#9fdcff");
    sky.addColorStop(1, "#fff1f7");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // Sun + candy hills
    g.fillStyle = "rgba(255,201,60,0.9)";
    g.beginPath();
    g.arc(W / 2, 64, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffd3e3";
    g.beginPath();
    g.moveTo(0, 230);
    for (let x = 0; x <= W; x += 120) g.quadraticCurveTo(x + 60, 170, x + 120, 230);
    g.lineTo(W, 260);
    g.lineTo(0, 260);
    g.fill();
    // Stands: two rows of bobbing "crowd" dots in candy colours
    const crowd = ["#ff4f9a", "#38c6f4", "#ffc93c", "#a6e04a", "#7b3ff2", "#ff8a1f"];
    g.fillStyle = "#24121a";
    g.fillRect(0, 232, W, 40);
    for (let row = 0; row < 2; row++) {
      for (let x = 8 + row * 9; x < W; x += 18) {
        g.fillStyle = crowd[(x / 18 + row * 3) % crowd.length | 0];
        g.beginPath();
        g.arc(x, 246 + row * 14, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Ad boards with Jingo branding
    g.fillStyle = "#e0202b";
    g.fillRect(0, 272, W, 30);
    g.fillStyle = INK;
    g.fillRect(0, 270, W, 3);
    g.fillRect(0, 301, W, 3);
    if (logoImg) {
      const lh = 22;
      const lw = (logoImg.width / logoImg.height) * lh;
      for (let x = 30; x < W; x += 170) g.drawImage(logoImg, x, 276, lw, lh);
    }
    // Pitch with mown stripes
    for (let x = 0, i = 0; x < W; x += 60, i++) {
      g.fillStyle = i % 2 ? "#7fcf5a" : "#8bd864";
      g.fillRect(x, 304, 60, H - 304);
    }
    g.fillStyle = "#5fae3f";
    g.fillRect(0, GROUND, W, H - GROUND);
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(W / 2, 304);
    g.lineTo(W / 2, GROUND);
    g.stroke();
    g.beginPath();
    g.ellipse(W / 2, (304 + GROUND) / 2 + 4, 70, 18, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = INK;
    g.fillRect(0, GROUND - 1, W, 3);
    // Side trims in each owner's colour (the goals themselves are drawn live —
    // BIG GOAL changes their height).
    const [L, R] = team();
    g.fillStyle = L.color;
    g.fillRect(0, GROUND + 4, 150, 7);
    g.fillStyle = R.color;
    g.fillRect(W - 150, GROUND + 4, 150, 7);
    pitch = c;
  };

  // --- Football sprite (classic black & white), rendered once, rotated per frame --
  const BALL_VIS = BALL_R + 1.5; // drawn a touch bigger than the hitbox to read on phones
  const buildBall = () => {
    const k = Math.max(2, pf * 2); // supersample so rotation stays crisp
    ballK = k;
    const d = Math.ceil(BALL_VIS * 2 * k) + 4;
    const c = document.createElement("canvas");
    c.width = c.height = d;
    const g = c.getContext("2d")!;
    g.translate(d / 2, d / 2);
    g.scale(k, k);
    const R = BALL_VIS;
    const pent = (cx: number, cy: number, r: number, rot: number) => {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = rot + (i * Math.PI * 2) / 5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
    };
    g.save();
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.clip();
    // white sphere with soft shading
    const shade = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    shade.addColorStop(0, "#ffffff");
    shade.addColorStop(0.7, "#f1f1f1");
    shade.addColorStop(1, "#cfcfcf");
    g.fillStyle = shade;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.fillStyle = "#1c1a1e";
    g.strokeStyle = "#1c1a1e";
    g.lineWidth = R * 0.07;
    const up = -Math.PI / 2;
    // centre pentagon + seams out to five edge pentagons
    const cr = R * 0.34;
    pent(0, 0, cr, up);
    g.fill();
    for (let i = 0; i < 5; i++) {
      const a = up + (i * Math.PI * 2) / 5;
      g.beginPath();
      g.moveTo(Math.cos(a) * cr, Math.sin(a) * cr);
      g.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      g.stroke();
      // partial panels peeking over the rim between seams
      const b = a + Math.PI / 5;
      pent(Math.cos(b) * R * 1.12, Math.sin(b) * R * 1.12, R * 0.34, b + Math.PI);
      g.fill();
    }
    g.restore();
    // outline: reads on the green pitch and the pale sky alike
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.lineWidth = 1.6;
    g.strokeStyle = INK;
    g.stroke();
    ballSprite = c;
  };

  // --- Goals: pre-rendered per side × height (normal / BIG GOAL), blitted 1:1 ----
  const goalSprites = new Map<string, HTMLCanvasElement>();
  const goalSprite = (side: Side, h: number, color: string, big: boolean): HTMLCanvasElement => {
    const key = `${side}:${Math.round(h)}:${color}:${pf.toFixed(3)}`;
    const hit = goalSprites.get(key);
    if (hit) return hit;
    const pad = 6;
    const c = document.createElement("canvas");
    c.width = Math.ceil((GOAL.w + 6 + pad * 2) * pf);
    c.height = Math.ceil((h + GOAL.bar + pad * 2) * pf);
    const g = c.getContext("2d")!;
    // local frame: x 0..GOAL.w+6 (mouth on the right for the LEFT goal), y 0 = crossbar top
    g.setTransform(pf, 0, 0, pf, pad * pf, pad * pf);
    if (side === "right") {
      g.translate(GOAL.w + 6, 0);
      g.scale(-1, 1);
    }
    const top = GOAL.bar;
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.fillRect(0, top, GOAL.w, h);
    g.strokeStyle = "rgba(36,18,26,0.35)";
    g.lineWidth = 1.5;
    for (let x = 8; x < GOAL.w; x += 10) {
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, top + h);
      g.stroke();
    }
    for (let y = top + 10; y < top + h; y += 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(GOAL.w, y);
      g.stroke();
    }
    if (big) {
      g.shadowColor = "#ffc93c";
      g.shadowBlur = 10;
    }
    g.fillStyle = color;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.fillRect(0, 0, GOAL.w + 6, GOAL.bar);
    g.strokeRect(0, 0, GOAL.w + 6, GOAL.bar);
    g.fillRect(GOAL.w - 4, top, 8, h);
    g.strokeRect(GOAL.w - 4, top, 8, h);
    goalSprites.set(key, c);
    return c;
  };
  const drawGoals = () => {
    const [L, R] = team();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const [side, color] of [["left", L.color], ["right", R.color]] as const) {
      const h = goalH(world, side);
      const spr = goalSprite(side, h, color, h > GOAL.h + 1);
      const x0 = side === "left" ? 0 : W - GOAL.w - 6;
      ctx.drawImage(spr, Math.round((x0 - 6) * pf), Math.round((GROUND - h - GOAL.bar - 6) * pf));
    }
    ctx.restore();
  };

  /** Icon for a power-up, drawn centred at 0,0 inside a radius-r disc. */
  const drawIcon = (g: CanvasRenderingContext2D, kind: PowerKind, r: number) => {
    const k = r / 16;
    const fg = POWER_META[kind].fg;
    g.save();
    g.scale(k, k);
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = INK;
    g.fillStyle = fg;
    g.lineWidth = 2;
    const path = (pts: number[]) => {
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.closePath();
      g.fill();
      g.stroke();
    };
    switch (kind) {
      case "bouncy":
        g.beginPath();
        g.arc(0, 4, 5.5, 0, Math.PI * 2);
        g.fillStyle = "#fff";
        g.fill();
        g.stroke();
        g.beginPath();
        g.arc(-6, -3, 5, Math.PI * 1.1, Math.PI * 1.7);
        g.arc(6, -3, 5, Math.PI * 1.3, Math.PI * 1.9);
        g.strokeStyle = INK;
        g.stroke();
        break;
      case "grow":
        path([0, -10, 8, -1, 3, -1, 3, 9, -3, 9, -3, -1, -8, -1]);
        break;
      case "shrink":
        path([0, 10, 8, 1, 3, 1, 3, -9, -3, -9, -3, 1, -8, 1]);
        break;
      case "speed":
        path([3, -11, -7, 2, -1, 2, -4, 11, 7, -3, 1, -3]);
        break;
      case "biggoal":
        g.lineWidth = 2.5;
        g.strokeStyle = fg === "#ffffff" ? "#fff" : INK;
        g.strokeRect(-9, -7, 18, 14);
        g.lineWidth = 1;
        for (let x = -5; x < 9; x += 4.5) {
          g.beginPath();
          g.moveTo(x, -7);
          g.lineTo(x, 7);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(-9, 0);
        g.lineTo(9, 0);
        g.stroke();
        break;
      case "magnet":
        g.lineWidth = 6;
        g.strokeStyle = INK;
        g.beginPath();
        g.arc(0, -1, 6.5, Math.PI, 0, true);
        g.moveTo(-6.5, -1);
        g.lineTo(-6.5, -8);
        g.moveTo(6.5, -1);
        g.lineTo(6.5, -8);
        g.stroke();
        g.lineWidth = 3.5;
        g.strokeStyle = "#fff";
        g.stroke();
        g.fillStyle = "#c7c2cc";
        g.fillRect(-9, -11, 5, 4);
        g.fillRect(4, -11, 5, 4);
        break;
    }
    g.restore();
  };

  // Floating "SPEED BOOST!" labels over whoever grabbed something.
  let floats: { text: string; color: string; i: 0 | 1; t: number }[] = [];

  // --- Canvas sizing ------------------------------------------------------------
  const resize = () => {
    const cssW = canvas.clientWidth || W;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    scale = cssW / W;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(((cssW * H) / W) * dpr);
    pf = canvas.width / W;
    ctx.setTransform(pf, 0, 0, pf, 0, 0);
    ctx.imageSmoothingQuality = "high";
    buildPitch();
    buildBall();
    if (state !== "running") draw();
  };
  new ResizeObserver(resize).observe(canvas);

  // --- Drawing --------------------------------------------------------------------
  const drawPlayer = (p: Player, i: 0 | 1) => {
    const m = team()[i];
    const img = imgs[i];
    const sc = p.scale; // GROW / SHRINK: both axes by the same factor
    const feet = p.y + (HEAD_R + BODY.h) * sc;
    // shadow
    const lift = GROUND - feet;
    const s = Math.max(0.4, 1 - lift / 200);
    ctx.fillStyle = "rgba(36,18,26,0.25)";
    ctx.beginPath();
    ctx.ellipse(p.x, GROUND + 3, 28 * s * sc, 6 * s * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    // effect auras
    if (world.effects[i].some((e) => e.kind === "magnet")) {
      const pulse = (performance.now() / 600) % 1;
      ctx.strokeStyle = `rgba(224,32,43,${0.5 * (1 - pulse)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, headR(p) + 10 + pulse * 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (world.effects[i].some((e) => e.kind === "speed") && Math.abs(p.vx) > 1) {
      const back = p.vx > 0 ? -1 : 1;
      ctx.strokeStyle = "rgba(36,18,26,0.4)";
      ctx.lineWidth = 2.5;
      for (const dy of [-14, 0, 14]) {
        ctx.beginPath();
        ctx.moveTo(p.x + back * (headR(p) + 4), p.y + dy * sc);
        ctx.lineTo(p.x + back * (headR(p) + 22), p.y + dy * sc);
        ctx.stroke();
      }
    }
    // boot swings out on a kick
    if (p.kickT > 0) {
      const box = footBox(p);
      const f = facing(p.side);
      const bx = f === 1 ? box.x1 - 10 : box.x0 + 10;
      ctx.fillStyle = m.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(bx, box.y1 - 9 * sc, 14 * sc, 9 * sc, f * -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (!img) return;
    const flip = needsFlip(p.side, m.faces);
    const f = facing(p.side);
    const lean = p.kickT > 0 ? -f * 0.18 : p.onGround ? 0 : f * 0.05;
    const sh = SPR_H * sc;
    const w = spriteW(img) * sc; // uniform: width and height scale together
    ctx.save();
    // Bottom of the sprite sits on the feet; centred on the player's x.
    ctx.translate(p.x, feet + 4 * sc - sh / 2);
    ctx.rotate(lean);
    if (flip) ctx.scale(-1, 1); // mirror about the player's centre line
    ctx.drawImage(img, -w / 2, -sh / 2, w, sh);
    ctx.restore();
  };

  const drawBall = () => {
    const b = world.ball;
    const lift = GROUND - (b.y + BALL_R);
    const s = Math.max(0.3, 1 - lift / 260);
    ctx.fillStyle = "rgba(36,18,26,0.22)";
    ctx.beginPath();
    ctx.ellipse(b.x, GROUND + 3, 14 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!ballSprite) return;
    // b.rot advances with horizontal velocity (cup-world), so it rolls and spins.
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    const size = ballSprite.width / ballK; // sprite canvas in logical px (ball + margin)
    ctx.drawImage(ballSprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  };

  // --- Goal celebration -----------------------------------------------------------
  const spawnConfetti = (color: string) => {
    if (reduced) return;
    const tints = [color, mix(color, "#ffffff", 0.45), mix(color, "#24121a", 0.25), "#ffffff"];
    for (let i = 0; i < 48; i++) {
      const fromLeft = i % 2 === 0;
      confetti.push({
        x: W / 2 + (fromLeft ? -40 : 40) + (Math.random() - 0.5) * 30,
        y: 110 + (Math.random() - 0.5) * 20,
        vx: (fromLeft ? -1 : 1) * (80 + Math.random() * 320),
        vy: -(260 + Math.random() * 360),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 16,
        w: 5 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        color: tints[i % tints.length],
      });
    }
  };
  const stepConfetti = (dt: number) => {
    for (const c of confetti) {
      c.vy += 900 * dt;
      c.vx *= 1 - 0.9 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
    }
    // Clean up anything that has left the pitch — nothing accumulates.
    confetti = confetti.filter((c) => c.y < H + 20 && c.x > -30 && c.x < W + 30);
  };
  const drawConfetti = () => {
    for (const c of confetti) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
  };
  /** GOAL! — pops in (scale 0.3 → 1.15 → 1), holds, fades; static under reduced motion. */
  const drawGoalText = () => {
    const t = GOAL_PAUSE_S - world.phaseT; // seconds into the celebration
    let sc = 1;
    let alpha = 1;
    if (!reduced) {
      if (t < 0.18) sc = 0.3 + (1.15 - 0.3) * (t / 0.18);
      else if (t < 0.3) sc = 1.15 - 0.15 * ((t - 0.18) / 0.12);
      const fade = GOAL_PAUSE_S - 0.3;
      if (t > fade) alpha = Math.max(0, 1 - (t - fade) / 0.3);
    }
    const color = lastScorer === "left" ? me.color : cpu.color;
    const big = Math.max(56, 34 / scale);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, 112);
    ctx.scale(sc, sc);
    ctx.rotate(reduced ? 0 : -0.05);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.font = `700 ${big}px 'General Sans', Arial, sans-serif`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = INK;
    ctx.strokeText("GOAL!", 0, 0);
    ctx.fillStyle = color;
    ctx.fillText("GOAL!", 0, 0);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    const small = Math.max(16, 13 / scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${small}px 'General Sans', Arial, sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    const who = lastScorer === "left" ? `${me.label} scores` : `${cpu.label} scores`;
    ctx.strokeText(who, W / 2, 112 + big * 0.75);
    ctx.fillStyle = "#fff6e9";
    ctx.fillText(who, W / 2, 112 + big * 0.75);
    ctx.restore();
  };

  const banner = (text: string, sub: string, color = "#fff6e9") => {
    const big = Math.max(40, 26 / scale);
    const small = Math.max(16, 13 / scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.font = `700 ${big}px 'General Sans', Arial, sans-serif`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, W / 2, 120);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, 120);
    if (sub) {
      ctx.font = `600 ${small}px 'General Sans', Arial, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeText(sub, W / 2, 120 + big * 0.85);
      ctx.fillStyle = "#fff6e9";
      ctx.fillText(sub, W / 2, 120 + big * 0.85);
    }
  };

  const draw = () => {
    if (pitch) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pitch, 0, 0);
      ctx.restore();
    }
    drawGoals();
    drawPowerUp();
    drawPlayer(world.players[0], 0);
    drawPlayer(world.players[1], 1);
    if (world.effects.some((l) => l.some((e) => e.kind === "bouncy"))) {
      ctx.strokeStyle = "rgba(255,79,154,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(world.ball.x, world.ball.y, BALL_R + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawBall();
    drawFloats();
    if (state === "ready") banner("Tap to kick off", "Arrows / A D move · Up / Space jump · Down / S kick");
    else if (state === "paused") banner("Paused", "Tap or press any key to carry on");
    else if (world.phase === "kickoff") banner("Kick off!", "");
    if (world.phase === "goal") drawGoalText();
    drawConfetti();
  };

  const drawPowerUp = () => {
    const pu = world.power;
    if (!pu) return;
    const now = performance.now() / 1000;
    const meta = POWER_META[pu.kind];
    const low = pu.ttl < 2.5;
    const blinkOff = low && !reduced && Math.floor(now * 6) % 2 === 0;
    const bob = reduced ? 0 : Math.sin(now * 4) * 3;
    const pulse = reduced ? 1 : 1 + Math.sin(now * 6) * 0.07;
    ctx.save();
    ctx.translate(pu.x, pu.y + bob);
    ctx.globalAlpha = blinkOff ? 0.35 : 1;
    // countdown ring: the white arc shrinks as it runs out
    ctx.strokeStyle = low ? "#e0202b" : "#fff6e9";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, POWER_R + 5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pu.ttl) / POWER_TTL);
    ctx.stroke();
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.arc(0, 0, POWER_R, 0, Math.PI * 2);
    ctx.fillStyle = meta.color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    drawIcon(ctx, pu.kind, POWER_R);
    ctx.restore();
  };
  const drawFloats = () => {
    for (const f of floats) {
      const p = world.players[f.i];
      const rise = reduced ? 0 : f.t * 24;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.max(15, 12 / scale)}px 'General Sans', Arial, sans-serif`;
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
      const y = p.y - headR(p) - 22 - rise;
      ctx.strokeText(f.text, p.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, y);
      ctx.restore();
    }
  };

  // --- Scoreboard --------------------------------------------------------------------
  // Active effects per player, with seconds left (DOM, repainted only on change).
  let fxShown = ["", ""];
  const paintEffects = () => {
    for (const i of [0, 1] as const) {
      const html = world.effects[i]
        .map((e) => {
          const m = POWER_META[e.kind];
          return `<span class="cu-fxchip" style="--fx:${m.color};--fxfg:${m.fg}">${m.label} <b>${Math.ceil(e.t)}s</b></span>`;
        })
        .join("");
      if (html !== fxShown[i]) {
        fxShown[i] = html;
        $(`[data-fx-${i === 0 ? "left" : "right"}]`).innerHTML = html;
      }
    }
  };

  const paintBoard = () => {
    $("[data-score-left]").textContent = String(world.score[0]);
    $("[data-score-right]").textContent = String(world.score[1]);
  };
  const paintClock = () => {
    const s = Math.ceil(world.time);
    if (s === shownSecond) return;
    shownSecond = s;
    $("[data-clock]").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const setupBoard = () => {
    const sides = [
      ["left", me, "You"],
      ["right", cpu, "CPU"],
    ] as const;
    for (const [side, m, who] of sides) {
      const t = root.querySelector<HTMLElement>(`[data-team="${side}"]`)!;
      t.style.setProperty("--team", m.color);
      t.style.setProperty("--team-fg", m.textOn === "light" ? "#fff" : INK);
      const face = $<HTMLImageElement>(`[data-face-${side}]`);
      face.src = m.img.src;
      face.width = m.img.w;
      face.height = m.img.h;
      face.classList.toggle("cu-face--flip", needsFlip(side, m.faces));
      const name = $(`[data-name-${side}]`);
      name.textContent = m.label;
      const sr = document.createElement("span");
      sr.className = "ag-sr";
      sr.textContent = ` (${who})`;
      name.append(sr);
    }
    shownSecond = -1;
    paintBoard();
    paintClock();
  };

  // --- Loop ----------------------------------------------------------------------------
  const frame = (now: number) => {
    if (state !== "running") return;
    const dt = Math.min(0.05, (now - last) / 1000);
    acc += dt;
    last = now;
    if (confetti.length) stepConfetti(dt);
    if (floats.length) {
      for (const f of floats) f.t += dt;
      floats = floats.filter((f) => f.t < 1.2);
    }
    while (acc >= STEP && world.phase !== "over") {
      think(world, 1, brain);
      step(world, STEP);
      acc -= STEP;
      for (const e of world.events.splice(0)) {
        if (e.startsWith("power:grab:")) {
          const [, , side, kind] = e.split(":") as [string, string, Side, PowerKind];
          const i = side === "left" ? 0 : 1;
          floats.push({ text: `${POWER_META[kind].label}!`, color: POWER_META[kind].color, i, t: 0 });
          live.textContent = `${i === 0 ? "You" : cpu.label} grabbed ${POWER_META[kind].label}.`;
        }
        if (e.startsWith("goal:")) {
          lastScorer = e.slice(5) as Side;
          spawnConfetti(lastScorer === "left" ? me.color : cpu.color);
          paintBoard();
          live.textContent = `Goal! ${lastScorer === "left" ? `You score` : `${cpu.label} scores`}. ${world.score[0]}–${world.score[1]}.`;
        }
      }
    }
    paintClock();
    paintEffects();
    draw();
    if (world.phase === "over") {
      window.setTimeout(endMatch, 500);
      state = "over";
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
    released();
    draw();
    pauseBtn.setAttribute("aria-label", "Resume");
  };

  const endMatch = () => {
    const [a, b] = world.score;
    const result = a > b ? "win" : a === b ? "draw" : "loss";
    const r = record();
    r[result === "win" ? "w" : result === "draw" ? "d" : "l"]++;
    save("cup:record", r);
    $("[data-end-kicker]").textContent = `Full time · ${level[0].toUpperCase()}${level.slice(1)}`;
    $("[data-end-title]").textContent = result === "win" ? "You win the cup!" : result === "draw" ? "It's a draw." : `${cpu.label} wins.`;
    $("[data-end-line]").innerHTML =
      `<img src="${me.img.src}" alt="" class="${needsFlip("left", me.faces) ? "flip" : ""}"><span></span><b>${a} – ${b}</b><span></span>` +
      `<img src="${cpu.img.src}" alt="" class="${needsFlip("right", cpu.faces) ? "flip" : ""}">`;
    const names = $("[data-end-line]").querySelectorAll("span");
    names[0].textContent = me.label;
    names[1].textContent = cpu.label;
    $("[data-end-record]").textContent = recordText(r);
    setShare(
      result === "win"
        ? `I beat ${cpu.label} ${a}-${b} in Mascot Cup with ${me.label}. Your turn.`
        : result === "draw"
          ? `I drew ${a}-${b} with ${cpu.label} in Mascot Cup playing as ${me.label}. Your turn.`
          : `${cpu.label} beat me ${b}-${a} in Mascot Cup (I was ${me.label}). Think you can do better?`,
      url,
    );
    show("end");
    live.textContent = `Full time. ${me.label} ${a}, ${cpu.label} ${b}.`;
    $("[data-end-title]").focus({ preventScroll: true });
  };

  const begin = async () => {
    const others = crew.filter((m) => m.id !== me.id);
    cpu = others[Math.floor(Math.random() * others.length)];
    const P = DIFFICULTY[level];
    world = createWorld(P.speed, 1);
    brain = createBrain(P);
    confetti = [];
    floats = [];
    fxShown = ["", ""];
    $("[data-fx-left]").innerHTML = "";
    $("[data-fx-right]").innerHTML = "";
    state = "ready";
    show("play");
    root.scrollIntoView({ block: "start", behavior: "instant" });
    setupBoard();
    try {
      const [a, b, l] = await Promise.all([loadImage(me.img.src), loadImage(cpu.img.src), logoImg ? Promise.resolve(logoImg) : loadImage(logo.src)]);
      imgs = [a, b];
      logoImg = l;
    } catch {
      /* draw what loaded */
    }
    resize(); // builds the pitch for these colours
    stage.focus({ preventScroll: true });
  };

  // --- Input ------------------------------------------------------------------------
  const human = () => world.players[0].input;
  const held = { left: new Set<string>(), right: new Set<string>() };
  const syncHeld = () => {
    human().left = held.left.size > 0;
    human().right = held.right.size > 0;
  };
  const released = () => {
    held.left.clear();
    held.right.clear();
    syncHeld();
    root.querySelectorAll(".cu-btn.is-down").forEach((b) => b.classList.remove("is-down"));
  };
  const wake = () => {
    if (state === "ready" || state === "paused") {
      run();
      return true;
    }
    return false;
  };
  const tapAction = (a: "jump" | "kick") => {
    if (wake()) return;
    if (state === "running") human()[a] = true;
  };

  const KEYS: Record<string, "left" | "right" | "jump" | "kick"> = {
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    ArrowUp: "jump", KeyW: "jump", Space: "jump", ArrowDown: "kick", KeyS: "kick",
  };
  document.addEventListener("keydown", (e) => {
    if (screens.play.hidden || state === "over") return;
    if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "running") pause();
      else wake();
      return;
    }
    const k = KEYS[e.code];
    if (!k) return;
    if (e.code === "Space" && (e.target as HTMLElement).closest?.("[data-pause]")) return;
    e.preventDefault();
    if (wake()) return;
    if (k === "left" || k === "right") {
      held[k].add(e.code);
      syncHeld();
    } else if (!e.repeat) tapAction(k);
  });
  document.addEventListener("keyup", (e) => {
    const k = KEYS[e.code];
    if (k === "left" || k === "right") {
      held[k].delete(e.code);
      syncHeld();
    }
  });

  // Touch pad — every button tracks its own pointer (multi-touch: move + jump).
  root.querySelectorAll<HTMLButtonElement>(".cu-btn").forEach((btn) => {
    const hold = btn.dataset.hold as "left" | "right" | undefined;
    const tap = btn.dataset.tap as "jump" | "kick" | undefined;
    const key = `pad-${hold ?? tap}`;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* fine */
      }
      btn.classList.add("is-down");
      if (hold) {
        if (wake()) return;
        held[hold].add(key);
        syncHeld();
      } else if (tap) tapAction(tap);
    });
    const up = () => {
      btn.classList.remove("is-down");
      if (hold) {
        held[hold].delete(key);
        syncHeld();
      }
    };
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("lostpointercapture", up);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });
  // Tapping the pitch starts / resumes (and is otherwise ignored).
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    wake();
  });
  pauseBtn.addEventListener("click", () => (state === "running" ? pause() : wake()));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("blur", pause);

  $("[data-go]").addEventListener("click", begin);
  $("[data-again]").addEventListener("click", begin);
  $("[data-change]").addEventListener("click", () => {
    paintRecord();
    show("select");
    root.scrollIntoView({ block: "start", behavior: "instant" });
  });
  $("[data-optin]").addEventListener("click", () => {
    show("select");
    picks.find((b) => b.getAttribute("aria-checked") === "true")?.focus();
  });

  paintRecord();
  show(matchMedia("(prefers-reduced-motion: reduce)").matches ? "rm" : "select");

  // Test hook — compiled in ONLY when the build sets PUBLIC_ARCADE_DEBUG.
  if (import.meta.env.PUBLIC_ARCADE_DEBUG) {
    (window as unknown as { __cup: unknown }).__cup = {
      world: () => world,
      state: () => state,
      sides: () => ({ me: me.id, cpu: cpu.id }),
      setCpu: (id: string) => {
        cpu = crew.find((m) => m.id === id) ?? cpu;
        setupBoard();
        return loadImage(cpu.img.src).then((i) => {
          imgs[1] = i;
          buildPitch();
          draw();
        });
      },
      flips: () => [needsFlip("left", me.faces), needsFlip("right", cpu.faces)],
      fx: () => ({ confetti: confetti.length, reduced }),
      chips: () => [$("[data-fx-left]").textContent, $("[data-fx-right]").textContent],
      draw,
    };
  }
}
