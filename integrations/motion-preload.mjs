// Build-time: preload the motion chunks from <head>.
//
// Layouts load the motion bundle (GSAP + ScrollTrigger + SplitText reveals)
// with a dynamic import, only when motion is allowed. That import only starts
// after the page has parsed — on slow mobile connections that's after lazy
// images have already filled the pipe, delaying the (pre-hidden) reveal
// content. This hook injects <link rel="modulepreload"> for the motion chunk
// and its static deps into every page's <head>, gated with a media query so
// reduced-motion visitors don't fetch them (and Lenis only for fine pointers).
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MOTION = "(prefers-reduced-motion: no-preference)";
const LENIS = "(prefers-reduced-motion: no-preference) and (pointer: fine)";

function staticDeps(dir, file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(join(dir, file), "utf8");
  // static imports only: `import "./x.js"` / `from "./x.js"` (not import("..."))
  for (const m of src.matchAll(/(?:^|[;\s}])(?:import|from)\s*["']\.\/([^"']+\.js)["']/g)) {
    staticDeps(dir, m[1], seen);
  }
  return seen;
}

function htmlFiles(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (f.endsWith(".html")) out.push(p);
  }
  return out;
}

export default function motionPreload() {
  return {
    name: "motion-preload",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const astroDir = join(root, "_astro");
        const files = readdirSync(astroDir);
        const motion = files.find((f) => /^motion\.[\w-]+\.js$/.test(f));
        if (!motion) {
          logger.warn("motion chunk not found — no preloads injected");
          return;
        }
        const motionSet = staticDeps(astroDir, motion);
        const lenis = files.find((f) => /^smooth-scroll\.[\w-]+\.js$/.test(f));
        const lenisSet = lenis ? [...staticDeps(astroDir, lenis)].filter((f) => !motionSet.has(f)) : [];
        const tags = [
          ...[...motionSet].map((f) => `<link rel="modulepreload" href="/_astro/${f}" media="${MOTION}">`),
          ...lenisSet.map((f) => `<link rel="modulepreload" href="/_astro/${f}" media="${LENIS}">`),
        ].join("");
        let n = 0;
        for (const file of htmlFiles(root)) {
          const html = readFileSync(file, "utf8");
          // Skip redirect stubs and pages that opt out of the motion bundle
          // (JingoLayout motion={false} → <html data-motion="off">, e.g. games).
          if (
            !html.includes("</head>") ||
            html.includes('http-equiv="refresh"') ||
            html.includes('data-motion="off"')
          ) continue;
          writeFileSync(file, html.replace("</head>", `${tags}</head>`));
          n++;
        }
        logger.info(`modulepreload: ${motionSet.size + lenisSet.length} chunks → ${n} pages`);
      },
    },
  };
}
