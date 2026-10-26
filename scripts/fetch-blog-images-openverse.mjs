#!/usr/bin/env node
/**
 * Keyless topical cover photos for The Nest blog, via the Openverse API
 * (https://api.openverse.org/ — no auth required). Downloads one landscape,
 * CC BY image per post into public/blog/<slug>.jpg (og:image) and
 * src/assets/blog/<slug>.jpg (the copy astro:assets optimises for the pages).
 *
 *   node scripts/fetch-blog-images-openverse.mjs
 *
 * - Discovers posts + categories from src/content/posts/*.md; searches a
 *   post-specific query when QUERY_BY_SLUG has one, else its category's.
 * - Skips any public/blog/<slug>.jpg that already exists.
 * - Never reuses a photo: results whose source is already some post's
 *   coverCreditUrl (or was picked earlier in this run) are skipped.
 * - Skips results narrower than MIN_WIDTH; downscales anything wider than
 *   MAX_WIDTH (sips) so covers stay sharp but light.
 * - Prints the coverCredit / coverCreditUrl / coverLicense lines to paste into
 *   each new post's frontmatter (CC BY needs a followable credit).
 * - Validates every download is a real image (JPEG/PNG/WebP/GIF magic bytes,
 *   non-trivial size) — never an HTML error page saved as .jpg. Non-JPEG images
 *   are converted to JPEG with `sips`. Tries the next result on any failure.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const POSTS_DIR = join(ROOT, "src/content/posts");
const OUT_DIR = join(ROOT, "public/blog");

const QUERY_BY_CATEGORY = {
  Distribution: "warehouse shipping boxes",
  "Brand Building": "candy sweets colorful",
  "FMCG Insights": "grocery store shelf",
};
const FALLBACK_QUERY = "confectionery candy";
// Post-specific searches (more topical than the category default).
const QUERY_BY_SLUG = {
  "what-a-distributor-actually-does": "sweet shop jars",
  "questions-before-signing-a-distributorship": "contract pen signing",
  "how-exclusive-territories-work": "map pins",
};
// Results reviewed by eye and rejected as off-topic — never picked again.
const REJECTED = new Set([
  "https://www.flickr.com/photos/39415781@N06/6065806434", // museum shopfront exterior, no sweets in frame
]);
const MAX_WIDTH = 1024;
// Covers render up to ~1000px wide (21:9 on the post page) — skip smaller originals.
const MIN_WIDTH = 1000;
const ASSETS_DIR = join(ROOT, "src/assets/blog");

const UA = "TallNestBlogImageFetch/1.0 (+https://www.tallnest.com)";

function readPost(file) {
  const raw = readFileSync(join(POSTS_DIR, file), "utf8");
  const block = (raw.match(/^---\s*([\s\S]*?)\s*---/) || [, ""])[1];
  const grab = (k) => {
    const m = block.match(new RegExp(`^${k}:\\s*(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
  };
  return {
    slug: grab("slug") ?? file.replace(/\.(md|mdx)$/, ""),
    category: grab("category"),
    creditUrl: grab("coverCreditUrl"),
  };
}

/** Detect image type from magic bytes; null if not a known image (e.g. HTML). */
function imageKind(buf) {
  if (buf.length < 100) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";
  return null;
}

async function searchOpenverse(query) {
  const url =
    "https://api.openverse.org/v1/images/?q=" +
    encodeURIComponent(query) +
    "&license=by&aspect_ratio=wide&page_size=20&mature=false";
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (res.status !== 200) throw new Error(`search HTTP ${res.status}`);
  const json = await res.json();
  return json.results ?? [];
}

