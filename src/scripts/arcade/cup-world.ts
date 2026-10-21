// "Mascot Cup" — world simulation (pure; no DOM, no canvas).
// Head-soccer duel: physics, power-ups, CPU brain and match flow live here so
// the game can be simulated headless (the balance test plays thousands).
//
// Feel of the genre, in numbers:
//   HEAD contact → bounce shaped into a HIGH, controlled arc (vy ≤ −480,
//                  |vx| capped ~430): good for lobs and clearing.
//   FOOT contact → FLAT and FAST along the ground (vx ≥ 430, vy ≈ −140).
//   KICK (foot, while the kick is out) → a driven shot (vx ≈ 880, vy −260).
//
// Movement: both players may run the WHOLE pitch, right up to either goal line
// (never into a goal mouth or behind it).
//
// Power-ups: one at a time spawns every 8–15 s (ground or mid-air), lives ~7 s,
// and the first player to touch it gets an ~8 s effect. Same type again
// refreshes; max 2 effects per player (the soonest-to-expire is replaced).
// Everything clears on a goal / kickoff. GROW / SHRINK scale the collision
// shape (head circle + foot box) uniformly — the renderer scales the sprite by
// the same factor on both axes. BIG GOAL changes the real goal geometry.

export const W = 720;
export const H = 405;
export const GROUND = 352;
export const STEP = 1 / 120; // fixed simulation step (frame-rate independent)
export const MATCH_SECONDS = 90;
const KICKOFF_S = 0.8;
/** Goal celebration length (s) — the renderer times GOAL! + confetti to it. */
export const GOAL_PAUSE_S = 1.3;

export const GOAL = { w: 58, h: 140, bar: 10 }; // mouth depth, height, crossbar thickness
export const BIG_GOAL = 1.32; // BIG GOAL height multiplier
export const BALL_R = 13;
const G_BALL = 1300;
const G_CHAR = 2000;
export const HEAD_R = 30;
export const BODY = { w: 36, h: 26 }; // foot box under the head
/** Head-centre y of a standard-size character standing on the ground. */
export const STAND_Y = GROUND - BODY.h - HEAD_R;
const MOVE = 290;
const JUMP_V = 700;
const KICK_S = 0.22;
const KICK_COOLDOWN = 0.36;
const MAX_BALL = 1000;

// Contact shaping
const HEADER_UP = 480;
const HEADER_MAX_X = 430;
const FOOT_VX = 430;
const FOOT_VY = 140;
const KICK_VX = 880;
const KICK_VY = 260;

// Power-ups
export type PowerKind = "bouncy" | "grow" | "biggoal" | "speed" | "shrink" | "magnet";
export const POWER_KINDS: PowerKind[] = ["bouncy", "grow", "biggoal", "speed", "shrink", "magnet"];
export const POWER_R = 16;
export const POWER_TTL = 7; // on the pitch before it despawns
export const EFFECT_S = 8;
export const MAX_EFFECTS = 2;
export const GROW = 1.35;
export const SHRINK = 0.7;
const SPEED_BOOST = 1.35;
const JUMP_BOOST = 1.15;
const MAGNET_ACCEL = 700;

export type Side = "left" | "right";
export interface Input { left: boolean; right: boolean; jump: boolean; kick: boolean }
export interface Player {
  side: Side;
  x: number;
  y: number; // head centre
  vx: number;
  vy: number;
  onGround: boolean;
  kickT: number; // >0 while the kick is out
  kickCd: number;
  touchCd: number;
  speed: number; // move-speed multiplier (CPU difficulty)
  scale: number; // GROW / SHRINK — collision and sprite both use it
  input: Input;
}
export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number; // spin angle — advances with horizontal velocity (rolls)
  /** Once over the line the ball is "dead": it settles in the net, no rebounds. */
  dead: boolean;
}
export interface PowerUp { kind: PowerKind; x: number; y: number; ttl: number }
export interface Effect { kind: PowerKind; t: number }
export type Phase = "kickoff" | "play" | "goal" | "over";
export type Contact = "head" | "foot" | "kick";
export interface World {
  time: number; // seconds left
  score: [number, number]; // [left, right]
  phase: Phase;
  phaseT: number;
  ball: Ball;
  players: [Player, Player];
  power: PowerUp | null;
  powerT: number; // seconds until the next spawn
  effects: [Effect[], Effect[]]; // per player (the GRABBER's list)
  grabs: [number, number]; // power-ups collected (stats / tests)
  /** Last contact per player — the renderer / tests read it. */
  lastContact: [Contact | null, Contact | null];
  events: string[];
}
export type Rng = () => number;

