#!/usr/bin/env python3
"""Build slides/index.html: the seven-slide deck as a web page, so the moving pictures play in any browser.

The deck itself is made as a Claude Slides deck; this turns a copy of its files into one page for GitHub Pages.
  python3 tools/build_slides.py <deck folder> <picture folder>
<deck folder> holds project/deck.json, project/deck.css and project/slides/*.html (a download of the deck's files).
<picture folder> holds the pictures named in PICTURES below.
"""
import json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if len(sys.argv) != 3:
    sys.exit(__doc__)
DECK, IMG = Path(sys.argv[1]), Path(sys.argv[2])
OUT = ROOT / "slides"

# the deck stores each picture under an id; here they get plain file names
PICTURES = {
    "ae22b7083835bc34c9789f286499ede8": ("r15-go.png", "go.png"),
    "fa908a11890475ad24c9c1df91d5e4c4": ("r15-nogo.png", "no-go.png"),
    "8b831be899d212fdf6059483d8b0f169": ("r15-finder.gif", "best-site-finder.gif"),
    "dd3028e93958394de17f5444af0a7df3": ("r15-skyline.gif", "skyline-25-days.gif"),
    "f60dd9e75deaf73eccf36fd1ada7d3df": ("r15-more.gif", "more-features.gif"),
    "e9869dd70eb048df7dd53ba38be8cdaf": ("r15-sketch.png", "lesson-sketch.png"),
    "c43078aa5539d6eab78cfdfc99a79c9c": ("energy2.png", "energy.png"),
    "0c07e1bbdc98b8c40e682afaa0cd34e1": ("compare.png", "before-and-after.png"),
    "d849a5747ad43087d4890362bfbbdd23": ("qr.png", "qr.png"),
}

deck = json.loads((DECK / "project/deck.json").read_text())
css = (DECK / "project/deck.css").read_text()
slides = []
for sid in deck["order"]:
    s = (DECK / "project/slides" / f"{sid}.html").read_text()
    s = re.sub(r"<aside>.*?</aside>\s*", "", s, flags=re.S)          # the speaker's script stays out of the page
    slides.append(s.strip())
body = "\n".join(slides)

(OUT / "img").mkdir(parents=True, exist_ok=True)
used = set(re.findall(r"/_blob/([0-9a-f]{32})", body + css))
missing = used - set(PICTURES)
if missing:
    sys.exit(f"no file name for picture(s): {sorted(missing)}")
for pid in used:
    src, name = PICTURES[pid]
    shutil.copyfile(IMG / src, OUT / "img" / name)
    body = body.replace(f"/_blob/{pid}", f"img/{name}")
    css = css.replace(f"/_blob/{pid}", f"img/{name}")

