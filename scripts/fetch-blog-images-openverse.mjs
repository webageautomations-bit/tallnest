#!/usr/bin/env node
/**
 * Keyless topical cover photos for The Nest blog, via the Openverse API
 * (https://api.openverse.org/ — no auth required). Downloads one landscape,
 * commercial-licensed image per post into public/blog/<slug>.jpg.
 *
 *   node scripts/fetch-blog-images-openverse.mjs
 *
 * - Discovers posts + categories from src/content/posts/*.md.
 * - Skips any public/blog/<slug>.jpg that already exists.
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

const UA = "TallNestBlogImageFetch/1.0 (+https://tallnest.com)";

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
    "&license_type=commercial&aspect_ratio=wide&page_size=20&mature=false";
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
  // Final integrity check: must be JPEG (FF D8) and non-trivial.
  const out = readFileSync(dest);
  if (out.length < 2000 || out[0] !== 0xff || out[1] !== 0xd8) {
    rmSync(dest, { force: true });
    throw new Error("post-write validation failed");
  }
  return out.length;
}

async function coverForPost({ slug, category }) {
  const dest = join(OUT_DIR, `${slug}.jpg`);
  if (existsSync(dest)) return { slug, status: "skip", localPath: `public/blog/${slug}.jpg` };

  const queries = [QUERY_BY_CATEGORY[category] ?? FALLBACK_QUERY, FALLBACK_QUERY];
  for (const query of queries) {
    let results = [];
    try {
      results = await searchOpenverse(query);
    } catch (e) {
      console.error(`  · search failed for "${query}": ${e.message}`);
      continue;
    }
    for (const r of results) {
      // Prefer full-resolution original, fall back to Openverse's own thumbnail.
      for (const candidate of [r.url, r.thumbnail].filter(Boolean)) {
        try {
          const dl = await tryDownload(candidate);
          if (!dl) continue;
          const bytes = writeJpeg(dl.buf, dl.kind, dest);
          return {
            slug,
            status: "ok",
            localPath: `public/blog/${slug}.jpg`,
            bytes,
            query,
            source: r.foreign_landing_url || r.url,
            creator: r.creator,
            license: `${r.license ?? ""} ${r.license_version ?? ""}`.trim(),
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
  const rows = [];
  for (const file of files) {
    const post = readPost(file);
    process.stdout.write(`Fetching ${post.slug} (${post.category})… `);
    const row = await coverForPost(post);
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
  console.log("");
  if (rows.some((r) => r.status === "fail")) process.exit(2);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