/** +1 for the left player (attacks right), −1 for the right player. */
export const facing = (side: Side): 1 | -1 => (side === "left" ? 1 : -1);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const idx = (side: Side): 0 | 1 => (side === "left" ? 0 : 1);

export const headR = (p: Player) => HEAD_R * p.scale;
export const standY = (p: Player) => GROUND - (BODY.h + HEAD_R) * p.scale;
const startX = (side: Side) => (side === "left" ? W * 0.28 : W * 0.72);
/** Whole pitch: from one goal line to the other (never into a goal mouth). */
const bounds = (p: Player): [number, number] => [GOAL.w + headR(p) + 2, W - GOAL.w - headR(p) - 2];

export const hasEffect = (w: World, i: 0 | 1, kind: PowerKind) => w.effects[i].some((e) => e.kind === kind);
/** Height of the goal on `side` (the goal at that END of the pitch). */
export const goalH = (w: World, side: Side) => {
  const attacker: 0 | 1 = side === "left" ? 1 : 0; // the left goal is attacked by the right player
  return GOAL.h * (hasEffect(w, attacker, "biggoal") ? BIG_GOAL : 1);
};
const scaleOf = (w: World, i: 0 | 1) =>
  (hasEffect(w, i, "grow") ? GROW : 1) * (hasEffect(w, (1 - i) as 0 | 1, "shrink") ? SHRINK : 1);
const bouncy = (w: World) => hasEffect(w, 0, "bouncy") || hasEffect(w, 1, "bouncy");

const newPlayer = (side: Side, speed = 1): Player => ({
  side, x: startX(side), y: STAND_Y, vx: 0, vy: 0, onGround: true,
  kickT: 0, kickCd: 0, touchCd: 0, speed, scale: 1,
  input: { left: false, right: false, jump: false, kick: false },
});

const nextSpawn = (rng: Rng) => 8 + rng() * 7;

export function createWorld(cpuSpeed = 1, playerSpeed = 1, rng: Rng = Math.random): World {
  return {
    time: MATCH_SECONDS,
    score: [0, 0],
    phase: "kickoff",
    phaseT: KICKOFF_S,
    ball: { x: W / 2, y: GROUND - 200, vx: 0, vy: 0, rot: 0, dead: false },
    players: [newPlayer("left", playerSpeed), newPlayer("right", cpuSpeed)],
    power: null,
    powerT: nextSpawn(rng),
    effects: [[], []],
    grabs: [0, 0],
    lastContact: [null, null],
    events: [],
  };
}

function clearEffects(w: World): void {
  w.effects = [[], []];
  for (const p of w.players) p.scale = 1;
}

function kickoff(w: World, rng: Rng): void {
  w.phase = "kickoff";
  w.phaseT = KICKOFF_S;
  w.ball = { x: W / 2, y: GROUND - 200, vx: 0, vy: 0, rot: w.ball.rot, dead: false };
  clearEffects(w); // every restart is fair
  w.power = null;
  w.powerT = nextSpawn(rng);
  for (const p of w.players) {
    Object.assign(p, { x: startX(p.side), y: STAND_Y, vx: 0, vy: 0, onGround: true, kickT: 0, kickCd: 0, touchCd: 0 });
  }
}

