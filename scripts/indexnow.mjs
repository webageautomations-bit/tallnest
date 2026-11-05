#!/usr/bin/env node
// Ping IndexNow (Bing, and through it ChatGPT Search) after a deploy.
//
//   npm run indexnow                      → every URL in the LIVE sitemap
//   npm run indexnow -- <url> [<url>…]    → only these URLs
//
// Arguments may be absolute (https://www.tallnest.com/partners/) or
// root-relative (/partners/). URLs come from the deployed site, never dist/,
// so only pages that are actually live can be submitted.
//
// Ownership proof is public/<KEY>.txt (body = the key, nothing else). There is
// no registration step: IndexNow fetches keyLocation to validate each request.

const HOST = "www.tallnest.com";
const ORIGIN = `https://${HOST}`;
const KEY = "e0cc3efc28164e1fa4e944aee6324dcd";
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const SITEMAP = `${ORIGIN}/sitemap-0.xml`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

const STATUS = {
  200: "OK — URLs accepted.",
  202: "Accepted — URLs received; key validation is still pending.",
  400: "Bad request — the request body is malformed.",
  403: `Forbidden — the key file is invalid or unreachable (${KEY_LOCATION}).`,
  422: `Unprocessable — one or more URLs don't belong to ${HOST}, or the key doesn't match.`,
  429: "Too many requests — rate limited. Wait before submitting again.",
};

const fail = (msg) => {
  console.error(`indexnow: ${msg}`);
  process.exit(1);
};

async function get(url) {
  try {
    return await fetch(url, { redirect: "manual", headers: { "cache-control": "no-cache" } });
  } catch (err) {
    fail(`could not reach ${url} (${err.cause?.code ?? err.message})`);
  }
}

// ── 1. URLs: CLI arguments, or every <loc> in the live sitemap ───────────────
async function urlsFromSitemap() {
  const res = await get(SITEMAP);
  if (res.status !== 200) fail(`${SITEMAP} returned HTTP ${res.status}; expected 200.`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  if (locs.length === 0) fail(`no <loc> entries found in ${SITEMAP}.`);
  return locs;
}

function urlsFromArgs(args) {
  return args.map((arg) => {
    let url;
    try {
      url = new URL(arg, ORIGIN);
    } catch {
      fail(`"${arg}" is not a valid URL.`);
    }
    // Catch a host mismatch here rather than as an opaque 422 from the API.
    if (url.host !== HOST) fail(`"${arg}" is not on ${HOST}; IndexNow would reject it (422).`);
    return url.href;
  });
}

const args = process.argv.slice(2);
const urlList = [...new Set(args.length ? urlsFromArgs(args) : await urlsFromSitemap())];

// ── 2. Key file must be live, or the API answers 403 with no explanation ─────
{
  const res = await get(KEY_LOCATION);
  if (res.status !== 200) {
    fail(
      `key file ${KEY_LOCATION} returned HTTP ${res.status}` +
        (res.headers.get("location") ? ` → ${res.headers.get("location")}` : "") +
        `; expected 200. Deploy public/${KEY}.txt first — submitting now would fail with 403.`,
    );
  }
  const body = (await res.text()).trim();
  if (body !== KEY) {
    fail(`key file ${KEY_LOCATION} is live but its body doesn't match the key (got "${body.slice(0, 60)}").`);
  }
}

// ── 3. Submit ────────────────────────────────────────────────────────────────
console.log(`indexnow: submitting ${urlList.length} URL${urlList.length === 1 ? "" : "s"} for ${HOST}`);
for (const u of urlList) console.log(`  ${u}`);

let res;
try {
  res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });
} catch (err) {
  fail(`could not reach ${ENDPOINT} (${err.cause?.code ?? err.message})`);
}

const detail = (await res.text()).trim();
console.log(`\nHTTP ${res.status}: ${STATUS[res.status] ?? `Unexpected response (${res.statusText || "no status text"}).`}`);
if (detail) console.log(detail.slice(0, 500));
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
