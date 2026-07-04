#!/usr/bin/env node
/**
 * Fetch topical stock photos for The Nest blog from the Pexels API and download
 * them into public/blog/<slug>.jpg. Dev-time only — run manually.
 *
 *   PEXELS_API_KEY=xxxxxxxx node scripts/fetch-blog-images.mjs
 *
 * - Reads the key from process.env.PEXELS_API_KEY (never hardcoded).
 * - Discovers posts + categories from src/content/posts/*.md.
 * - Skips any public/blog/<slug>.jpg that already exists (keep/swap freely).
 * - Validates HTTP 200 + JPEG magic bytes before writing; never writes a broken
 *   file. A failure on one post is logged and does not stop the others.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const POSTS_DIR = join(ROOT, "src/content/posts");
const OUT_DIR = join(ROOT, "public/blog");

const KEY = process.env.PEXELS_API_KEY;
if (!KEY) {
  console.error(
    "\n✗ PEXELS_API_KEY is not set.\n" +
      "  Get a free key at https://www.pexels.com/api/ and run:\n" +
      "    PEXELS_API_KEY=your_key node scripts/fetch-blog-images.mjs\n",
  );
  process.exit(1);
}

// Category → search query. Adjust here if categories change.
const QUERY_BY_CATEGORY = {
  Distribution: "warehouse boxes logistics",
  "Brand Building": "colorful candy shop sweets",
  "FMCG Insights": "convenience store shelf products",
};
const FALLBACK_QUERY = "candy confectionery";

/** Minimal frontmatter read — pulls `slug` and `category` without a YAML dep. */
function readPost(file) {
  const raw = readFileSync(join(POSTS_DIR, file), "utf8");
  const fm = raw.match(/^---\s*([\s\S]*?)\s*---/);
  const block = fm ? fm[1] : "";
  const grab = (k) => {
    const m = block.match(new RegExp(`^${k}:\\s*(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
  };
  const slug = grab("slug") ?? file.replace(/\.(md|mdx)$/, "");
  return { slug, category: grab("category") };
}

async function fetchPhoto(query) {
  const url =
    "https://api.pexels.com/v1/search?query=" +
    encodeURIComponent(query) +
    "&orientation=landscape&per_page=5";
  const res = await fetch(url, { headers: { Authorization: KEY } });
  if (res.status !== 200) {
    throw new Error(`search HTTP ${res.status}`);
  }
  const json = await res.json();
  const photo = json.photos?.[0];
  if (!photo) throw new Error(`no results for "${query}"`);
  const imgUrl = photo.src?.large2x || photo.src?.large;
  if (!imgUrl) throw new Error("photo has no large image URL");
  return { imgUrl, pageUrl: photo.url, photographer: photo.photographer };
}

async function download(imgUrl) {
  const res = await fetch(imgUrl);
  if (res.status !== 200) throw new Error(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // JPEG magic bytes FF D8, and a non-trivial size.
  if (buf.length < 2000 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error(`not a valid JPEG (len ${buf.length})`);
  }
  return buf;
}

async function main() {
  if (!existsSync(POSTS_DIR)) {
    console.error(`✗ posts dir not found: ${POSTS_DIR}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const files = readdirSync(POSTS_DIR).filter((f) => /\.(md|mdx)$/.test(f));
  const provenance = [];

  for (const file of files) {
    const { slug, category } = readPost(file);
    const dest = join(OUT_DIR, `${slug}.jpg`);
    const localPath = `public/blog/${slug}.jpg`;

    if (existsSync(dest)) {
      console.log(`• SKIP  ${slug} (already exists)`);
      provenance.push({ slug, localPath, source: "(kept existing)" });
      continue;
    }

    const query = QUERY_BY_CATEGORY[category] ?? FALLBACK_QUERY;
    try {
      const { imgUrl, pageUrl, photographer } = await fetchPhoto(query);
      const buf = await download(imgUrl);
      writeFileSync(dest, buf);
      console.log(`✓ OK    ${slug}  (${(buf.length / 1024).toFixed(0)} KB)  “${query}”`);
      provenance.push({ slug, localPath, source: pageUrl, photographer });
    } catch (err) {
      console.error(`✗ FAIL  ${slug}: ${err.message} — left as fallback`);
    }
  }

  console.log("\nProvenance");
  console.log("──────────");
  for (const p of provenance) {
    console.log(
      `${p.slug.padEnd(22)} ${p.localPath.padEnd(34)} ${p.source}` +
        (p.photographer ? `  (© ${p.photographer})` : ""),
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
