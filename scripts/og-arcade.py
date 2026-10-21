"""
Jingo Arcade — share-preview (Open Graph) card generator.

Generates the six 1200×630 OG / Twitter cards for the arcade pages:
  public/og/arcade-hub.jpg      /jingo/arcade
  public/og/arcade-quiz.jpg     /jingo/arcade/quiz
  public/og/arcade-match.jpg    /jingo/arcade/match
  public/og/arcade-counter.jpg  /jingo/arcade/counter
  public/og/arcade-chilli.jpg   /jingo/arcade/chilli
  public/og/arcade-runner.jpg   /jingo/arcade/runner
(overwriting them). Each card is laid out in HTML with the Jingo candy-pop
styling and General Sans (from Fontshare), using the mascot / pack renders in
src/assets/jingo/, screenshotted by headless Chromium, then compressed to a
progressive mozjpeg JPEG (quality 80) by the project's own sharp — targets
well under 150 KB each. Pages pick the files up automatically (game pages via
ArcadeGameLayout's default /og/arcade-<slug>.jpg; the hub sets it directly).

Run from anywhere (needs network for the Fontshare font):
  pip install playwright && python3 -m playwright install chromium   # once
  npm install                                                        # sharp
  python3 scripts/og-arcade.py

Edit the CARDS dict below to change copy, colours or artwork.
"""
import json
import pathlib
import subprocess
import tempfile

from playwright.sync_api import sync_playwright

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "public" / "og"
M = lambda n: (REPO / f"src/assets/jingo/mascots/{n}.png").as_uri()
P = lambda n: (REPO / f"src/assets/jingo/products/{n}.png").as_uri()
LOGO = (REPO / "src/assets/jingo/jingo-logo-red.png").as_uri()

CSS = """
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:'General Sans',Arial,sans-serif;color:#24121a}
.card{position:relative;width:1200px;height:630px;background:var(--a);overflow:hidden}
.card::before{content:"";position:absolute;inset:0;background:
 radial-gradient(circle at 8% 88%,rgba(255,255,255,.28) 0 70px,transparent 71px),
 radial-gradient(circle at 96% 10%,rgba(255,201,60,.85) 0 90px,transparent 91px),
 radial-gradient(circle at 70% 96%,rgba(255,79,154,.55) 0 60px,transparent 61px),
 radial-gradient(circle at 52% 6%,rgba(255,255,255,.35) 0 26px,transparent 27px)}
.panel{position:absolute;left:44px;top:44px;bottom:44px;width:600px;background:#fffdf8;border:5px solid #24121a;border-radius:44px;box-shadow:0 12px 0 #24121a;padding:40px 44px;display:flex;flex-direction:column}
.logo{height:62px;width:auto;align-self:flex-start}
.pill{align-self:flex-start;margin-top:26px;padding:10px 20px;border:4px solid #24121a;border-radius:999px;background:#ffc93c;font-weight:700;font-size:22px;letter-spacing:.14em;text-transform:uppercase;box-shadow:0 5px 0 #24121a;transform:rotate(-2deg)}
h1{margin-top:22px;font-size:var(--fs,84px);line-height:.95;letter-spacing:-.045em;font-weight:700}
.hook{margin-top:auto;font-size:32px;line-height:1.2;font-weight:600;color:#5b4450}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.url{font-weight:600;font-size:21px;color:#5b4450;letter-spacing:.01em}
.art{position:absolute;left:650px;right:0;top:0;bottom:0}
.m{position:absolute;filter:drop-shadow(0 12px 0 rgba(36,18,26,.28))}
.pk{position:absolute;filter:drop-shadow(0 10px 0 rgba(36,18,26,.3))}
.bubble{position:absolute;background:#fffdf8;border:5px solid #24121a;border-radius:30px;box-shadow:0 8px 0 #24121a;display:grid;place-items:center}
"""

