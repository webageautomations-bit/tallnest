// "Mascot Runner" — world simulation (pure; no DOM, no canvas).
// Physics, the obstacle scheduler and collisions live here so the game can be
// simulated headless (the clearability test runs thousands of these).
//
// Responses the player has:  JUMP (+ one mid-air double-jump) and FAST-FALL.
//   crate / tall / wide / gum / LOW flyer  → must be jumped
//   HIGH flyer (mid-height)                → stay grounded, or fast-fall
//                                            under it (it hits anyone mid-jump)
//
// Scheduler: obstacles are planned by ARRIVAL TIME at the player, with a
// minimum gap after the previous one that depends on the two responses
// involved (jump→jump needs time to land, jump→duck can force a fast-fall,
// etc.). Gaps never go below those minimums, so no pattern is impossible;
// difficulty comes from speed, a shrinking random extra gap, more obstacle
// types, more flyers and ground+air combos as distance grows.

export const W = 600;
export const H = 400;
export const GROUND = 340; // ground top
export const PX_PER_M = 20;

export const GRAVITY = 2600;
export const JUMP_V = 880; // ~149px apex
export const DOUBLE_V = 780;
export const FASTFALL_V = 1500; // instant downward kick…
export const FASTFALL_G = 3; // …and heavier gravity until landing
export const START_SPEED = 300;
export const MAX_SPEED = 760;
export const ACCEL_PER_PX = 0.02;
export const BUFFER_S = 0.12;
/** Fixed simulation step (s). The game loop accumulates frame time and steps
 *  in these increments, so physics is identical at 30, 60 or 120 fps. */
export const STEP = 1 / 120;
export const COYOTE_S = 0.08;

export const PLAYER = { x: 92, w: 62, h: 76 };
/** Forgiving hitbox inside the player sprite. */
export const HB = { dx: 14, dy: 10, w: 34, h: 60 };
const HB_FRONT = PLAYER.x + HB.dx + HB.w;
export const PACK = { w: 34, h: 44 };
export const PACK_POINTS = 25;
export const FLYER = { w: 46, h: 28, v: 100 };
/** Low flyer spans 48→20px above the ground: jump it. */
export const LOW_TOP = GROUND - 48;
/** High flyer spans 108→80px above the ground; a grounded runner's hitbox
 *  tops out 66px up, so it passes overhead — but hits anyone mid-jump. */
export const HIGH_TOP = GROUND - 108;
const INSET = 3; // obstacle hitbox inset

export type Kind = "crate" | "tall" | "wide" | "gum" | "low" | "high";
export type Rng = () => number;

export interface Obstacle { kind: Kind; x: number; y: number; w: number; h: number; v: number; hue: number; t: number }
export interface Pickup { x: number; y: number; img: number; taken: boolean; t: number }
interface Planned { kind: Kind; arrive: number; w: number; h: number; y: number; v: number; hue: number }
interface PlannedPack { arrive: number; y: number; img: number }