async function tryDownload(u) {
  const res = await fetch(u, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (res.status !== 200) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const kind = imageKind(buf);
  if (!kind || buf.length < 3000) return null; // reject HTML pages / tiny files
  return { buf, kind };
}

/** Write buf as a valid JPEG at dest (converting via sips if needed). */
function writeJpeg(buf, kind, dest) {
  if (kind === "jpeg") {
    writeFileSync(dest, buf);
  } else {
    const tmp = dest + `.tmp.${kind}`;
    writeFileSync(tmp, buf);
    execFileSync("sips", ["-s", "format", "jpeg", tmp, "--out", dest], { stdio: "ignore" });
    rmSync(tmp, { force: true });
  }
  const width = Number(
    (execFileSync("sips", ["-g", "pixelWidth", dest], { encoding: "utf8" }).match(/pixelWidth: (\d+)/) || [])[1],
  );
  if (width > MAX_WIDTH) {
    execFileSync("sips", ["-s", "formatOptions", "82", "--resampleWidth", String(MAX_WIDTH), dest], { stdio: "ignore" });
  }
  // Final integrity check: must be JPEG (FF D8) and non-trivial.
  const out = readFileSync(dest);
  if (out.length < 2000 || out[0] !== 0xff || out[1] !== 0xd8) {
    rmSync(dest, { force: true });
    throw new Error("post-write validation failed");
  }
  return out.length;
}

async function coverForPost({ slug, category }, used) {
  const dest = join(OUT_DIR, `${slug}.jpg`);
  if (existsSync(dest)) return { slug, status: "skip", localPath: `public/blog/${slug}.jpg` };

  const queries = [
    ...(QUERY_BY_SLUG[slug] ? [QUERY_BY_SLUG[slug]] : []),
    QUERY_BY_CATEGORY[category] ?? FALLBACK_QUERY,
    FALLBACK_QUERY,
  ];
  for (const query of queries) {
    let results = [];
    try {
      results = await searchOpenverse(query);
    } catch (e) {
      console.error(`  · search failed for "${query}": ${e.message}`);
      continue;
    }
    for (const r of results) {
      const source = r.foreign_landing_url || r.url;
      if (used.has(source) || REJECTED.has(source)) continue; // already used / rejected
      if (r.width && r.width < MIN_WIDTH) continue; // too small for a cover
      // Prefer full-resolution original, fall back to Openverse's own thumbnail.
      for (const candidate of [r.url, r.thumbnail].filter(Boolean)) {
        try {
          const dl = await tryDownload(candidate);
          if (!dl) continue;
          const bytes = writeJpeg(dl.buf, dl.kind, dest);
          mkdirSync(ASSETS_DIR, { recursive: true });
          writeFileSync(join(ASSETS_DIR, `${slug}.jpg`), readFileSync(dest));
          used.add(source);
          return {
            slug,
            status: "ok",
            localPath: `public/blog/${slug}.jpg`,
            bytes,
            query,
            source,
            creator: r.creator,
            license: `CC ${(r.license ?? "").toUpperCase()} ${r.license_version ?? ""}`.trim(),
          };
        } catch {
          /* try next candidate/result */
        }
      }
    }
  }
  return { slug, status: "fail", localPath: `public/blog/${slug}.jpg` };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = readdirSync(POSTS_DIR).filter((f) => /\.(md|mdx)$/.test(f));
  const posts = files.map(readPost);
  const used = new Set(posts.map((p) => p.creditUrl).filter(Boolean));
  const rows = [];
  for (const post of posts) {
    process.stdout.write(`Fetching ${post.slug} (${post.category})… `);
    const row = await coverForPost(post, used);
    console.log(
      row.status === "ok" ? `OK ${(row.bytes / 1024).toFixed(0)} KB`
        : row.status === "skip" ? "SKIP (exists)"
        : "FAIL",
    );
    rows.push(row);
  }

  console.log("\nProvenance");
  console.log("──────────");
  for (const r of rows) {
    console.log(
      `${r.slug.padEnd(22)} ${r.localPath.padEnd(34)} ` +
        (r.source ? `${r.source}  [${r.license}${r.creator ? `, © ${r.creator}` : ""}]` : `(${r.status})`),
    );
  }
  for (const r of rows.filter((r) => r.status === "ok")) {
    console.log(`\n${r.slug}.md frontmatter:`);
    console.log(`cover: "/blog/${r.slug}.jpg"`);
    console.log(`coverCredit: ${JSON.stringify(r.creator ?? "Unknown")}`);
    console.log(`coverCreditUrl: ${JSON.stringify(r.source)}`);
    console.log(`coverLicense: ${JSON.stringify(r.license)}`);
  }
  console.log("");
  if (rows.some((r) => r.status === "fail")) process.exit(2);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
