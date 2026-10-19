// Jingo zone helpers — derived views over src/data/jingo-products.ts.
// Nothing here hardcodes product names or product colours; it only reads the
// data file. The category accent map below is Jingo *theme* (the data file has
// no category colour) and falls back gracefully for any future category id.
import {
  categories,
  products,
  type JingoCategory,
  type JingoProduct,
} from "../data/jingo-products";

export { categories, products };
export type { JingoCategory, JingoProduct };

export const productsIn = (categoryId: string): JingoProduct[] =>
  products.filter((p) => p.categoryId === categoryId);

export const categoryById = (id: string): JingoCategory | undefined =>
  categories.find((c) => c.id === id);

/** Text colour token for a product's `textOn`. */
export const textOnColor = (p: JingoProduct): string =>
  p.textOn === "light" ? "var(--jg-white)" : "var(--jg-ink)";

/** "Rs. 5–50" — min/max across every category price string. */
export function priceRange(): { min: number; max: number; label: string } {
  const nums = categories.flatMap((c) =>
    (c.price.match(/\d+/g) ?? []).map(Number),
  );
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, label: `Rs. ${min}–${max}` };
}

export const flavourLabel = (n: number): string =>
  `${n} flavour${n === 1 ? "" : "s"}`;

/** Category names as a readable list: "candies, toffees … and nimkos". */
export function categoryList(): string {
  const names = categories.map((c) => c.name.toLowerCase());
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "");
}

// ---------------------------------------------------------------------------
// Category theme — the "spirit" of each range, in Jingo palette tokens.
// ---------------------------------------------------------------------------
export interface CategoryTheme {
  bg: string;
  fg: string;
  badgeBg: string;
  badgeFg: string;
}

const THEME: Record<string, CategoryTheme> = {
  // Tangy, chilli, masala — hot.
  candies: { bg: "var(--jg-red)", fg: "var(--jg-white)", badgeBg: "var(--jg-sun)", badgeFg: "var(--jg-ink)" },
  // Rich, buttery, chewy — golden.
  toffees: { bg: "var(--jg-sun)", fg: "var(--jg-ink)", badgeBg: "var(--jg-paper)", badgeFg: "var(--jg-ink)" },
  // Squeezable liquid chocolate — indulgent.
  squizo: { bg: "var(--jg-choco)", fg: "var(--jg-cream)", badgeBg: "var(--jg-pink)", badgeFg: "var(--jg-ink)" },
  // Twist lollipops — fruity, bright.
  lollipops: { bg: "var(--jg-lime)", fg: "var(--jg-ink)", badgeBg: "var(--jg-paper)", badgeFg: "var(--jg-ink)" },
  // Bublo bubblegum — bubblegum pink, obviously.
  bubblegums: { bg: "var(--jg-pink)", fg: "var(--jg-ink)", badgeBg: "var(--jg-paper)", badgeFg: "var(--jg-ink)" },
  // Choco Chums — playful bite-size.
  bunties: { bg: "var(--jg-sky)", fg: "var(--jg-ink)", badgeBg: "var(--jg-paper)", badgeFg: "var(--jg-ink)" },
  // Mehfil savoury — warm, spiced.
  nimkos: { bg: "var(--jg-tangerine)", fg: "var(--jg-ink)", badgeBg: "var(--jg-paper)", badgeFg: "var(--jg-ink)" },
};

const FALLBACK: CategoryTheme[] = [
  { bg: "var(--jg-grape)", fg: "var(--jg-white)", badgeBg: "var(--jg-sun)", badgeFg: "var(--jg-ink)" },
  { bg: "var(--jg-mint)", fg: "var(--jg-ink)", badgeBg: "var(--jg-paper)", badgeFg: "var(--jg-ink)" },
  { bg: "var(--jg-bubble)", fg: "var(--jg-ink)", badgeBg: "var(--jg-paper)", badgeFg: "var(--jg-ink)" },
];

export const categoryTheme = (id: string, index = 0): CategoryTheme =>
  THEME[id] ?? FALLBACK[index % FALLBACK.length];

// ---------------------------------------------------------------------------
// Flavour teaser — an auto-curated "handful" from products[].
// One product per category first, then fill; each pick maximises hue distance
// from what's already chosen (weighted by chroma), so the preview shows off
// the colour system instead of five shades of chocolate. Fully data-driven:
// change the data file and the teaser follows.
// ---------------------------------------------------------------------------
function hueChroma(hex: string): { h: number; c: number } {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  let h = 0;
  if (c) {
    if (max === r) h = ((g - b) / c) % 6;
    else if (max === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, c };
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export function teaserProducts(count = 8): JingoProduct[] {
  const picks: JingoProduct[] = [];
  const score = (p: JingoProduct) => {
    const { h, c } = hueChroma(p.color);
    const spread = picks.length
      ? Math.min(...picks.map((q) => hueDistance(h, hueChroma(q.color).h)))
      : 180;
    return spread * (c + 0.05);
  };
  const best = (pool: JingoProduct[]) =>
    pool.reduce((a, b) => (score(b) > score(a) ? b : a));

  for (const cat of categories) {
    if (picks.length >= count) break;
    const pool = productsIn(cat.id);
    if (pool.length) picks.push(best(pool));
  }
  while (picks.length < count) {
    const pool = products.filter((p) => !picks.includes(p));
    if (!pool.length) break;
    picks.push(best(pool));
  }
  return picks;
}