export interface World {
  clock: number;
  dist: number;
  speed: number;
  y: number; // player top
  vy: number;
  onGround: boolean;
  canDouble: boolean;
  sinceGround: number;
  bufferT: number;
  fastFall: boolean;
  collected: number;
  over: boolean;
  obstacles: Obstacle[];
  pickups: Pickup[];
  plan: Planned[];
  planPacks: PlannedPack[];
  planEnd: number; // time the last planned obstacle has fully passed
  lastKind: Kind | null;
  packKinds: number; // how many pack images this run has
  /** Counters for tests / tuning. */
  stats: Record<Kind | "combo", number>;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const respond = (k: Kind) => (k === "high" ? "duck" : "jump");

export function createWorld(packKinds = 8): World {
  return {
    clock: 0, dist: 0, speed: START_SPEED,
    y: GROUND - PLAYER.h, vy: 0, onGround: true, canDouble: true, sinceGround: 0, bufferT: -1, fastFall: false,
    collected: 0, over: false,
    obstacles: [], pickups: [], plan: [], planPacks: [],
    planEnd: 1.6, lastKind: null, packKinds,
    stats: { crate: 0, tall: 0, wide: 0, gum: 0, low: 0, high: 0, combo: 0 },
  };
}

export const meters = (w: World): number => Math.floor(w.dist / PX_PER_M);
export const score = (w: World): number => meters(w) + w.collected * PACK_POINTS;

// --- Difficulty ---------------------------------------------------------------
export function difficulty(m: number) {
  const t = clamp01(m / 2500);
  return {
    /** Max random extra gap (s) on top of the minimum — shrinks with distance. */
    extra: 1.25 - 0.95 * t,
    /** Ground obstacle types in rotation (unlocked by distance). */
    ground: (["crate", m >= 100 && "gum", m >= 200 && "tall", m >= 350 && "wide"].filter(Boolean) as Kind[]),
    flyerChance: m < 300 ? 0 : Math.min(0.5, 0.15 + (m - 300) / 2500),
    highShare: m < 500 ? 0 : 0.55,
    comboChance: m < 800 ? 0 : Math.min(0.35, 0.08 + (m - 800) / 3000),
  };
}

/** Minimum gap (s) between the previous obstacle passing and the next arriving. */
function minGap(prev: Kind | null, next: Kind, combo: boolean): number {
  if (!prev) return 0;
  const a = respond(prev);
  const b = respond(next);
  if (a === "jump" && b === "jump") return 0.62 + (prev === "tall" ? 0.06 : 0);
  if (a === "jump" && b === "duck") return combo ? 0.22 : 0.7;
  if (a === "duck" && b === "jump") return 0.3;
  return 0.25; // duck → duck
}

function shape(kind: Kind, rng: Rng): { w: number; h: number; y: number; v: number } {
  const r = (lo: number, hi: number) => lo + rng() * (hi - lo);
  switch (kind) {
    case "crate": { const h = r(34, 60); return { w: r(34, 50), h, y: GROUND - h, v: 0 }; }
    case "gum": { const h = r(30, 44); return { w: r(44, 56), h, y: GROUND - h, v: 0 }; }
    case "tall": { const h = r(72, 92); return { w: r(30, 40), h, y: GROUND - h, v: 0 }; }
    case "wide": { const h = r(30, 44); return { w: r(70, 90), h, y: GROUND - h, v: 0 }; }
    case "low": return { w: FLYER.w, h: FLYER.h, y: LOW_TOP, v: FLYER.v };
    case "high": return { w: FLYER.w, h: FLYER.h, y: HIGH_TOP, v: FLYER.v };
  }
}

function planOne(w: World, kind: Kind, combo: boolean, rng: Rng, extraMax: number): void {
  const s = shape(kind, rng);
  if (combo && kind === "crate") { s.h = Math.min(s.h, 50); s.y = GROUND - s.h; }
  const gap = minGap(w.lastKind, kind, combo) + (combo ? 0 : rng() * extraMax);
  const arrive = Math.max(w.planEnd + gap, w.clock + 0.9);
  const vRel = w.speed + s.v;
  w.plan.push({ kind, arrive, ...s, hue: Math.floor(rng() * 6) });
  w.planEnd = arrive + (s.w + HB.w) / vRel;
  w.lastKind = kind;
  w.stats[kind]++;

  // Packs: above ground obstacles (jump to grab), under high flyers (stay low
  // to grab), and a short ground run in roomy gaps. Never affect survival.
  if (rng() < 0.55) {
    const img = Math.floor(rng() * w.packKinds);
    if (kind === "high") w.planPacks.push({ arrive: arrive + 0.04, y: GROUND - PACK.h - 6, img });
    else if (kind !== "low") w.planPacks.push({ arrive: arrive + (s.w / 2) / w.speed - 0.03, y: s.y - PACK.h - 22, img });
  }
  if (!combo && gap > 1.0 && rng() < 0.5) {
    const img = Math.floor(rng() * w.packKinds);
    for (let i = 0; i < 3; i++) w.planPacks.push({ arrive: arrive - gap / 2 + i * 0.12, y: GROUND - PACK.h - 6, img });
  }
}

function planNext(w: World, rng: Rng): void {
  const d = difficulty(w.dist / PX_PER_M);
  if (rng() < d.comboChance) {
    // Ground + air combos that force one specific response.
    const combos: Kind[][] = [
      ["crate", "high"], // jump it, then FAST-FALL under the flyer
      ["high", "crate"], // stay down, then jump
      ["low", "high"], // jump the low one, fast-fall under the high one
      ["high", "low"], // stay down, then jump
    ];
    const c = combos[Math.floor(rng() * combos.length)];
    planOne(w, c[0], false, rng, d.extra);
    planOne(w, c[1], true, rng, d.extra);
    w.stats.combo++;
    return;
  }
  let kind: Kind;
  if (rng() < d.flyerChance) kind = rng() < d.highShare ? "high" : "low";
  else kind = d.ground[Math.floor(rng() * d.ground.length)];
  planOne(w, kind, false, rng, d.extra);
}

// --- Player actions --------------------------------------------------------------
export function jump(w: World): void {
  if (w.over) return;
  if (w.onGround || w.sinceGround < COYOTE_S) {
    w.vy = -JUMP_V;
    w.onGround = false;
    w.sinceGround = COYOTE_S;
    w.canDouble = true;
    w.fastFall = false;
  } else if (w.canDouble) {
    w.vy = -DOUBLE_V;
    w.canDouble = false;
    w.fastFall = false;
  } else {
    w.bufferT = BUFFER_S;
  }
}

/** Drop fast to the ground. No-op when already grounded. */
export function fastFall(w: World): void {
  if (w.over || w.onGround) return;
  w.fastFall = true;
  w.vy = Math.max(w.vy, FASTFALL_V);
  w.bufferT = -1;
}

const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

/**
 * Advance the world by `dt` seconds. Pass `rng` to keep planning new
 * obstacles; pass null to only play out what's already planned (lookahead).
 */
export function step(w: World, dt: number, rng: Rng | null): void {
  if (w.over) return;
  w.clock += dt;
  w.speed = Math.min(MAX_SPEED, START_SPEED + w.dist * ACCEL_PER_PX);
  const dx = w.speed * dt;
  w.dist += dx;

  if (rng) while (w.planEnd < w.clock + 3) planNext(w, rng);

  // Spawn planned obstacles / packs as they come within reach of the screen.
  for (let i = 0; i < w.plan.length; i++) {
    const p = w.plan[i];
    const x = HB_FRONT + (p.arrive - w.clock) * (w.speed + p.v);
    if (x <= W + 40) {
      w.obstacles.push({ kind: p.kind, x, y: p.y, w: p.w, h: p.h, v: p.v, hue: p.hue, t: 0 });
      w.plan.splice(i--, 1);
    }
  }
  for (let i = 0; i < w.planPacks.length; i++) {
    const p = w.planPacks[i];
    const x = HB_FRONT + (p.arrive - w.clock) * w.speed;
    if (x <= W + 40) {
      w.pickups.push({ x, y: p.y, img: p.img, taken: false, t: Math.random() * 6 });
      w.planPacks.splice(i--, 1);
    }
  }

  // Player physics
  w.vy += GRAVITY * (w.fastFall ? FASTFALL_G : 1) * dt;
  w.y += w.vy * dt;
  if (w.y >= GROUND - PLAYER.h) {
    w.y = GROUND - PLAYER.h;
    w.vy = 0;
    if (!w.onGround) {
      w.onGround = true;
      w.canDouble = true;
      w.sinceGround = 0;
      w.fastFall = false;
      if (w.bufferT > 0) {
        w.bufferT = -1;
        jump(w);
      }
    }
  } else if (w.onGround) {
    w.onGround = false;
  }
  if (!w.onGround) w.sinceGround += dt;
  if (w.bufferT > 0) w.bufferT -= dt;

  const px = PLAYER.x + HB.dx;
  const py = w.y + HB.dy;
  for (const o of w.obstacles) {
    o.x -= (w.speed + o.v) * dt;
    o.t += dt;
    if (overlap(px, py, HB.w, HB.h, o.x + INSET, o.y + INSET, o.w - INSET * 2, o.h - INSET * 2)) {
      w.over = true;
      return;
    }
  }
  for (const p of w.pickups) {
    p.x -= dx;
    p.t += dt;
    if (!p.taken && overlap(px, py, HB.w, HB.h, p.x, p.y, PACK.w, PACK.h)) {
      p.taken = true;
      w.collected++;
    }
  }
  while (w.obstacles.length && w.obstacles[0].x + w.obstacles[0].w < -40) w.obstacles.shift();
  w.obstacles = w.obstacles.length > 12 ? w.obstacles.filter((o) => o.x + o.w > -40) : w.obstacles;
  while (w.pickups.length && (w.pickups[0].x < -60 || w.pickups[0].taken)) w.pickups.shift();
}