// --- Characters ---------------------------------------------------------------
function stepPlayer(w: World, i: 0 | 1, dt: number, frozen: boolean): void {
  const p = w.players[i];
  // Scale follows the active effects; a grounded character re-plants its feet.
  const s = scaleOf(w, i);
  if (s !== p.scale) {
    p.scale = s;
    if (p.onGround) p.y = standY(p);
  }
  const fast = hasEffect(w, i, "speed");
  const dir = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
  p.vx = frozen ? 0 : dir * MOVE * p.speed * (fast ? SPEED_BOOST : 1);
  if (!frozen && p.input.jump && p.onGround) {
    p.vy = -JUMP_V * (fast ? JUMP_BOOST : 1);
    p.onGround = false;
  }
  if (!frozen && p.input.kick && p.kickCd <= 0) {
    p.kickT = KICK_S;
    p.kickCd = KICK_COOLDOWN;
  }
  p.input.jump = false; // edge-triggered
  p.input.kick = false;

  p.vy += G_CHAR * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const floor = standY(p);
  if (p.y >= floor) {
    p.y = floor;
    p.vy = 0;
    p.onGround = true;
  }
  const [lo, hi] = bounds(p);
  p.x = clamp(p.x, lo, hi);
  p.kickT = Math.max(0, p.kickT - dt);
  p.kickCd = Math.max(0, p.kickCd - dt);
  p.touchCd = Math.max(0, p.touchCd - dt);
}

/** Foot box (AABB), scaled with the character. The kick swings it forward. */
export function footBox(p: Player): { x0: number; x1: number; y0: number; y1: number } {
  const s = p.scale;
  const f = facing(p.side);
  const reach = p.kickT > 0 ? 18 * s : 0;
  const grow = p.kickT > 0 ? 8 * s : 0;
  const cx = p.x + f * reach;
  return {
    x0: cx - (BODY.w / 2) * s - grow,
    x1: cx + (BODY.w / 2) * s + grow,
    y0: p.y + (HEAD_R - 6) * s,
    y1: p.y + (HEAD_R + BODY.h) * s,
  };
}

function separatePlayers(a: Player, b: Player): void {
  const minDx = (headR(a) + headR(b)) * 0.9;
  const dx = b.x - a.x;
  if (Math.abs(dx) < minDx && Math.abs(b.y - a.y) < headR(a) + headR(b)) {
    const push = (minDx - Math.abs(dx)) / 2;
    const s = dx >= 0 ? 1 : -1;
    a.x -= s * push;
    b.x += s * push;
    const [alo, ahi] = bounds(a);
    const [blo, bhi] = bounds(b);
    a.x = clamp(a.x, alo, ahi);
    b.x = clamp(b.x, blo, bhi);
  }
}

// --- Ball ------------------------------------------------------------------------
function circleRect(b: { x: number; y: number }, r: { x0: number; x1: number; y0: number; y1: number }, rad = BALL_R) {
  const cx = clamp(b.x, r.x0, r.x1);
  const cy = clamp(b.y, r.y0, r.y1);
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rad * rad) return null;
  const d = Math.sqrt(d2) || 0.0001;
  return { nx: d2 ? dx / d : 0, ny: d2 ? dy / d : -1, depth: rad - d };
}

/** Crossbars (solid goal roofs) at each goal's CURRENT height. */
export const bars = (w: World) => [
  { x0: -20, x1: GOAL.w + 6, y0: GROUND - goalH(w, "left") - GOAL.bar, y1: GROUND - goalH(w, "left") },
  { x0: W - GOAL.w - 6, x1: W + 20, y0: GROUND - goalH(w, "right") - GOAL.bar, y1: GROUND - goalH(w, "right") },
];