fonts = "\n".join(f'<link rel="stylesheet" href="{f["href"]}">' for f in deck["faces"].values())
n = len(slides)

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LUNI · slides</title>
<meta name="description" content="LUNI, Lunar Utility for Navigational Intelligence: the seven slides of team Mystic Research, NASA Space Apps Challenge 2026.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
@FONTS@
<style>
/* the slide base every deck starts from */
* { margin: 0 }
html, body { height: 100%; background: #02050B; overflow: hidden }
body { font: 32px/1.2 sans-serif }
#stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0 }
#stage > section { width: 1920px !important; height: 1080px !important; overflow: hidden !important; box-sizing: border-box !important; position: absolute; left: 0; top: 0; isolation: isolate }
#stage > section[hidden] { display: none !important }
h1 { font-size: 96px; font-weight: 600 } h2 { font-size: 64px; font-weight: 600 } h3 { font-size: 44px; font-weight: 600 }
p, li, h1, h2, h3, td, th { overflow-wrap: break-word; text-wrap: pretty }
table { width: 100%; border-collapse: separate; border-spacing: 0; border: solid #0003; border-width: 2px 0 0 2px }
th, td { padding: .35em .6em; text-align: left; border: solid #0003; border-width: 0 2px 2px 0 }

/* the deck's own styles */
@CSS@

/* the bar under the slide */
#bar { position: fixed; left: 0; right: 0; bottom: 0; height: 46px; display: flex; align-items: center; justify-content: center; gap: 10px;
  background: #070D1A; border-top: 1px solid #1D2C48; font: 500 14px/1 'JetBrains Mono', Consolas, monospace; letter-spacing: .08em; color: #9FB4D6 }
#bar button, #bar a { font: inherit; letter-spacing: inherit; color: #EAF2FF; background: #12213B; border: 1px solid #2C4470; border-radius: 6px;
  height: 32px; padding: 0 14px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center }
#bar button:hover, #bar a:hover { background: #1B56D8; border-color: #7FB2FF }
#bar button:disabled { opacity: .35; cursor: default; background: #12213B; border-color: #2C4470 }
#bar a.go { background: #1B56D8; border-color: #7FB2FF }
#count { min-width: 5.5em; text-align: center }
#bar .gap { width: 18px }
@media (max-width: 640px) { #bar .wide { display: none } #bar { gap: 6px } #bar button, #bar a { padding: 0 10px } }
</style>
</head>
<body>
<div id="stage">
@SLIDES@
</div>
<div id="bar">
<button id="prev" aria-label="Previous slide">&#9664; BACK</button>
<span id="count" aria-live="polite">1 / @N@</span>
<button id="next" aria-label="Next slide">NEXT &#9654;</button>
<span class="gap"></span>
<button id="full" class="wide">FULL SCREEN</button>
<a class="wide" href="../about/">PROJECT PAGE</a>
<a class="go" href="../">OPEN LUNI &#9654;</a>
</div>
<script>
(function () {
  var stage = document.getElementById("stage"), slides = [].slice.call(stage.children), at = 0;
  var prev = document.getElementById("prev"), next = document.getElementById("next"), count = document.getElementById("count");
  function fit() {
    var w = innerWidth, h = innerHeight - 46, s = Math.min(w / 1920, h / 1080);
    stage.style.transform = "translate(" + Math.round((w - 1920 * s) / 2) + "px," + Math.round((h - 1080 * s) / 2) + "px) scale(" + s + ")";
  }
  function show(i, quiet) {
    at = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (s, k) { s.hidden = k !== at; });
    count.textContent = (at + 1) + " / " + slides.length;
    prev.disabled = at === 0; next.disabled = at === slides.length - 1;
    if (!quiet) try { history.replaceState(null, "", "#" + (at + 1)); } catch (e) {}
  }
  function fromHash() { var n = parseInt(location.hash.slice(1), 10); show(n >= 1 ? n - 1 : 0, true); }
  prev.onclick = function () { show(at - 1); };
  next.onclick = function () { show(at + 1); };
  stage.onclick = function (e) { show(at + (e.clientX < innerWidth * 0.25 ? -1 : 1)); };
  addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " " || e.key === "Enter") { e.preventDefault(); show(at + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "Backspace") { e.preventDefault(); show(at - 1); }
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(slides.length - 1);
  });
  var x0 = null;
  addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1));
  }, { passive: true });
  var full = document.getElementById("full");
  if (!document.documentElement.requestFullscreen) full.hidden = true;
  full.onclick = function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  };
  addEventListener("resize", fit);
  addEventListener("hashchange", fromHash);
  fit(); fromHash();
})();
</script>
</body>
</html>
"""
page = PAGE.replace("@FONTS@", fonts).replace("@CSS@", css).replace("@SLIDES@", body).replace("@N@", str(n))
(OUT / "index.html").write_text(page)
size = sum(f.stat().st_size for f in (OUT / "img").iterdir())
print(f"slides/index.html {len(page)} bytes; {n} slides; {len(used)} pictures, {size / 1e6:.1f} MB")
