// "Counter Rush" — pure game rules (no DOM): difficulty ramp, lookalikes,
// shelf building, scoring. Kept separate so it can be tested headless.
//
// LOOKALIKES are derived from the product data, not hardcoded: two products
// are lookalikes when their name or flavour shares a meaningful word once
// range words (candy, twist, bublo…) are ignored — e.g. Frosty / Frosty Bublo
// ("frosty", "mint"), Cola Candy / Cola Twist ("cola"), Tangy Candy / Tangy
// Twist ("tangy", "orange"), the three Mehfil nimkos ("mehfil"). Add a product
// to jingo-products.ts and it joins the right lookalike set automatically.

export interface CounterProduct {
  id: string;
  name: string;
  flavour: string;
  categoryId: string;
}

export interface LevelParams {
  level: number;
  shelf: number; // packs on the shelf
  patienceMs: number; // full patience bar
  lookalikeChance: number; // chance the target's lookalikes share the shelf
}

/** Customers served to finish a shift (the "win"). */
export const SHIFT = 30;
export const LIVES = 3;
/** Fraction of the full patience bar a wrong pack costs. */
export const WRONG_PENALTY = 0.35;

const STOP = new Set([
  "candy", "candies", "flavoured", "flavour", "twist", "bublo", "toffee", "toffees",
  "squizo", "lollipop", "lollipops", "bubblegum", "bubblegums", "bunties", "the", "and",
]);

const tokens = (p: CounterProduct): Set<string> =>
  new Set(
    `${p.name} ${p.flavour}`
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );

/** id → ids of its lookalikes (symmetric, excludes itself). */
export function lookalikeMap(products: CounterProduct[]): Map<string, string[]> {
  const toks = new Map(products.map((p) => [p.id, tokens(p)]));
  const map = new Map<string, string[]>();
  for (const a of products) {
    const ta = toks.get(a.id)!;
    map.set(
      a.id,
      products
        .filter((b) => b.id !== a.id && [...toks.get(b.id)!].some((w) => ta.has(w)))
        .map((b) => b.id),
    );
  }
  return map;
}

/** Ramp: level rises every 4 customers served. */
export function levelFor(served: number): LevelParams {
  const level = 1 + Math.floor(served / 4);
  const table: Omit<LevelParams, "level">[] = [
    { shelf: 4, patienceMs: 9000, lookalikeChance: 0 },
    { shelf: 6, patienceMs: 8000, lookalikeChance: 0 },
    { shelf: 6, patienceMs: 7000, lookalikeChance: 0.5 },
    { shelf: 9, patienceMs: 6200, lookalikeChance: 0.7 },
    { shelf: 9, patienceMs: 5400, lookalikeChance: 0.85 },
  ];
  const base = table[Math.min(level, table.length) - 1];
  const extra = Math.max(0, level - table.length);
  return {
    level,
    shelf: base.shelf,
    patienceMs: Math.max(3200, base.patienceMs - extra * 450),
    lookalikeChance: extra > 0 ? 1 : base.lookalikeChance,
  };
}

export type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Round {
  target: string;
  shelf: string[];
  /** True when the target's lookalikes were deliberately put on the shelf. */
  tricky: boolean;
}

/**
 * Pick a target and a shelf for the given level.
 * Easy levels: no two lookalikes anywhere on the shelf (visually distinct).
 * Harder levels: with `lookalikeChance`, the target is one that HAS
 * lookalikes and they're placed beside it; the rest is random fill.
 */
export function buildRound(
  products: CounterProduct[],
  looks: Map<string, string[]>,
  params: LevelParams,
  rng: Rng = Math.random,
  avoid?: string,
): Round {
  const ids = products.map((p) => p.id).filter((id) => id !== avoid);
  const tricky = rng() < params.lookalikeChance;

  if (tricky) {
    const withLooks = ids.filter((id) => (looks.get(id)?.length ?? 0) > 0);
    const target = withLooks[Math.floor(rng() * withLooks.length)];
    const twins = shuffle(looks.get(target)!, rng).slice(0, params.shelf - 1);
    const rest = shuffle(ids.filter((id) => id !== target && !twins.includes(id)), rng);
    const shelf = shuffle([target, ...twins, ...rest.slice(0, params.shelf - 1 - twins.length)], rng);
    return { target, shelf, tricky: true };
  }

  // Distinct shelf: greedily add packs that aren't lookalikes of any already chosen.
  const shelf: string[] = [];
  for (const id of shuffle(ids, rng)) {
    if (shelf.length >= params.shelf) break;
    if (shelf.some((s) => looks.get(s)?.includes(id))) continue;
    shelf.push(id);
  }
  const target = shelf[Math.floor(rng() * shelf.length)];
  return { target, shelf, tricky: false };
}

/** Combo multiplier for a streak of consecutive correct serves. */
export const multiplier = (streak: number): number => Math.min(5, 1 + Math.floor(streak / 3));

/** Points for a correct serve: base + speed bonus, times the multiplier. */
export const pointsFor = (patienceLeft: number, streak: number): number =>
  Math.round((100 + 100 * Math.max(0, Math.min(1, patienceLeft))) * multiplier(streak));