function stepBall(w: World, dt: number): void {
  const b = w.ball;
  const springy = bouncy(w);
  b.vy += G_BALL * dt;
  b.vx *= 1 - 0.12 * dt; // air drag
  // MAGNET: gently pulled toward the grabber's head.
  for (const i of [0, 1] as const) {
    if (!hasEffect(w, i, "magnet")) continue;
    const p = w.players[i];
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d > 20 && d < 420) {
      b.vx += (MAGNET_ACCEL * dx * dt) / d;
      b.vy += (MAGNET_ACCEL * 0.5 * dy * dt) / d;
    }
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.rot += (b.vx * dt) / BALL_R;

  // Ground: bounce with damping; settle instead of buzzing forever.
  if (b.y + BALL_R > GROUND) {
    b.y = GROUND - BALL_R;
    if (b.vy > 0) b.vy = -b.vy * (springy ? 0.93 : 0.66);
    if (Math.abs(b.vy) < (springy ? 30 : 70)) b.vy = 0;
    b.vx *= 1 - 0.9 * dt; // rolling friction
  }
  if (b.y - BALL_R < 0) {
    b.y = BALL_R;
    b.vy = Math.abs(b.vy) * (springy ? 0.95 : 0.7);
  }
  // Back walls (behind the goals)
  const wall = springy ? 0.92 : 0.6;
  if (b.x - BALL_R < 0) {
    b.x = BALL_R;
    b.vx = Math.abs(b.vx) * wall;
  } else if (b.x + BALL_R > W) {
    b.x = W - BALL_R;
    b.vx = -Math.abs(b.vx) * wall;
  }
  for (const bar of bars(w)) {
    const c = circleRect(b, bar);
    if (!c) continue;
    b.x += c.nx * c.depth;
    b.y += c.ny * c.depth;
    const vn = b.vx * c.nx + b.vy * c.ny;
    if (vn < 0) {
      const k = springy ? 1.95 : 1.7;
      b.vx -= k * vn * c.nx;
      b.vy -= k * vn * c.ny;
    }
    if (c.ny < -0.7) b.vx += (W / 2 - b.x > 0 ? 1 : -1) * 500 * dt;
  }
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAX_BALL) {
    b.vx *= MAX_BALL / sp;
    b.vy *= MAX_BALL / sp;
  }
}

function contactPlayer(w: World, i: 0 | 1): void {
  const p = w.players[i];
  const b = w.ball;
  const f = facing(p.side);
  const springy = bouncy(w);

  // HEAD — circle vs circle.
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const R = headR(p) + BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 < R * R) {
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    b.x = p.x + nx * R;
    b.y = p.y + ny * R;
    const rvx = b.vx - p.vx;
    const rvy = b.vy - p.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = springy ? 1.9 : 1.6;
      b.vx = p.vx * 0.6 + rvx - e * vn * nx;
      b.vy = p.vy * 0.6 + rvy - e * vn * ny;
      if (ny < 0.35) {
        // A header: high, controlled arc, nudged toward the opponent.
        b.vy = Math.min(b.vy, -(HEADER_UP + Math.max(0, -p.vy) * 0.35));
        b.vx = clamp(b.vx + f * 170, -HEADER_MAX_X, HEADER_MAX_X);
      }
      if (p.touchCd <= 0) {
        w.lastContact[i] = "head";
        w.events.push(`contact:${p.side}:head`);
      }
      p.touchCd = 0.08;
    }
    return;
  }

  // FOOT — circle vs box. Flat and fast; a kick drives it.
  const c = circleRect(b, footBox(p));
  if (!c) return;
  b.x += c.nx * c.depth;
  b.y += c.ny * c.depth;
  if (p.touchCd > 0) return;
  if (p.kickT > 0) {
    b.vx = f * KICK_VX + p.vx * 0.3;
    b.vy = -KICK_VY;
    w.lastContact[i] = "kick";
    w.events.push(`contact:${p.side}:kick`);
  } else if (c.ny < -0.7) {
    b.vy = -Math.abs(b.vy) * 0.5 - 120;
    b.vx += f * 80;
    w.lastContact[i] = "foot";
    w.events.push(`contact:${p.side}:foot`);
  } else {
    const away = Math.sign(c.nx) || f;
    b.vx = away * Math.max(Math.abs(b.vx) * 0.5, FOOT_VX) + p.vx * 0.5;
    b.vy = Math.min(-b.vy * 0.3, -FOOT_VY);
    w.lastContact[i] = "foot";
    w.events.push(`contact:${p.side}:foot`);
  }
  p.touchCd = 0.1;
}

