// "Delivery Dash" — rendering + input over delivery-world.ts.
// Art direction matches the mascots: chunky ink outlines, flat saturated fills,
// minimal shading. Shapes and gradients only (plus the mascot / pack renders).
//
// Canvas: 360 wide × (56 shop band + 440 grid + 36 street-life band) logical px,
// scaled to fit (backing store = CSS size × devicePixelRatio, capped at 2).
// The static street is pre-rendered at device density and blitted 1:1;
// each vehicle look (kind × colour × direction) is pre-rendered ONCE into a
// sprite and blitted per frame — cheap on mid-range phones. Fixed-step sim.
//
// Every vehicle sprite is drawn to exactly its world length (LENGTH × CELL), so
// what you see is what you can be hit by (hitbox = body inset HIT_FORGIVE px).
import {
  CELL,
  H,
  HOP_S,
  LENGTH,
  LIVES,
  MEDIAN_ROW,
  ROWS,
  SHOP_ROW,
  START_ROW,
  W,
  createWorld,
  move,
  step,
  toScreen,
  vehicleX,
  type Dir,
  type Kind,
  type World,
} from "./delivery-world";
import { getBest, higherIsBetter, load, recordBest, save } from "./storage";
import { setShare } from "./share";

interface Img { src: string; w: number; h: number }
interface Mascot { id: string; label: string; color: string; faces: "left" | "right"; img: Img }
interface DeliveryData { crew: Mascot[]; packs: { id: string; img: Img }[]; url: string; logo: Img }

