// "Delivery Dash" — world (pure; no DOM, no canvas).
// Frogger-style grid crossing. Traffic is ANALYTIC: every vehicle's position
// is a pure function of time (offset + dir·speed·t, wrapped on a loop a little
// wider than the screen), so a search can check crossability of a round
// without simulating frames — the clearability test does exactly that.
//
// Layout (rows, top → bottom):
//   0        kiryana shop front (the goal)
//   1–4      upper road: pickups, rickshaws, the truck-art truck, the Jingo truck
//   5        median with a low planter (safe)
//   6–9      lower road: motorbikes, rickshaws, pickups; a donkey cart in the slow lane
//   10       start footpath
//
// COLLISION — what was wrong and what this guarantees (see the diagnosis notes
// in the task log): hits used to be tested (a) against the DESTINATION cell
// from the instant a hop began, while the sprite was still drawn in the old
// cell, and (b) against each vehicle's full [x, x+len] span although the art
// was drawn a few px inside it. Now:
//   • the player is tested where it is DRAWN — origin cell until the hop is
//     halfway, x interpolated across sideways hops;
//   • every vehicle is drawn to exactly [x, x+len] and its hitbox is that
//     span inset by HIT_FORGIVE px — so a hit always shows visible overlap;
//   • vehicle spans are swept over the step (no tunnelling), dt is clamped,
//     and no vehicle may occupy the player's cell when a round (re)starts.

export const CELL = 40;
export const COLS = 9;
export const ROWS = 11;
export const W = COLS * CELL; // 360
export const H = ROWS * CELL; // 440
export const SHOP_ROW = 0;
export const MEDIAN_ROW = 5;
export const START_ROW = 10;
export const START_COL = 4;
export const LIVES = 3;
export const HOP_S = 0.1; // one grid step
export const MAX_DT = 1 / 30; // a long frame can never move traffic more than this
const LOOP_EXTRA = CELL * 4; // traffic loop is W + this (vehicles enter/leave off-screen)
export const LOOP = W + LOOP_EXTRA;
/** Player collision box — identical for every mascot (never derived from the sprite). */
export const HIT = { w: 24, h: 26 };
/** Vehicle hitbox = drawn body inset by this much at each end (forgiving, always visible). */
export const HIT_FORGIVE = 3;
export const DELIVERY_POINTS = 100;
export const CANDY_POINTS = 25;
export const GAP_MIN_CELLS = 2.0; // no gap is ever narrower than this

export type Kind = "bike" | "rickshaw" | "pickup" | "cart" | "truck" | "jingo";
/** Body length in cells — the renderer draws each vehicle to exactly this length. */
export const LENGTH: Record<Kind, number> = { bike: 1.1, rickshaw: 1.5, pickup: 2.0, cart: 2.3, truck: 3.0, jingo: 2.7 };

export interface Vehicle { id: number; kind: Kind; offset: number; len: number; hue: number }
export interface Lane { row: number; dir: 1 | -1; speed: number; vehicles: Vehicle[] }
export interface Candy { row: number; col: number; img: number; taken: boolean }
export interface Player {
  row: number;
  col: number;
  fromRow: number; // hop origin
  fromCol: number;
  hopT: number; // HOP_S..0 remaining
  queued: Dir | null;
  hitT: number; // >0 while flattened (respawning)
}
export type Dir = "up" | "down" | "left" | "right";
export interface HitLog {
  t: number;
  dt: number;
  cell: [number, number]; // logical cell (destination if hopping)
  drawnRow: number; // row the player is tested/drawn in
  px: [number, number]; // player box x0..x1 (screen px)
  hopProgress: number; // 0..1 (1 = settled)
  laneIndex: number;
  vehicle: { id: number; kind: Kind; x0: number; x1: number; velocity: number };
  overlapPx: number;
}
export interface World {
  t: number;
  round: number;
  lanes: Lane[];
  candies: Candy[];
  player: Player;
  lives: number;
  score: number;
  deliveries: number;
  candiesGot: number;
  over: boolean;
  events: string[]; // "hit" | "deliver" | "candy" | "over"
  hits: HitLog[]; // every death, fully described (diagnostics)
}
export type Rng = () => number;

export const isRoad = (row: number) => row !== SHOP_ROW && row !== MEDIAN_ROW && row !== START_ROW;

// --- Difficulty ---------------------------------------------------------------------
export function paramsFor(round: number) {
  const k = round - 1;
  return {
    speedMul: Math.min(2.6, 1 + 0.14 * k),
    gapMax: Math.max(GAP_MIN_CELLS + 0.4, 6 - 0.35 * k),
    candies: Math.min(4, 2 + Math.floor(k / 3)),
  };
}