/**
 * Goal-line check, SWEPT over the step: a goal is the ball's centre passing
 * the point where the whole ball is over the line at a height under THAT
 * goal's crossbar (BIG GOAL raises it). Interpolating the crossing point
 * means a shot can't skip the line between steps.
 */
function checkGoal(w: World, x0: number, y0: number): void {
  const b = w.ball;
  const under = (y: number, side: Side) => y > GROUND - goalH(w, side);
  const L = GOAL.w - BALL_R;
  const R = W - GOAL.w + BALL_R;
  if (x0 >= L && b.x < L) {
    const t = (x0 - L) / (x0 - b.x || 1);
    if (under(y0 + (b.y - y0) * t, "left")) return score(w, "right");
  }
  if (x0 <= R && b.x > R) {
    const t = (R - x0) / (b.x - x0 || 1);
    if (under(y0 + (b.y - y0) * t, "right")) return score(w, "left");
  }
  if (b.x < L && under(b.y, "left")) score(w, "right");
  else if (b.x > R && under(b.y, "right")) score(w, "left");
}

/** A dead ball drops and settles inside the net — no rebounds off the net. */
function stepDeadBall(w: World, dt: number): void {
  const b = w.ball;
  b.vy += G_BALL * dt;
  b.vx *= Math.max(0, 1 - 7 * dt); // the net soaks up the pace
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.rot += (b.vx * dt) / BALL_R;
  const left = b.x < W / 2;
  const lo = left ? BALL_R : W - GOAL.w + BALL_R;
  const hi = left ? GOAL.w - BALL_R : W - BALL_R;
  if (b.x < lo || b.x > hi) {
    b.x = Math.max(lo, Math.min(hi, b.x));
    b.vx = 0;
  }
  const roof = GROUND - goalH(w, left ? "left" : "right") + BALL_R;
  if (b.y < roof) {
    b.y = roof;
    b.vy = Math.max(0, b.vy);
  }
  if (b.y + BALL_R > GROUND) {
    b.y = GROUND - BALL_R;
    b.vy = 0;
  }
}

function score(w: World, scorer: Side): void {
  w.ball.dead = true;
  w.score[idx(scorer)]++;
  w.phase = "goal";
  w.phaseT = GOAL_PAUSE_S;
  w.power = null;
  clearEffects(w); // effects end the moment a goal goes in
  w.events.push(`goal:${scorer}`);
}

// --- Power-ups ---------------------------------------------------------------------
function spawnPower(w: World, rng: Rng): void {
  for (let tries = 0; tries < 20; tries++) {
    const x = GOAL.w + 80 + rng() * (W - 2 * GOAL.w - 160); // never in or near a goal
    const air = rng() < 0.5;
    const y = air ? GROUND - 100 - rng() * 55 : GROUND - POWER_R - 4; // mid-air ones need a jump
    const clear = w.players.every((p) => Math.abs(p.x - x) > 70); // never on top of a player
    if (!clear) continue;
    const kind = POWER_KINDS[Math.floor(rng() * POWER_KINDS.length)];
    w.power = { kind, x, y, ttl: POWER_TTL };
    w.events.push(`power:spawn:${kind}`);
    return;
  }
  w.powerT = 1; // crowded — try again shortly
}

function grabs(p: Player, pu: PowerUp): boolean {
  const r = headR(p) + POWER_R;
  if ((pu.x - p.x) ** 2 + (pu.y - p.y) ** 2 < r * r) return true;
  return circleRect(pu, footBox(p), POWER_R) !== null;
}

function applyEffect(w: World, i: 0 | 1, kind: PowerKind): void {
  const list = w.effects[i];
  const same = list.find((e) => e.kind === kind);
  if (same) same.t = EFFECT_S; // refresh, don't stack
  else {
    if (list.length >= MAX_EFFECTS) {
      list.sort((a, b) => a.t - b.t);
      list.shift(); // cap: replace the one closest to expiring
    }
    list.push({ kind, t: EFFECT_S });
  }
}