const STEP = 1 / 120;
const INK = "#24121a";
const LW = 2.5; // the outline weight everything shares
const TOP = 56; // shop band above row 0
const BOT = 36; // street-life band below the start footpath
const SH = TOP + H + BOT; // 532
const GY = (row: number) => TOP + row * CELL; // grid row → canvas y
const MASCOT_H = 46;
const CANDY_H = 20;
const PACKS_PER_RUN = 8;
const SWIPE_PX = 22;
// Candy-pop palette (saturated, not neon), shared with the arcade
const C = {
  red: "#e0202b", sun: "#ffc93c", orange: "#ff8a1f", pink: "#ff4f9a", sky: "#38c6f4", mint: "#3fbf6a",
  grape: "#7b3ff2", cream: "#fff6e9", glass: "#bfe9ff", tyre: "#24121a", hub: "#d9d6de", skin: "#c98b5c",
  road: "#463c4f", roadSpeck: "#51465b", dash: "#f4efe6", wood: "#c98b4f", concrete: "#ddd5c9",
};
const BODY_COLOURS = [C.red, C.sky, C.sun, "#f4f1ec", C.mint, C.orange];

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export function initDelivery(): void {
  const root = document.querySelector<HTMLElement>("[data-delivery]");
  const raw = document.getElementById("delivery-data")?.textContent;
  if (!root || !raw) return;
  const { crew, packs, url, logo } = JSON.parse(raw) as DeliveryData;

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

  // --- Character select ------------------------------------------------------------
  let me = crew.find((m) => m.id === load<string>("delivery:mascot")) ?? crew[0];
  const picks = [...root.querySelectorAll<HTMLButtonElement>("[data-pick]")];
  const choose = (id: string, focus = false) => {
    me = crew.find((m) => m.id === id) ?? crew[0];
    for (const b of picks) {
      const on = b.dataset.pick === me.id;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    $("[data-go-name]").textContent = me.label;
    save("delivery:mascot", me.id);
  };
  picks.forEach((b, i) => {
    b.addEventListener("click", () => choose(b.dataset.pick!));
    b.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
      if (!d) return;
      e.preventDefault();
      choose(picks[(i + d + picks.length) % picks.length].dataset.pick!, true);
    });
  });
  choose(me.id);
  const paintBest = () => {
    const best = getBest<number>("delivery");
    $("[data-select-best]").textContent = best ? `Your best: ${best}` : "";
  };

  // --- State --------------------------------------------------------------------------
  type State = "ready" | "running" | "paused" | "over";
  let state: State = "ready";
  let world: World = createWorld(Math.random, PACKS_PER_RUN);
  let mascotImg: HTMLImageElement | null = null;
  let packImgs: HTMLImageElement[] = [];
  let logoImg: HTMLImageElement | null = null;
  let scene: HTMLCanvasElement | null = null;
  const sprites = new Map<string, HTMLCanvasElement>();
  let pf = 1;
  let scale = 1;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let faceLeft = false;

  // --- Drawing helpers (outline + flat fill) ---------------------------------------------
  type G = CanvasRenderingContext2D;
  const rr = (g: G, x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    if (typeof g.roundRect === "function") g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
  };
  const ink = (g: G, fill: string, lw = LW) => {
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = lw;
    g.strokeStyle = INK;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.stroke();
  };
  const box = (g: G, x: number, y: number, w: number, h: number, r: number, fill: string, lw = LW) => {
    rr(g, x, y, w, h, r);
    ink(g, fill, lw);
  };
  const circle = (g: G, x: number, y: number, r: number, fill: string, lw = LW) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    ink(g, fill, lw);
  };
  const poly = (g: G, pts: number[], fill: string, lw = LW) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    ink(g, fill, lw);
  };
  const wheel = (g: G, x: number, y: number, r: number) => {
    circle(g, x, y, r, C.tyre, 2);
    g.beginPath();
    g.arc(x, y, r * 0.42, 0, Math.PI * 2);
    g.fillStyle = C.hub;
    g.fill();
  };

  // --- Vehicles: drawn facing RIGHT in a local frame 0..len × 0..38 -------------------------
  const drawVehicle = (g: G, kind: Kind, len: number, hue: number, mirrored: boolean) => {
    const body = BODY_COLOURS[hue % BODY_COLOURS.length];
    switch (kind) {
      case "bike": {
        wheel(g, 8, 31, 6);
        wheel(g, len - 8, 31, 6);
        g.beginPath();
        g.moveTo(8, 31);
        g.lineTo(16, 22);
        g.lineTo(30, 22);
        g.lineTo(len - 8, 31);
        g.lineWidth = 3.5;
        g.strokeStyle = INK;
        g.stroke();
        box(g, 15, 17, 17, 7, 3, body); // tank + seat
        box(g, 30, 13, 4, 9, 1.5, INK, 1.5); // handlebar stem
        // rider
        box(g, 13, 5, 12, 13, 4, [C.sky, C.mint, C.pink, C.sun][hue % 4]);
        g.beginPath();
        g.moveTo(21, 9);
        g.lineTo(32, 14);
        g.lineWidth = 3;
        g.strokeStyle = INK;
        g.stroke();
        circle(g, 19, 3.5, 4.5, C.skin, 2);
        g.beginPath();
        g.arc(19, 3.5, 5, Math.PI, 0);
        ink(g, C.red, 2); // helmet
        circle(g, len - 4, 21, 2.5, C.sun, 1.5); // headlight
        break;
      }
      case "rickshaw": {
        // the classic three-wheeler: black canopy hood, green body, nose low at the front
        poly(g, [4, 30, 4, 17, 52, 17, len - 1, 24, len - 1, 30], C.mint);
        g.fillStyle = C.sun;
        g.fillRect(5, 20, len - 9, 3); // yellow trim
        g.beginPath();
        g.moveTo(6, 18);
        g.lineTo(6, 8);
        g.quadraticCurveTo(8, 1.5, 18, 1.5);
        g.lineTo(42, 1.5);
        g.quadraticCurveTo(50, 1.5, 52, 9);
        g.lineTo(52, 18);
        g.closePath();
        ink(g, INK); // canopy
        box(g, 11, 7, 22, 10, 2, "#5b4a66", 2); // open side
        poly(g, [42, 5, 50, 10, 50, 17, 42, 17], C.glass, 2); // windscreen
        g.fillStyle = C.sun;
        g.fillRect(8, 4, 40, 2.5); // canopy stripe
        wheel(g, 14, 31, 6);
        wheel(g, len - 7, 32, 5);
        circle(g, len - 3, 22, 2.5, C.sun, 1.5);
        break;
      }
      case "pickup": {
        // small Suzuki pickup: open bed with crates, short cab
        box(g, 2, 16, 52, 13, 3, body);
        box(g, 52, 5, len - 54, 24, 6, body);
        box(g, 57, 8, len - 66, 9, 2, C.glass, 2);
        box(g, 7, 6, 16, 11, 2, C.orange, 2); // crates
        box(g, 25, 8, 15, 9, 2, C.sun, 2);
        box(g, 41, 9, 10, 8, 2, C.orange, 2);
        g.fillStyle = INK;
        g.fillRect(2, 27, len - 4, 2);
        wheel(g, 15, 31, 6);
        wheel(g, len - 15, 31, 6);
        circle(g, len - 3, 20, 2.5, C.sun, 1.5);
        break;
      }
      case "cart": {
        // donkey cart (slow lane): cart with sacks, big spoked wheel, donkey at the front
        box(g, 2, 18, 48, 7, 2, C.wood);
        for (const [x, y] of [[10, 13], [22, 12], [34, 13]]) {
          g.beginPath();
          g.ellipse(x, y, 7, 5.5, 0, 0, Math.PI * 2);
          ink(g, "#e9d9b8", 2);
        }
        g.beginPath();
        g.moveTo(48, 22);
        g.lineTo(66, 22);
        g.lineWidth = 3;
        g.strokeStyle = INK;
        g.stroke(); // shafts
        circle(g, 24, 28, 9, C.wood, 2.5);
        g.beginPath();
        for (let a = 0; a < 6; a++) {
          g.moveTo(24, 28);
          g.lineTo(24 + Math.cos((a * Math.PI) / 3) * 8, 28 + Math.sin((a * Math.PI) / 3) * 8);
        }
        g.lineWidth = 1.5;
        g.stroke();
        // donkey
        const grey = "#9c929f";
        for (const x of [63, 69, 78, 84]) box(g, x, 22, 4, 13, 1.5, grey, 2);
        g.beginPath();
        g.ellipse(74, 18, 13, 8, 0, 0, Math.PI * 2);
        ink(g, grey);
        poly(g, [82, 14, 88, 5, len - 1, 8, len - 1, 15, 86, 20], grey);
        poly(g, [86, 6, 85, -1, 89, 4], grey, 2); // ear
        circle(g, len - 6, 9, 1.4, INK, 1);
        g.beginPath();
        g.moveTo(61, 15);
        g.lineTo(57, 24);
        g.lineWidth = 2;
        g.stroke(); // tail
        break;
      }
      case "truck": {
        // Pakistani truck art: patterned panels, a crown over the cab, a hanging fringe
        const cargo = len * 0.72;
        box(g, 2, 3, cargo, 26, 3, C.sun);
        const panelW = (cargo - 8) / 3;
        const panels = [C.red, C.sky, C.mint];
        panels.forEach((col, i) => {
          const px = 6 + i * panelW;
          box(g, px, 9, panelW - 3, 16, 2, col, 2);
          // flower motif: five petals round a centre
          const cx = px + (panelW - 3) / 2;
          for (let p = 0; p < 5; p++) {
            const a = (p * Math.PI * 2) / 5;
            g.beginPath();
            g.arc(cx + Math.cos(a) * 4, 17 + Math.sin(a) * 4, 2.2, 0, Math.PI * 2);
            g.fillStyle = C.cream;
            g.fill();
          }
          circle(g, cx, 17, 2, C.sun, 1);
        });
        // zigzag border along the top
        g.beginPath();
        for (let x = 3; x < cargo; x += 6) {
          g.moveTo(x, 3);
          g.lineTo(x + 3, 7.5);
          g.lineTo(x + 6, 3);
        }
        g.fillStyle = C.pink;
        g.fill();
        // cab + crown
        box(g, cargo + 3, 9, len - cargo - 4, 20, 5, C.orange);
        box(g, cargo + 7, 12, len - cargo - 13, 7, 2, C.glass, 2);
        poly(g, [cargo + 3, 9, cargo + 6, 1, len - 4, 1, len - 1, 9], C.pink, 2);
        for (let x = cargo + 9; x < len - 5; x += 5) {
          g.beginPath();
          g.arc(x, 5, 1.2, 0, Math.PI * 2);
          g.fillStyle = C.cream;
          g.fill();
        }
        wheel(g, 17, 31, 6);
        wheel(g, cargo - 14, 31, 6);
        wheel(g, len - 13, 31, 6);
        // hanging chain fringe (jhalar) along the bumper
        const beads = [C.red, C.sun, C.mint, C.sky];
        for (let x = 5, i = 0; x < len - 3; x += 4.5, i++) {
          const drop = 3 + (i % 3);
          g.beginPath();
          g.moveTo(x, 29);
          g.lineTo(x, 29 + drop);
          g.lineWidth = 1;
          g.strokeStyle = INK;
          g.stroke();
          g.beginPath();
          g.arc(x, 30 + drop, 1.4, 0, Math.PI * 2);
          g.fillStyle = beads[i % beads.length];
          g.fill();
        }
        break;
      }
      case "jingo": {
        // the branded Jingo delivery truck
        const cargo = len * 0.7;
        box(g, 2, 3, cargo, 26, 3, C.red);
        g.fillStyle = C.sun;
        g.fillRect(4, 24, cargo - 4, 3);
        if (logoImg) {
          // keep the logo readable on left-moving trucks: undo the mirror locally
          const lh = 13;
          const lw = (logoImg.naturalWidth / logoImg.naturalHeight) * lh;
          const cx = 2 + cargo / 2;
          g.save();
          if (mirrored) {
            g.translate(cx, 0);
            g.scale(-1, 1);
            g.translate(-cx, 0);
          }
          g.drawImage(logoImg, cx - lw / 2, 8, lw, lh);
          g.restore();
        }
        box(g, cargo + 3, 9, len - cargo - 4, 20, 5, C.cream);
        g.fillStyle = C.red;
        g.fillRect(cargo + 4, 21, len - cargo - 6, 3);
        box(g, cargo + 7, 12, len - cargo - 13, 7, 2, C.glass, 2);
        wheel(g, 17, 31, 6);
        wheel(g, cargo - 12, 31, 6);
        wheel(g, len - 13, 31, 6);
        circle(g, len - 3, 18, 2.5, C.sun, 1.5);
        break;
      }
    }
  };

  /** Pre-rendered sprite for a vehicle look (kind × colour × direction). */
  const vehicleSprite = (kind: Kind, hue: number, dir: 1 | -1): HTMLCanvasElement => {
    const key = `${kind}:${hue % BODY_COLOURS.length}:${dir}`;
    const hit = sprites.get(key);
    if (hit) return hit;
    const len = LENGTH[kind] * CELL;
    const c = document.createElement("canvas");
    const padX = 4;
    const padY = 4;
    c.width = Math.ceil((len + padX * 2) * pf);
    c.height = Math.ceil((40 + padY * 2) * pf);
    const g = c.getContext("2d")!;
    g.setTransform(pf, 0, 0, pf, padX * pf, padY * pf);
    if (dir === -1) {
      g.translate(len, 0);
      g.scale(-1, 1); // vehicles face the way they're driving
    }
    drawVehicle(g, kind, len, hue, dir === -1);
    sprites.set(key, c);
    return c;
  };

  // --- Static street (pre-rendered) -------------------------------------------------------
  const kerb = (g: G, y: number) => {
    for (let x = 0; x < W; x += 18) {
      g.fillStyle = (x / 18) % 2 ? INK : C.sun;
      g.fillRect(x, y - 3, 18, 6);
    }
  };
  const tiles = (g: G, y: number, h: number, a: string, b: string) => {
    for (let x = 0; x < W; x += 20) {
      for (let yy = y; yy < y + h; yy += 20) {
        g.fillStyle = ((x + yy) / 20) % 2 ? a : b;
        g.fillRect(x, yy, 20, Math.min(20, y + h - yy));
      }
    }
    g.strokeStyle = "rgba(36,18,26,0.12)";
    g.lineWidth = 1;
    for (let x = 0; x <= W; x += 20) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + h);
      g.stroke();
    }
  };
  const road = (g: G, fromRow: number, toRow: number) => {
    const y0 = GY(fromRow);
    const y1 = GY(toRow + 1);
    g.fillStyle = C.road;
    g.fillRect(0, y0, W, y1 - y0);
    // texture specks (deterministic)
    g.fillStyle = C.roadSpeck;
    for (let i = 0; i < 90; i++) g.fillRect((i * 97) % W, y0 + ((i * 53) % (y1 - y0)), 3, 2);
    // edge lines + lane dashes
    g.fillStyle = "rgba(244,239,230,0.6)";
    g.fillRect(0, y0 + 4, W, 2);
    g.fillRect(0, y1 - 6, W, 2);
    g.fillStyle = C.dash;
    for (let r = fromRow + 1; r <= toRow; r++) for (let x = 8; x < W; x += 30) g.fillRect(x, GY(r) - 1.5, 16, 3);
    // zebra crossing (decor) across the road at the right
    g.fillStyle = "rgba(244,239,230,0.9)";
    for (let y = y0 + 9; y < y1 - 9; y += 11) g.fillRect(283, y, 34, 6);
  };

  const buildScene = () => {
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext("2d", { alpha: false })!;
    g.setTransform(pf, 0, 0, pf, 0, 0);

    // Warm sky behind the shop
    const sky = g.createLinearGradient(0, 0, 0, TOP);
    sky.addColorStop(0, "#ffd29a");
    sky.addColorStop(1, "#ffe9c8");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, TOP);

    // ===== Kiryana shop (the goal) =====
    box(g, 6, 4, W - 12, TOP + 6, 4, "#7fd4c8"); // facade
    box(g, 16, 8, W - 32, 16, 3, C.red); // signboard
    g.fillStyle = C.cream;
    g.font = "700 10px 'General Sans', Arial, sans-serif";
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText("KIRYANA STORE", 26, 16.5);
    if (logoImg) {
      const lh = 11;
      const lw = (logoImg.naturalWidth / logoImg.naturalHeight) * lh;
      g.drawImage(logoImg, W - 92 - lw, 10.5, lw, lh); // clear of the pause button
    }
    // striped awning with scallops
    for (let x = 10, i = 0; x < W - 10; x += 17, i++) {
      g.fillStyle = i % 2 ? C.cream : C.red;
      g.fillRect(x, 25, 17, 9);
      g.beginPath();
      g.arc(x + 8.5, 34, 8.5, 0, Math.PI);
      g.fill();
    }
    g.lineWidth = LW;
    g.strokeStyle = INK;
    g.strokeRect(10, 25, W - 20, 9);
    // half-raised shutter (left)
    box(g, 20, 42, 96, 20, 2, "#5b4a66", 2);
    box(g, 20, 42, 96, 9, 2, "#c7c2cc", 2);
    g.strokeStyle = "rgba(36,18,26,0.35)";
    g.lineWidth = 1;
    for (let y = 44; y < 51; y += 2.5) {
      g.beginPath();
      g.moveTo(22, y);
      g.lineTo(114, y);
      g.stroke();
    }
    // Jingo rack (middle): two shelves of packs
    box(g, 128, 42, 104, 22, 2, "#5b4a66", 2);
    g.fillStyle = C.wood;
    g.fillRect(130, 51, 100, 2.5);
    g.fillRect(130, 60, 100, 2.5);
    packImgs.slice(0, 8).forEach((img, i) => {
      const ph = 7.5;
      const pw = Math.min(11, ph * (img.naturalWidth / img.naturalHeight));
      const x = 134 + (i % 4) * 25;
      const y = i < 4 ? 51 - ph : 60 - ph;
      g.drawImage(img, x, y, pw, ph);
    });
    // Jingo poster (right)
    box(g, 244, 41, 52, 22, 3, C.red, 2);
    if (logoImg) {
      const lh = 11;
      const lw = (logoImg.naturalWidth / logoImg.naturalHeight) * lh;
      g.drawImage(logoImg, 270 - lw / 2, 46, lw, lh);
    }
    box(g, 306, 44, 36, 14, 3, C.sun, 2); // "open" board
    g.fillStyle = INK;
    g.font = "700 8px 'General Sans', Arial, sans-serif";
    g.textAlign = "center";
    g.fillText("OPEN", 324, 51.5);

    // Row 0 — shop front: footpath, counter, doormat ("deliver here")
    tiles(g, GY(SHOP_ROW), CELL, "#f3dcb8", "#ead0a6");
    box(g, 116, GY(SHOP_ROW) - 2, 128, 13, 3, C.wood);
    box(g, 120, GY(SHOP_ROW) + 6, 120, 9, 2, C.red, 2);
    box(g, 150, GY(SHOP_ROW) + 22, 60, 13, 3, C.sun, 2);
    g.fillStyle = INK;
    for (const x of [166, 180, 194]) {
      g.beginPath();
      g.moveTo(x - 5, GY(SHOP_ROW) + 32);
      g.lineTo(x, GY(SHOP_ROW) + 26);
      g.lineTo(x + 5, GY(SHOP_ROW) + 32);
      g.lineWidth = 2;
      g.strokeStyle = INK;
      g.stroke();
    }
    kerb(g, GY(1));

    // Roads, median planter, start footpath
    road(g, 1, MEDIAN_ROW - 1);
    road(g, MEDIAN_ROW + 1, START_ROW - 1);
    const my = GY(MEDIAN_ROW);
    g.fillStyle = C.concrete;
    g.fillRect(0, my, W, CELL);
    for (let x = 6; x < W; x += 88) {
      box(g, x, my + 4, 80, 16, 3, "#b8aea1", 2); // low planter
      for (let k = 0; k < 5; k++) circle(g, x + 10 + k * 15, my + 6, 7, k % 2 ? C.mint : "#2f9a52", 2);
      for (let k = 0; k < 4; k++) circle(g, x + 17 + k * 15, my + 3, 2, [C.pink, C.sun][k % 2], 1);
    }
    kerb(g, my);
    kerb(g, my + CELL);
    tiles(g, GY(START_ROW), CELL, "#efd3ae", "#e4c399");
    kerb(g, GY(START_ROW));

    // ===== Street life (bottom band) =====
    const by = GY(ROWS); // 496
    g.fillStyle = "#d9bf98";
    g.fillRect(0, by, W, BOT);
    g.fillStyle = "rgba(36,18,26,0.15)";
    g.fillRect(0, by, W, 2);
    // chai stall
    box(g, 10, by + 10, 70, 20, 3, C.orange);
    for (let x = 10, i = 0; x < 80; x += 10, i++) {
      g.fillStyle = i % 2 ? C.cream : C.red;
      g.fillRect(x, by + 3, 10, 7);
    }
    g.lineWidth = 2;
    g.strokeStyle = INK;
    g.strokeRect(10, by + 3, 70, 7);
    g.fillStyle = C.cream;
    g.font = "700 9px 'General Sans', Arial, sans-serif";
    g.textAlign = "center";
    g.fillText("CHAI", 45, by + 21);
    circle(g, 70, by + 5, 4, C.hub, 1.5); // kettle
    g.beginPath();
    g.moveTo(70, by - 1);
    g.quadraticCurveTo(73, by - 5, 70, by - 9);
    g.lineWidth = 1.5;
    g.strokeStyle = "rgba(36,18,26,0.45)";
    g.stroke(); // steam
    wheel(g, 22, by + 31, 4);
    wheel(g, 68, by + 31, 4);
    // handcart (thela) with fruit
    box(g, 116, by + 14, 62, 10, 2, C.wood);
    for (let k = 0; k < 7; k++) circle(g, 122 + k * 8, by + 10, 4, [C.orange, C.sun, C.mint][k % 3], 1.5);
    g.beginPath();
    g.moveTo(178, by + 18);
    g.lineTo(196, by + 12);
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    circle(g, 147, by + 28, 6, C.wood, 2);
    // lamp post
    box(g, 236, by - 26, 4, 60, 2, "#5b4a66", 2);
    box(g, 230, by - 32, 16, 8, 3, C.sun, 2);
    // tree
    box(g, 314, by - 4, 9, 38, 2, "#8c5a35", 2);
    circle(g, 306, by - 10, 13, "#2f9a52");
    circle(g, 328, by - 12, 14, C.mint);
    circle(g, 318, by - 22, 13, "#2f9a52");
    scene = c;
  };

  // --- Sizing ---------------------------------------------------------------------------
  const resize = () => {
    const cssW = canvas.clientWidth || W;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    scale = cssW / W;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(((cssW * SH) / W) * dpr);
    const nextPf = canvas.width / W;
    if (Math.abs(nextPf - pf) > 0.001) sprites.clear(); // re-render sprites at the new density
    pf = nextPf;
    ctx.setTransform(pf, 0, 0, pf, 0, 0);
    ctx.imageSmoothingQuality = "high";
    buildScene();
    if (state !== "running") draw();
  };
  new ResizeObserver(resize).observe(canvas);

  // --- Frame ----------------------------------------------------------------------------
  const draw = () => {
    if (scene) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(scene, 0, 0);
      ctx.restore();
    }
    const w = world;
    // Loose candies: a white sticker disc keeps them readable on the asphalt
    for (const c of w.candies) {
      if (c.taken) continue;
      const img = packImgs[c.img];
      if (!img) continue;
      const cx = c.col * CELL + CELL / 2;
      const cy = GY(c.row) + CELL / 2 + Math.sin(w.t * 4 + c.col) * 1.5;
      circle(ctx, cx, cy, 13, C.cream, 2);
      const ch = CANDY_H;
      const cw = Math.min(22, ch * (img.naturalWidth / img.naturalHeight));
      const dh = cw / (img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, cx - cw / 2, cy - dh / 2, cw, dh);
    }
    // Traffic — sprites drawn to exactly their world span, blitted 1:1 at whole
    // device pixels (no resampling: the cheap path on low-end phones).
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const lane of w.lanes) {
      for (const v of lane.vehicles) {
        const x = toScreen(vehicleX(lane, v, w.t));
        const spr = vehicleSprite(v.kind, v.hue, lane.dir);
        for (const xx of [x, x - (W + CELL * 4), x + (W + CELL * 4)]) {
          if (xx > W || xx + v.len < 0) continue;
          ctx.drawImage(spr, Math.round((xx - 4) * pf), Math.round((GY(lane.row) - 3) * pf));
        }
      }
    }
    ctx.restore();
    // Player — hop tween + arc; mascot at its natural ratio; carton held in front
    const p = w.player;
    const k = p.hopT > 0 ? 1 - p.hopT / HOP_S : 1;
    const col = p.fromCol + (p.col - p.fromCol) * k;
    const row = p.fromRow + (p.row - p.fromRow) * k;
    const cx = col * CELL + CELL / 2;
    const feet = TOP + row * CELL + CELL - 3;
    const arc = p.hopT > 0 ? Math.sin(Math.PI * k) * 8 : 0;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(cx, feet, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mascotImg) {
      const mh = MASCOT_H;
      const mw = mh * (mascotImg.naturalWidth / mascotImg.naturalHeight);
      ctx.save();
      ctx.translate(cx, feet - arc);
      if (p.hitT > 0) ctx.scale(1.25, 0.35); // flattened
      const flip = (faceLeft ? "left" : "right") !== me.faces;
      ctx.save();
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(mascotImg, -mw / 2, -mh, mw, mh);
      ctx.restore();
      box(ctx, -12, -25, 24, 16, 2, C.wood, 2.5); // carton
      ctx.fillStyle = C.red;
      ctx.fillRect(-12, -20, 24, 4);
      ctx.restore();
    }
    // Overlays
    if (state === "ready" || state === "paused") {
      ctx.fillStyle = "rgba(36,18,26,0.55)";
      ctx.fillRect(0, 0, W, SH);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.cream;
      ctx.font = `700 ${Math.max(28, 22 / scale)}px 'General Sans', Arial, sans-serif`;
      ctx.fillText(state === "ready" ? "Tap to start" : "Paused", W / 2, SH / 2 - 20);
      ctx.font = `600 ${Math.max(15, 12 / scale)}px 'General Sans', Arial, sans-serif`;
      ctx.fillText(state === "ready" ? "Swipe, tap the pad or use the arrows" : "Tap or press a key to carry on", W / 2, SH / 2 + 16);
    } else if (p.hitT > 0) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.max(26, 20 / scale)}px 'General Sans', Arial, sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.strokeText("Beep beep!", W / 2, GY(MEDIAN_ROW) + CELL / 2);
      ctx.fillStyle = C.sun;
      ctx.fillText("Beep beep!", W / 2, GY(MEDIAN_ROW) + CELL / 2);
    }
  };

  // --- HUD ---------------------------------------------------------------------------
  const paintHud = () => {
    $("[data-hud-score]").textContent = String(world.score);
    $("[data-hud-deliveries]").textContent = String(world.deliveries);
    $("[data-hud-round]").textContent = String(world.round);
    $("[data-hud-lives]").innerHTML = Array.from({ length: LIVES }, (_, i) => `<span class="${i < world.lives ? "" : "off"}">♥</span>`).join("");
    $("[data-hud-lives-chip]").setAttribute("aria-label", `Lives: ${world.lives} of ${LIVES}`);
  };

  // --- Loop ---------------------------------------------------------------------------
  const frame = (now: number) => {
    if (state !== "running") return;
    acc += Math.min(0.05, (now - last) / 1000); // a long frame can't teleport traffic
    last = now;
    while (acc >= STEP && !world.over) {
      step(world, STEP, Math.random, packImgs.length || PACKS_PER_RUN);
      acc -= STEP;
      for (const e of world.events.splice(0)) {
        if (e === "deliver") live.textContent = `Delivered! Round ${world.round}.`;
        else if (e === "hit") {
          live.textContent = `Hit! ${world.lives} li${world.lives === 1 ? "fe" : "ves"} left.`;
          if (import.meta.env.PUBLIC_ARCADE_DEBUG) console.info("[delivery] hit", world.hits.at(-1));
        } else if (e === "candy") live.textContent = "Candy +25.";
        paintHud();
      }
    }
    draw();
    if (world.over) {
      end();
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

  const end = () => {
    state = "over";
    cancelAnimationFrame(raf);
    const { best, isNew } = recordBest<number>("delivery", world.score, higherIsBetter);
    $("[data-end-title]").textContent = world.deliveries ? `${world.deliveries} deliver${world.deliveries === 1 ? "y" : "ies"} made.` : "Shop's closed.";
    $("[data-end-deliveries]").textContent = String(world.deliveries);
    $("[data-end-candies]").textContent = String(world.candiesGot);
    $("[data-end-score]").textContent = String(world.score);
    $("[data-end-best]").textContent = String(best);
    $("[data-end-new]").hidden = !isNew;
    setShare(`I made ${world.deliveries} deliver${world.deliveries === 1 ? "y" : "ies"} in Delivery Dash. Think you can beat the traffic?`, url);
    show("end");
    live.textContent = `Out of lives. ${world.deliveries} deliveries, score ${world.score}.`;
    $("[data-end-title]").focus({ preventScroll: true });
  };

  const begin = async () => {
    world = createWorld(Math.random, PACKS_PER_RUN);
    faceLeft = false;
    state = "ready";
    show("play");
    root.scrollIntoView({ block: "start", behavior: "instant" });
    paintHud();
    const pool = packs.slice().sort(() => Math.random() - 0.5).slice(0, PACKS_PER_RUN);
    try {
      const [m, l, ...ps] = await Promise.all([
        loadImage(me.img.src),
        logoImg ? Promise.resolve(logoImg) : loadImage(logo.src),
        ...pool.map((p) => loadImage(p.img.src)),
      ]);
      mascotImg = m;
      logoImg = l;
      packImgs = ps;
      await document.fonts?.ready; // the shop sign uses General Sans
    } catch {
      /* draw what loaded */
    }
    sprites.clear();
    resize();
    stage.focus({ preventScroll: true });
  };

  // --- Input ---------------------------------------------------------------------------
  const go = (dir: Dir) => {
    if (state === "ready" || state === "paused") return run();
    if (state !== "running") return;
    if (dir === "left") faceLeft = true;
    else if (dir === "right") faceLeft = false;
    move(world, dir);
  };
  const KEYS: Record<string, Dir> = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  };
  document.addEventListener("keydown", (e) => {
    if (screens.play.hidden || state === "over") return;
    if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "running") pause();
      else run();
      return;
    }
    const d = KEYS[e.code];
    if (!d) return;
    e.preventDefault();
    if (!e.repeat) go(d);
  });
  let swipe: { id: number; x: number; y: number; fired: boolean } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    stage.focus({ preventScroll: true });
    if (state !== "running") {
      run();
      return;
    }
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* fine */
    }
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
  });
  stage.addEventListener("pointermove", (e) => {
    const s = swipe;
    if (!s || s.fired || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    s.fired = true;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  });
  const endSwipe = (e: PointerEvent) => {
    const s = swipe;
    if (!s || e.pointerId !== s.id) return;
    if (!s.fired && e.type === "pointerup") go("up"); // tap = step forward
    swipe = null;
  };
  stage.addEventListener("pointerup", endSwipe);
  stage.addEventListener("pointercancel", endSwipe);
  root.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("is-down");
      go(btn.dataset.dir as Dir);
    });
    const up = () => btn.classList.remove("is-down");
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });
  pauseBtn.addEventListener("click", () => (state === "running" ? pause() : run()));
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

  // Test hook — compiled in ONLY when the build sets PUBLIC_ARCADE_DEBUG.
  if (import.meta.env.PUBLIC_ARCADE_DEBUG) {
    (window as unknown as { __dd: unknown }).__dd = { world: () => world, state: () => state, hits: () => world.hits, top: TOP };
  }
}