const laneBaseSpeed = (row: number) => 34 + 13 * ((row * 7) % 5); // px/s, varied per lane
const SLOW_ROW = 8; // slowest lower lane — the only one with donkey carts
const laneKinds = (row: number): Kind[] =>
  row < MEDIAN_ROW
    ? ["pickup", "truck", "rickshaw", "pickup"]
    : row === SLOW_ROW
      ? ["cart", "bike", "rickshaw"]
      : ["bike", "rickshaw", "bike", "pickup"];

export function buildLanes(round: number, rng: Rng): Lane[] {
  const P = paramsFor(round);
  const lanes: Lane[] = [];
  let id = 0;
  const jingoRow = 1 + Math.floor(rng() * 4); // one branded Jingo truck per round, upper road
  for (let row = 1; row < START_ROW; row++) {
    if (!isRoad(row)) continue;
    const dir: 1 | -1 = row % 2 === 0 ? 1 : -1; // alternate lane to lane
    const speed = Math.min(260, laneBaseSpeed(row) * P.speedMul);
    const kinds = laneKinds(row);
    const vehicles: Vehicle[] = [];
    let pos = rng() * CELL * 2;
    const start = pos;
    for (;;) {
      let kind = kinds[Math.floor(rng() * kinds.length)];
      if (row === jingoRow && vehicles.length === 0) kind = "jingo";
      const len = LENGTH[kind] * CELL;
      const gap = (GAP_MIN_CELLS + rng() * (P.gapMax - GAP_MIN_CELLS)) * CELL;
      if (pos + len + GAP_MIN_CELLS * CELL > start + LOOP) break;
      vehicles.push({ id: id++, kind, offset: pos % LOOP, len, hue: Math.floor(rng() * 6) });
      pos += len + gap;
    }
    lanes.push({ row, dir, speed, vehicles });
  }
  return lanes;
}

/** Vehicle's left edge (loop coords, 0..LOOP) at time t. */
export const vehicleX = (lane: Lane, v: Vehicle, t: number): number => {
  const x = (v.offset + lane.dir * lane.speed * t) % LOOP;
  return x < 0 ? x + LOOP : x;
};
/** Loop coords → screen x (the loop is centred on the screen). */
export const toScreen = (x: number) => x - LOOP_EXTRA / 2;

/** Hitbox span [x0, x1] of a vehicle in screen px at time t (one copy; caller wraps). */
const vehicleSpan = (lane: Lane, v: Vehicle, t: number): [number, number] => {
  const s = toScreen(vehicleX(lane, v, t));
  return [s + HIT_FORGIVE, s + v.len - HIT_FORGIVE];
};

/** First vehicle in `lane` whose hitbox (swept over [t−dt, t]) overlaps [x0, x1], widened by pad. */
export function vehicleAt(lane: Lane, x0: number, x1: number, t: number, pad = 0, dt = 0): { v: Vehicle; s0: number; s1: number } | null {
  for (const v of lane.vehicles) {
    let [a0, a1] = vehicleSpan(lane, v, t);
    if (dt > 0) {
      // Sweep: union of the span now and one step ago (handles the wrap jump).
      const [b0, b1] = vehicleSpan(lane, v, t - dt);
      if (Math.abs(b0 - a0) < LOOP / 2) {
        a0 = Math.min(a0, b0);
        a1 = Math.max(a1, b1);
      }
    }
    for (const k of [-LOOP, 0, LOOP]) {
      if (x0 - pad < a1 + k && x1 + pad > a0 + k) return { v, s0: a0 + k, s1: a1 + k };
    }
  }
  return null;
}

export const cellBox = (col: number) => {
  const cx = col * CELL + CELL / 2;
  return [cx - HIT.w / 2, cx + HIT.w / 2] as const;
};

/** Cell-based test used by the crossability search (a player settled in a cell). */
export function hitAt(lanes: Lane[], row: number, col: number, t: number, pad = 0): boolean {
  if (!isRoad(row)) return false;
  const lane = lanes.find((l) => l.row === row);
  if (!lane) return false;
  const [x0, x1] = cellBox(col);
  return vehicleAt(lane, x0, x1, t, pad) !== null;
}

/** Hop progress 0..1 (1 = settled). */
export const hopProgress = (p: Player) => (p.hopT > 0 ? 1 - p.hopT / HOP_S : 1);

/** Where the player is DRAWN — and therefore tested: row + x box. */
export function playerBox(p: Player): { row: number; x0: number; x1: number; col: number } {
  const k = hopProgress(p);
  const row = k < 0.5 ? p.fromRow : p.row; // switches lanes at the hop's midpoint
  const col = p.fromCol + (p.col - p.fromCol) * k;
  const cx = col * CELL + CELL / 2;
  return { row, col, x0: cx - HIT.w / 2, x1: cx + HIT.w / 2 };
}

/** Defensive: no vehicle may sit on (row, col) — nudge any that would, keeping order. */
export function clearCell(lanes: Lane[], row: number, col: number, t: number): void {
  if (!isRoad(row)) return;
  const lane = lanes.find((l) => l.row === row);
  if (!lane) return;
  const [x0, x1] = cellBox(col);
  for (let tries = 0; tries < lane.vehicles.length * 4; tries++) {
    const hit = vehicleAt(lane, x0, x1, t, CELL / 2);
    if (!hit) return;
    hit.v.offset = (hit.v.offset + LOOP / 2) % LOOP; // send it to the far side of the loop
  }
}

