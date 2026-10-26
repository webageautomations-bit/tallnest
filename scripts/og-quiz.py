"""
Jingo quiz — share-preview (Open Graph) cards for the nine result pages.

Generates one 1200×630 card per quiz result:
  public/og/quiz-<productId>.jpg   (e.g. public/og/quiz-falsa-frenzy.jpg)
used by /jingo/arcade/quiz/<productId>/ as og:image + twitter:image, so a
shared result previews with that candy's mascot. Content comes from the data
files (no hardcoding): results in src/data/jingo-quiz.ts, names / colours in
src/data/jingo-products.ts, mascot renders via src/data/jingo-mascots.ts.
Same pipeline as scripts/og-arcade.py: HTML with the Jingo styling + General
Sans, screenshotted by headless Chromium, compressed by the project's sharp
(progressive mozjpeg q80) — targets well under 150 KB each.

Run from anywhere (needs network for the Fontshare font; Node 22.18+ so the
.ts data files can be imported directly):
  pip install playwright && python3 -m playwright install chromium   # once
  npm install                                                        # sharp
  python3 scripts/og-quiz.py
"""
import json
import pathlib
import re
import subprocess
import tempfile

from playwright.sync_api import sync_playwright

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "public" / "og"
LOGO = (REPO / "src/assets/jingo/jingo-logo-red.png").as_uri()

# Results + products straight from the TypeScript data (Node strips the types).
DUMP_JS = """
const q = await import(process.argv[1] + '/src/data/jingo-quiz.ts');
const p = await import(process.argv[1] + '/src/data/jingo-products.ts');
console.log(JSON.stringify({ results: q.results, products: p.products }));
"""


def load_data():
    out = subprocess.run(
        ["node", "--input-type=module", "-e", DUMP_JS, str(REPO)],
        cwd=REPO, check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    # jingo-mascots.ts imports a helper, so read its id → image map as text.
    mascots_src = (REPO / "src/data/jingo-mascots.ts").read_text(encoding="utf-8")
    images = dict(re.findall(r'id:\s*"([^"]+)",[^}]*?image:\s*"([^"]+)"', mascots_src))
    products = {p["id"]: p for p in data["products"]}
    cards = []
    for r in data["results"]:
        prod = products[r["productId"]]
        cards.append({
            "id": prod["id"], "name": prod["name"], "title": r["title"],
            "color": prod["color"], "tint": prod["tint"],
            "mascot": (REPO / f"src/assets/jingo/mascots/{images[r['mascotId']]}.png").as_uri(),
            "pack": (REPO / f"src/assets/jingo/products/{prod['id']}.png").as_uri(),
        })
    return cards


CSS = """
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:'General Sans',Arial,sans-serif;color:#24121a}
.card{position:relative;width:1200px;height:630px;background:var(--a);overflow:hidden}
.card::before{content:"";position:absolute;inset:0;background:
 radial-gradient(circle at 8% 88%,rgba(255,255,255,.28) 0 70px,transparent 71px),
 radial-gradient(circle at 96% 10%,rgba(255,201,60,.85) 0 90px,transparent 91px),
 radial-gradient(circle at 74% 96%,rgba(255,255,255,.3) 0 60px,transparent 61px)}
.disc{position:absolute;left:690px;top:70px;width:470px;height:470px;border-radius:50%;background:var(--t);border:6px solid #24121a;opacity:.95}
.panel{position:absolute;left:44px;top:44px;bottom:44px;width:620px;background:#fffdf8;border:5px solid #24121a;border-radius:44px;box-shadow:0 12px 0 #24121a;padding:36px 44px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}
.logo{height:58px;width:auto}
.url{font-weight:600;font-size:21px;color:#5b4450}
.pill{align-self:flex-start;margin-top:24px;padding:9px 18px;border:4px solid #24121a;border-radius:999px;background:#ffc93c;font-weight:700;font-size:20px;letter-spacing:.12em;text-transform:uppercase;box-shadow:0 5px 0 #24121a;transform:rotate(-2deg)}
.youre{margin-top:30px;font-size:40px;font-weight:600;color:#5b4450}
h1{margin-top:2px;white-space:nowrap;font-size:var(--fs);line-height:.95;letter-spacing:-.045em;font-weight:700}
.title{margin-top:16px;white-space:nowrap;font-size:54px;font-weight:700;letter-spacing:-.03em;line-height:1.05}
.title span{box-shadow:inset 0 -14px 0 var(--t)}
.m{position:absolute;left:700px;top:60px;height:470px;width:auto;max-width:460px;object-fit:contain;filter:drop-shadow(0 12px 0 rgba(36,18,26,.28))}
.pk{position:absolute;right:40px;bottom:36px;height:150px;width:auto;transform:rotate(8deg);filter:drop-shadow(0 10px 0 rgba(36,18,26,.3))}
"""


def page(c):
    fs = "104px"  # shrunk to fit on one line at render time (see FIT_JS)
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@600,700&display=block">
<style>{CSS}</style></head><body><div class="card" style="--a:{c['color']};--t:{c['tint']};--fs:{fs}">
<div class="disc"></div>
<img class="m" src="{c['mascot']}"><img class="pk" src="{c['pack']}">
<div class="panel"><div class="top"><img class="logo" src="{LOGO}"><span class="url">tallnest.com/jingo/arcade</span></div>
<span class="pill">Which Jingo candy are you?</span>
<p class="youre">You're</p><h1>{c['name']}</h1><p class="title">— <span>{c['title']}</span></p></div>
</div></body></html>"""


# Shrink the name / title lines until each fits the panel on one line.
FIT_JS = """() => {
  for (const el of document.querySelectorAll('h1, .title')) {
    let fs = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && fs > 30) { fs -= 2; el.style.fontSize = fs + 'px'; }
  }
}"""


COMPRESS_JS = """
const sharp = require("sharp");
const jobs = JSON.parse(process.argv[1]);
(async () => {
  for (const [src, out] of jobs) {
    const i = await sharp(src).resize(1200, 630)
      .jpeg({ quality: 80, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
      .toFile(out);
    console.log(`${out.split("/").pop()}  ${i.width}x${i.height}  ${(i.size / 1024).toFixed(0)} KB`);
  }
})();
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cards = load_data()
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = pathlib.Path(tmp)
        jobs = []
        with sync_playwright() as p:
            browser = p.chromium.launch()
            pg = browser.new_page(viewport={"width": 1200, "height": 630})
            for c in cards:
                html = tmpdir / f"{c['id']}.html"
                html.write_text(page(c), encoding="utf-8")
                pg.goto(html.as_uri())
                pg.evaluate("document.fonts.ready")
                pg.wait_for_timeout(400)
                pg.evaluate(FIT_JS)
                if not pg.evaluate("document.fonts.check('700 40px General Sans')"):
                    print(f"warning: General Sans didn't load for {c['id']} (offline?) — card uses the fallback font")
                png = tmpdir / f"{c['id']}.png"
                pg.screenshot(path=str(png))
                jobs.append([str(png), str(OUT / f"quiz-{c['id']}.jpg")])
            browser.close()
        subprocess.run(["node", "-e", COMPRESS_JS, json.dumps(jobs)], cwd=REPO, check=True)


if __name__ == "__main__":
    main()
