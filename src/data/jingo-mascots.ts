// JINGO — flavour mascots (the "crew"). One entry per character.
// `label` is a placeholder name — edit freely when the brand names the mascots.
// `image` is the render id: src/assets/jingo/mascots/<image>.png (transparent).
// `color` is the character's OWN colour (drives its section tint + badge).
// Product chips keep their own pack colours from jingo-products.ts.
// `textOn` is derived from `color` for contrast — don't set it by hand.
import { products } from "./jingo-products";
import { textOnFor } from "../lib/color";

export interface JingoMascot {
  id: string;
  label: string;
  image: string;
  color: string;
  textOn: "light" | "dark";
  relatedProductIds: string[];
}

// ── Edit labels / colours / related products here ───────────────────────────
const crew: Omit<JingoMascot, "textOn">[] = [
  { id: "cola",          label: "Cola",          image: "cola",          color: "#E01E24", relatedProductIds: ["cola-candy", "cola-twist"] },
  { id: "chilli",        label: "Chilli",        image: "chilli",        color: "#E62217", relatedProductIds: ["chilli-chaska", "chilli-twist"] },
  { id: "mint",          label: "Mint",          image: "mint",          color: "#5FAEE8", relatedProductIds: ["frosty", "frosty-bublo"] },
  { id: "orange",        label: "Orange",        image: "orange",        color: "#F58220", relatedProductIds: ["tangy-candy", "tangy-twist", "orangey-bublo"] },
  { id: "falsa",         label: "Falsa",         image: "falsa",         color: "#6E2E86", relatedProductIds: ["falsa-frenzy"] },
  { id: "masala",        label: "Masala",        image: "masala",        color: "#C25418", relatedProductIds: ["chatkhari"] },
  { id: "chocolate",     label: "Chocolate",     image: "chocolate",     color: "#8C3A22", relatedProductIds: ["choco-champ", "double-choco", "choco-chums"] },
  { id: "raw-mango",     label: "Raw Mango",     image: "raw-mango",     color: "#86B52E", relatedProductIds: ["kachi-keri"] },
  { id: "khatti-meethi", label: "Khatti Meethi", image: "khatti-meethi", color: "#EE5E96", relatedProductIds: ["chulbuli"] },
];
// ─────────────────────────────────────────────────────────────────────────────

export const mascots: JingoMascot[] = crew.map((m) => {
  for (const id of m.relatedProductIds) {
    if (!products.some((p) => p.id === id)) {
      throw new Error(`jingo-mascots: unknown related product id "${id}" (${m.id})`);
    }
  }
  return { ...m, textOn: textOnFor(m.color) };
});