function stepPowers(w: World, dt: number, rng: Rng): void {
  for (const i of [0, 1] as const) {
    const before = w.effects[i].length;
    for (const e of w.effects[i]) e.t -= dt;
    w.effects[i] = w.effects[i].filter((e) => e.t > 0);
    if (w.effects[i].length < before) w.events.push(`fx:end:${i}`);
  }
  if (w.power) {
    w.power.ttl -= dt;
    if (w.power.ttl <= 0) {
      w.power = null;
      w.powerT = nextSpawn(rng);
      w.events.push("power:expire");
      return;
    }
    for (const i of [0, 1] as const) {
      if (grabs(w.players[i], w.power)) {
        applyEffect(w, i, w.power.kind);
        w.grabs[i]++;
        w.events.push(`power:grab:${w.players[i].side}:${w.power.kind}`);
        w.power = null;
        w.powerT = nextSpawn(rng);
        return;
      }
    }
  } else {
    w.powerT -= dt;
    if (w.powerT <= 0) spawnPower(w, rng);
  }
}

/** Advance the world by one fixed STEP. */
export function step(w: World, dt = STEP, rng: Rng = Math.random): void {
  if (w.phase === "over") return;
  const frozen = w.phase === "kickoff";
  stepPlayer(w, 0, dt, frozen);
  stepPlayer(w, 1, dt, frozen);
  separatePlayers(w.players[0], w.players[1]);

  if (w.phase === "kickoff") {
    w.phaseT -= dt;
    if (w.phaseT <= 0) w.phase = "play";
    return;
  }

  if (w.ball.dead) {
    stepDeadBall(w, dt);
  } else {
    const x0 = w.ball.x;
    const y0 = w.ball.y;
    stepBall(w, dt);
    contactPlayer(w, 0);
    contactPlayer(w, 1);
    if (w.phase === "play") checkGoal(w, x0, y0);
  }

  if (w.phase === "play") {
    stepPowers(w, dt, rng);
    w.time -= dt;
    if (w.time <= 0 && w.phase === "play") {
      w.time = 0;
      w.phase = "over";
      w.events.push("end");
    }
  } else if (w.phase === "goal") {
    w.phaseT -= dt;
    if (w.phaseT <= 0) {
      if (w.time <= 0) {
        w.phase = "over";
        w.events.push("end");
      } else kickoff(w, rng);
    }
  }
}

// --- CPU brain ------------------------------------------------------------------------
export interface AiParams {
  reaction: number; // s — sees the ball this long ago
  speed: number; // move-speed multiplier
  error: number; // px — positional error, re-rolled every ~0.6s
  jumpSkill: number; // 0..1 — how readily it goes up for high balls
  kickChance: number; // 0..1 — chance it swings when the ball is in range
  press: number; // 0..1 — chance it pushes up the pitch instead of holding its goal
  powerChase: number; // 0..1 — chance it goes for a fresh power-up instead of the ball
}

// Tuned headless against a "decent player" bot (reaction 0.16 s, ±16 px,
// full speed, presses 15% of the time, chases 60% of power-ups) over 200
// full-pitch matches with power-ups. Pressing up leaves your own goal open, so
// the harder CPUs are the more DISCIPLINED ones (lower press); they also go
// for more power-ups.
export const DIFFICULTY: Record<"easy" | "normal" | "hard", AiParams> = {
  easy: { reaction: 0.24, speed: 0.96, error: 26, jumpSkill: 0.55, kickChance: 0.5, press: 0.3, powerChase: 0.3 },
  normal: { reaction: 0.18, speed: 0.97, error: 18, jumpSkill: 0.7, kickChance: 0.6, press: 0.2, powerChase: 0.5 },
  hard: { reaction: 0.14, speed: 1, error: 12, jumpSkill: 0.85, kickChance: 0.8, press: 0.12, powerChase: 0.75 },
};

