// "Chilli Chaska Challenge" — timing rules (pure; no DOM).
// A needle sweeps a heat gauge (0..1) back and forth; stop it inside the
// green zone. Every round the sweep gets faster and the zone narrower; the
// zone's position is random each round, so success is timing, not memory.

export const LIVES = 3;

/** Sweep speed in gauge-widths per second for a round (1-based). */
export const sweepSpeed = (round: number, reduced = false): number =>
  Math.min(1.6, 0.5 + 0.09 * (round - 1)) * (reduced ? 0.6 : 1);

/** Target-zone width (fraction of the gauge) for a round (1-based). */
export const zoneWidth = (round: number): number => Math.max(0.07, 0.28 * 0.88 ** (round - 1));

/** Random zone centre that keeps the whole zone on the gauge with a margin. */
export const zoneCentre = (width: number, rng: () => number = Math.random): number => {
  const lo = width / 2 + 0.03;
  const hi = 1 - width / 2 - 0.03;
  return lo + rng() * (hi - lo);
};

export interface StopResult {
  hit: boolean;
  /** 0 (zone edge) … 1 (dead centre); 0 on a miss. */
  accuracy: number;
  perfect: boolean;
  points: number;
  /** Which side a miss landed on. */
  side: "low" | "high" | null;
  grade: string;
}

/** Score a stop at needle position `p` against a zone. */
export function judge(p: number, centre: number, width: number, round: number): StopResult {
  const off = Math.abs(p - centre);
  const half = width / 2;
  if (off > half) {
    return { hit: false, accuracy: 0, perfect: false, points: 0, side: p < centre ? "low" : "high", grade: p < centre ? "Too mild!" : "Too hot!" };
  }
  const accuracy = 1 - off / half;
  const perfect = off <= Math.max(0.012, width * 0.1);
  const roundBonus = 1 + (round - 1) * 0.15;
  const base = (40 + 160 * accuracy) * roundBonus;
  const points = Math.round(perfect ? base * 1.5 : base);
  return { hit: true, accuracy, perfect, points, side: null, grade: perfect ? "Perfect!" : accuracy > 0.6 ? "Great!" : "Good" };
}

/** Advance a ping-pong needle; returns the new position and direction. */
export function sweep(p: number, dir: 1 | -1, speed: number, dt: number): { p: number; dir: 1 | -1 } {
  let next = p + dir * speed * dt;
  let d = dir;
  // Reflect off the ends (loop handles very large dt safely).
  while (next > 1 || next < 0) {
    if (next > 1) {
      next = 2 - next;
      d = -1;
    } else {
      next = -next;
      d = 1;
    }
  }
  return { p: next, dir: d };
}
