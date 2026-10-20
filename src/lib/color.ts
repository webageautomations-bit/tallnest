// Small colour utilities (WCAG 2.x relative luminance / contrast).

const INK = "#24121A"; // --jg-ink
const WHITE = "#FFFFFF";

function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 'light' (white text) or 'dark' (ink text) — whichever reads better on `bg`. */
export const textOnFor = (bg: string): "light" | "dark" =>
  contrast(bg, WHITE) >= contrast(bg, INK) ? "light" : "dark";