export interface Brain {
  params: AiParams;
  history: { x: number; y: number; vx: number; vy: number }[];
  err: number;
  errT: number;
  swingT: number;
  pressing: boolean;
  pressT: number;
  chase: PowerUp | null; // the power-up it decided to go for
  seenPower: PowerUp | null;
}

export const createBrain = (params: AiParams): Brain => ({
  params, history: [], err: 0, errT: 0, swingT: 0, pressing: false, pressT: 0, chase: null, seenPower: null,
});

/** Decide one STEP of input for player `i` (the CPU; also used as a test bot). */
export function think(w: World, i: 0 | 1, brain: Brain, rng: Rng = Math.random, dt = STEP): void {
  const p = w.players[i];
  const f = facing(p.side);
  const P = brain.params;
  const b = w.ball;

  // Reaction delay: act on where the ball was `reaction` seconds ago.
  brain.history.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy });
  const lag = Math.round(P.reaction / dt);
  while (brain.history.length > lag + 1) brain.history.shift();
  const seen = brain.history[0];

  brain.errT -= dt;
  if (brain.errT <= 0) {
    brain.errT = 0.6;
    brain.err = (rng() * 2 - 1) * P.error;
  }
  brain.pressT -= dt;
  if (brain.pressT <= 0) {
    brain.pressT = 1.5;
    brain.pressing = rng() < P.press;
  }
  brain.swingT = Math.max(0, brain.swingT - dt);

  const input = p.input;
  input.left = input.right = false;
  if (w.phase !== "play") return;

  const look = 0.22;
  const px = seen.x + seen.vx * look;
  const py = seen.y + seen.vy * look + 0.5 * G_BALL * look * look;
  const ownGoalX = f === 1 ? 0 : W;
  const homeX = ownGoalX + f * (GOAL.w + 95);
  const danger = Math.abs(seen.x - ownGoalX) < W * 0.35 && seen.vx * -f > 80; // ball heading at my goal

  // Power-ups: decide once per spawn whether to go for it.
  if (w.power !== brain.seenPower) {
    brain.seenPower = w.power;
    brain.chase = w.power && rng() < P.powerChase ? w.power : null;
  }
  if (brain.chase && (brain.chase !== w.power || danger)) brain.chase = null;

  const ballBehind = (seen.x - p.x) * f < -12;
  const inTheirHalf = (px - W / 2) * f > W * 0.06;
  let target: number;
  if (brain.chase) {
    target = brain.chase.x;
    if (p.onGround && brain.chase.y < p.y - headR(p) && Math.abs(brain.chase.x - p.x) < 60) input.jump = true;
  } else if (ballBehind) {
    target = seen.x - f * 70;
    if (p.onGround && seen.y > p.y && Math.abs(seen.x - p.x) < 90 && rng() < P.jumpSkill * dt * 20) input.jump = true;
  } else if (inTheirHalf && !brain.pressing) {
    target = homeX + f * clamp((px - homeX) * f * 0.3, 0, 140) + brain.err * 0.5; // hold the goal
  } else {
    target = px - f * (headR(p) * 0.6) + brain.err; // attack it — anywhere on the pitch
  }
  const [lo, hi] = bounds(p);
  target = clamp(target, lo, hi);

  const dx = target - p.x;
  if (Math.abs(dx) > 8) {
    if (dx > 0) input.right = true;
    else input.left = true;
  }

  if (!brain.chase) {
    const near = Math.abs(px - p.x) < 70;
    const high = py < p.y - headR(p) - 6;
    if (p.onGround && near && high && seen.vy > -150 && rng() < P.jumpSkill * dt * 12) input.jump = true;
  }

  const ahead = (seen.x - p.x) * f;
  if (brain.swingT <= 0 && ahead > 0 && ahead < 70 && seen.y > p.y + headR(p) * 0.3) {
    brain.swingT = 0.45;
    if (rng() < P.kickChance) input.kick = true;
  }
}