CARDS = {
"arcade": dict(accent="#ff4f9a", fs="92px", title="Jingo Arcade", pill="5 free games", hook="Quiz, match, rush, chilli &amp; run — made for your phone",
  art=f"""<img class="m" src="{M('chilli')}" style="left:0px;top:70px;height:250px;transform:rotate(-10deg)">
  <img class="m" src="{M('raw-mango')}" style="left:350px;top:60px;height:250px;transform:rotate(10deg)">
  <img class="m" src="{M('mint')}" style="left:10px;top:300px;height:270px;transform:rotate(-6deg)">
  <img class="m" src="{M('orange')}" style="left:340px;top:300px;height:270px;transform:rotate(7deg)">
  <img class="m" src="{M('khatti-meethi')}" style="left:150px;top:150px;height:340px">"""),
"quiz": dict(accent="#ff4f9a", fs="72px", title="Which Jingo Candy Are You?", pill="Personality quiz", hook="7 questions. 9 candies. One very specific verdict.",
  art=f"""<div class="bubble" style="left:190px;top:36px;width:160px;height:160px;font-size:124px;font-weight:700;line-height:1;transform:rotate(8deg)">?</div>
  <img class="m" src="{M('cola')}" style="left:0px;top:230px;height:300px;transform:rotate(-8deg)">
  <img class="m" src="{M('falsa')}" style="left:350px;top:230px;height:300px;transform:rotate(8deg)">
  <img class="m" src="{M('khatti-meethi')}" style="left:160px;top:200px;height:350px">"""),
"match": dict(accent="#38c6f4", fs="92px", title="Flavour Match", pill="Memory game", hook="Flip the cards. Pair the packs. Beat your best.",
  art=f"""<div class="bubble" style="left:40px;top:70px;width:200px;height:250px;background:#e0202b;transform:rotate(-8deg)"><img src="{LOGO}" style="width:150px;filter:brightness(0) invert(1)"></div>
  <div class="bubble" style="left:290px;top:50px;width:200px;height:250px;background:#d7c8a8;transform:rotate(6deg)"><img src="{P('eclair-king')}" style="height:210px"></div>
  <div class="bubble" style="left:170px;top:300px;width:200px;height:250px;background:#d7c8a8;transform:rotate(-3deg)"><img src="{P('eclair-king')}" style="height:210px"></div>
  <img class="m" src="{M('mint')}" style="left:370px;top:290px;height:270px;transform:rotate(8deg)">"""),
"counter": dict(accent="#ffc93c", fs="92px", title="Counter Rush", pill="Speed game", hook="Spot the pack before they lose patience.",
  art=f"""<div class="bubble" style="left:250px;top:40px;width:260px;height:230px;background:#d7a8ae"><img src="{P('cola-twist')}" style="height:190px"></div>
  <img class="m" src="{M('orange')}" style="left:20px;top:110px;height:400px;transform:rotate(-5deg)">
  <img class="pk" src="{P('cola-candy')}" style="left:270px;top:330px;height:200px;transform:rotate(8deg)">
  <img class="pk" src="{P('frosty')}" style="left:370px;top:300px;height:200px;transform:rotate(-6deg)">"""),
"chilli": dict(accent="#e0202b", fs="78px", title="Chilli Chaska Challenge", pill="Timing game", hook="Stop the needle in the sweet spot.",
  art=f"""<img class="m" src="{M('chilli')}" style="left:110px;top:20px;height:450px">
  <div style="position:absolute;left:20px;right:40px;top:470px;height:84px;border:6px solid #24121a;border-radius:24px;box-shadow:0 8px 0 #24121a;background:linear-gradient(90deg,#ffe8a3,#ffb347 45%,#ff6a3d 75%,#b8141e);overflow:hidden">
    <div style="position:absolute;left:52%;width:16%;top:0;bottom:0;background:rgba(63,191,106,.92);border-inline:5px solid #1f7a3c"></div>
    <div style="position:absolute;left:59%;width:12px;top:-6px;bottom:-6px;background:#24121a;border-radius:6px;box-shadow:0 0 0 4px #fffdf8"></div></div>"""),
"runner": dict(accent="#a6e04a", fs="92px", title="Mascot Runner", pill="Endless runner", hook="Jump, dodge and grab the packs. How far can you go?",
  art=f"""<div style="position:absolute;left:0;right:0;bottom:0;height:120px;background:#86b52e;border-top:6px solid #24121a"></div>
  <div style="position:absolute;left:330px;bottom:120px;width:90px;height:110px;background:#ff4f9a;border:6px solid #24121a;border-radius:16px"></div>
  <div style="position:absolute;left:30px;top:200px;width:120px;height:10px;background:rgba(36,18,26,.35);border-radius:5px"></div>
  <div style="position:absolute;left:0px;top:250px;width:150px;height:10px;background:rgba(36,18,26,.35);border-radius:5px"></div>
  <div style="position:absolute;left:50px;top:300px;width:100px;height:10px;background:rgba(36,18,26,.35);border-radius:5px"></div>
  <img class="m" src="{M('raw-mango')}" style="left:130px;top:60px;height:400px;transform:rotate(-8deg)">
  <img class="pk" src="{P('aam-twist')}" style="left:340px;top:80px;height:120px;transform:rotate(12deg)">"""),
}

def page(c):
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@600,700&display=block">
<style>{CSS}</style></head><body><div class="card" style="--a:{c['accent']};--fs:{c['fs']}">
<div class="art">{c['art']}</div>
<div class="panel"><div class="top"><img class="logo" src="{LOGO}"><span class="url">tallnest.com/jingo/arcade</span></div><span class="pill">{c['pill']}</span><h1>{c['title']}</h1><p class="hook">{c['hook']}</p></div>
</div></body></html>"""

# Output file per card (the hub card is "arcade-hub").
OUT_NAME = {slug: "arcade-hub" if slug == "arcade" else f"arcade-{slug}" for slug in CARDS}

# Same compression the committed cards were made with (sharp from node_modules).
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
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = pathlib.Path(tmp)
        jobs = []
        with sync_playwright() as p:
            browser = p.chromium.launch()
            pg = browser.new_page(viewport={"width": 1200, "height": 630})
            for slug, card in CARDS.items():
                html = tmpdir / f"{slug}.html"
                html.write_text(page(card), encoding="utf-8")
                pg.goto(html.as_uri())
                pg.evaluate("document.fonts.ready")
                pg.wait_for_timeout(400)
                if not pg.evaluate("document.fonts.check('700 40px General Sans')"):
                    print(f"warning: General Sans didn't load for {slug} (offline?) — card uses the fallback font")
                png = tmpdir / f"{slug}.png"
                pg.screenshot(path=str(png))
                jobs.append([str(png), str(OUT / f"{OUT_NAME[slug]}.jpg")])
            browser.close()
        subprocess.run(["node", "-e", COMPRESS_JS, json.dumps(jobs)], cwd=REPO, check=True)


if __name__ == "__main__":
    main()
