// JINGO — candy mascots (the "crew"). Each of the 9 mascots is the character
// of exactly ONE of the 9 Jingo CANDIES — no other category has mascots.
// `label` is a placeholder name — edit freely when the brand names the mascots.
// `image` is the render id: src/assets/jingo/mascots/<image>.png (transparent).
// `color` is the character's OWN colour (drives its section tint + badge).
// The product chip keeps its own pack colour from jingo-products.ts.
// `textOn` is derived from `color` for contrast — don't set it by hand.
import { products } from "./jingo-products";
import { textOnFor } from "../lib/color";

export interface JingoMascot {
  id: string;
  label: string;
  image: string;
  color: string;
  textOn: "light" | "dark";
  relatedProductIds: string[]; // exactly one candy id
}

// ── Edit labels / colours here (catalogue order of the candies) ─────────────
const crew: Omit<JingoMascot, "textOn">[] = [
  { id: "cola",          label: "Cola",          image: "cola",          color: "#E01E24", relatedProductIds: ["cola-candy"] },
  { id: "raw-mango",     label: "Raw Mango",     image: "raw-mango",     color: "#86B52E", relatedProductIds: ["kachi-keri"] },
  { id: "orange",        label: "Orange",        image: "orange",        color: "#F58220", relatedProductIds: ["tangy-candy"] },
  { id: "chilli",        label: "Chilli",        image: "chilli",        color: "#E62217", relatedProductIds: ["chilli-chaska"] },
  { id: "masala",        label: "Masala",        image: "masala",        color: "#C25418", relatedProductIds: ["chatkhari"] },
  { id: "mint",          label: "Mint",          image: "mint",          color: "#5FAEE8", relatedProductIds: ["frosty"] },
  { id: "khatti-meethi", label: "Khatti Meethi", image: "khatti-meethi", color: "#EE5E96", relatedProductIds: ["chulbuli"] },
  { id: "imli",          label: "Imli",          image: "imli",          color: "#8C3A22", relatedProductIds: ["imli-blast"] },
  { id: "falsa",         label: "Falsa",         image: "falsa",         color: "#6E2E86", relatedProductIds: ["falsa-frenzy"] },
];
// ─────────────────────────────────────────────────────────────────────────────

export const mascots: JingoMascot[] = crew.map((m) => {
  // Guard the 1:1 candy mapping at build time.
  if (m.relatedProductIds.length !== 1) {
    throw new Error(`jingo-mascots: "${m.id}" must map to exactly one candy`);
  }
  const p = products.find((x) => x.id === m.relatedProductIds[0]);
  if (!p) throw new Error(`jingo-mascots: unknown product id "${m.relatedProductIds[0]}" (${m.id})`);
  if (p.categoryId !== "candies") {
    throw new Error(`jingo-mascots: "${m.id}" maps to "${p.id}", which is not a candy`);
  }
  return { ...m, textOn: textOnFor(m.color) };
});