function placeCandies(w: World, rng: Rng, packKinds: number): void {
  const n = paramsFor(w.round).candies;
  const used = new Set<string>();
  w.candies = [];
  while (w.candies.length < n) {
    const row = 1 + Math.floor(rng() * (START_ROW - 1));
    if (!isRoad(row)) continue;
    const col = Math.floor(rng() * COLS);
    const key = `${row}:${col}`;
    if (used.has(key)) continue;
    used.add(key);
    w.candies.push({ row, col, img: Math.floor(rng() * packKinds), taken: false });
  }
}

const freshPlayer = (): Player => ({
  row: START_ROW, col: START_COL, fromRow: START_ROW, fromCol: START_COL, hopT: 0, queued: null, hitT: 0,
});

export function startRound(w: World, rng: Rng, packKinds: number): void {
  w.t = 0;
  w.lanes = buildLanes(w.round, rng);
  placeCandies(w, rng, packKinds);
  w.player = freshPlayer();
  clearCell(w.lanes, w.player.row, w.player.col, w.t); // never spawn onto the player
}

export function createWorld(rng: Rng, packKinds = 8): World {
  const w: World = {
    t: 0, round: 1, lanes: [], candies: [], player: freshPlayer(),
    lives: LIVES, score: 0, deliveries: 0, candiesGot: 0, over: false, events: [], hits: [],
  };
  startRound(w, rng, packKinds);
  return w;
}

const DELTA: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

/** Request one grid step. Mid-hop requests are queued (one deep). */
export function move(w: World, dir: Dir): void {
  const p = w.player;
  if (w.over || p.hitT > 0) return;
  if (p.hopT > 0) {
    p.queued = dir;
    return;
  }
  const [dr, dc] = DELTA[dir];
  const row = Math.max(0, Math.min(ROWS - 1, p.row + dr));
  const col = Math.max(0, Math.min(COLS - 1, p.col + dc));
  if (row === p.row && col === p.col) return;
  p.fromRow = p.row;
  p.fromCol = p.col;
  p.row = row;
  p.col = col;
  p.hopT = HOP_S;
}

export function step(w: World, dtIn: number, rng: Rng, packKinds = 8): void {
  if (w.over) return;
  const dt = Math.min(Math.max(dtIn, 0), MAX_DT);
  w.t += dt;
  const p = w.player;

  if (p.hitT > 0) {
    p.hitT -= dt;
    if (p.hitT <= 0) {
      if (w.lives <= 0) {
        w.over = true;
        w.events.push("over");
      } else {
        Object.assign(p, freshPlayer());
        clearCell(w.lanes, p.row, p.col, w.t);
      }
    }
    return;
  }

  if (p.hopT > 0) {
    p.hopT = Math.max(0, p.hopT - dt);
    if (p.hopT === 0) {
      p.fromRow = p.row;
      p.fromCol = p.col;
      if (p.queued) {
        const q = p.queued;
        p.queued = null;
        move(w, q);
      }
    }
  }

  // Collision at the DRAWN position, against swept vehicle hitboxes.
  const box = playerBox(p);
  if (isRoad(box.row)) {
    const laneIndex = w.lanes.findIndex((l) => l.row === box.row);
    const lane = w.lanes[laneIndex];
    const hit = lane ? vehicleAt(lane, box.x0, box.x1, w.t, 0, dt) : null;
    if (hit) {
      w.lives--;
      p.hitT = 0.7;
      p.queued = null;
      w.hits.push({
        t: +w.t.toFixed(3), dt, cell: [p.row, p.col], drawnRow: box.row, px: [+box.x0.toFixed(1), +box.x1.toFixed(1)],
        hopProgress: +hopProgress(p).toFixed(2), laneIndex,
        vehicle: { id: hit.v.id, kind: hit.v.kind, x0: +hit.s0.toFixed(1), x1: +hit.s1.toFixed(1), velocity: lane.dir * lane.speed },
        overlapPx: +(Math.min(box.x1, hit.s1) - Math.max(box.x0, hit.s0)).toFixed(2),
      });
      w.events.push("hit");
      return;
    }
  }

  const candy = w.candies.find((c) => !c.taken && c.row === box.row && Math.round(box.col) === c.col);
  if (candy) {
    candy.taken = true;
    w.candiesGot++;
    w.score += CANDY_POINTS;
    w.events.push("candy");
  }

  if (p.row === SHOP_ROW && p.hopT === 0) {
    w.deliveries++;
    w.score += DELIVERY_POINTS + 25 * (w.round - 1);
    w.round++;
    w.events.push("deliver");
    startRound(w, rng, packKinds);
  }
}
