// Jingo Arcade — build-time helpers for game pages.
// Games run in the browser, so pages hand them plain JSON (via jsonForScript)
// built from the data files, with pack / mascot renders pre-sized to WebP by
// astro:assets (the source PNGs are 0.7–1.4 MB each — never ship those).
import { getImage } from "astro:assets";
import { packImage, mascotImage } from "./jingo";

export interface ArcadeImage {
  src: string;
  w: number;
  h: number;
}

// NB: never read properties of the ImageMetadata here (e.g. img.width). Astro
// marks an image whose properties are touched as "used directly" and then
// copies the full-size ORIGINAL into the build — that once added 44 unused
// 1–1.5 MB PNGs (38 MB) to dist/. getImage() reads it safely itself. Every
// width requested by the games is below the renders' natural widths (≥ 820px).
async function sized(img: ImageMetadata, width: number, quality: number): Promise<ArcadeImage> {
  const out = await getImage({ src: img, width, format: "webp", quality });
  return { src: out.src, w: Number(out.attributes.width), h: Number(out.attributes.height) };
}

/** Pack render for a product id, resized to `width` px (WebP). */
export async function packSrc(id: string, width: number, quality = 72): Promise<ArcadeImage> {
  const img = packImage(id);
  if (!img) throw new Error(`arcade: no pack render for product "${id}" (src/assets/jingo/products/${id}.png)`);
  return sized(img, width, quality);
}

/** Mascot render for a mascot image id, resized to `width` px (WebP). */
export async function mascotSrc(image: string, width: number, quality = 72): Promise<ArcadeImage> {
  const img = mascotImage(image);
  if (!img) throw new Error(`arcade: no mascot render "${image}" (src/assets/jingo/mascots/${image}.png)`);
  return sized(img, width, quality);
}

/** JSON safe to inline in <script type="application/json">. */
export const jsonForScript = (data: unknown): string =>
  JSON.stringify(data).replace(/</g, "\\u003c");

/** Absolute, canonical-host URL for a game (shared links). */
export const gameUrl = (site: URL | undefined, slug: string): string =>
  new URL(`/jingo/arcade/${slug}/`, site ?? "https://www.tallnest.com").toString();

/** Absolute URL of a quiz result landing page (/jingo/arcade/quiz/<productId>/). */
export const quizResultUrl = (site: URL | undefined, productId: string): string =>
  new URL(`/jingo/arcade/quiz/${productId}/`, site ?? "https://www.tallnest.com").toString();
