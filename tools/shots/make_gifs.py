"""Put the frames in out/ together as the three recordings on the slides (needs Pillow). Run gif-frames.js and more-frames.js first."""
import glob, os, sys
from PIL import Image, ImageDraw, ImageFont
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"); OUT = G   # frames come from gif-frames.js and more-frames.js
def q(im, n=255): return im.convert("RGB").quantize(colors=n, method=Image.MEDIANCUT, dither=Image.NONE)
def save(frames, durs, name):
    frames[0].save(os.path.join(OUT, name), save_all=True, append_images=frames[1:], duration=durs, loop=0, optimize=False, disposal=1)
    print(name, len(frames), "frames", round(os.path.getsize(os.path.join(OUT, name)) / 1e6, 2), "MB", round(sum(durs) / 1000, 1), "s")
which = sys.argv[1:] or ["scan", "sky", "more"]
if "scan" in which:
    log = [l.split() for l in open(G + "/scan/log.txt").read().split("\n") if l]
    fr, du = [], []; D = {"fill": 110, "found": 1500, "move": 70, "fill2": 110, "end": 2600}
    for i, (f, tag) in enumerate(log):
        if tag in ("fill", "fill2") and i % 3: continue          # every other filling frame keeps the file small
        fr.append(q(Image.open(f"{G}/scan/{f}.png").resize((800, 398), Image.LANCZOS), 80)); du.append(D[tag] * (3 if tag in ("fill", "fill2") else 1))
    k = [i for i, (f, t) in enumerate([l for j, l in enumerate(log) if not (l[1] in ("fill", "fill2") and j % 3)]) if t == "found"][0]
    fr = [fr[k]] + fr; du = [1200] + du        # a still export shows the first frame: start on the finished map
    save(fr, du, "finder2.gif")
if "sky" in which:
    fs = sorted(glob.glob(G + "/sky/*.png")); fr = []
    for f in fs[::2]:
        im = Image.open(f); w, h = im.size; fr.append(q(im.resize((1280, round(h * 1280 / w)), Image.LANCZOS), 96))
    print("sky size", fr[0].size); save(fr, [180] * len(fr), "skyline.gif")
if "more" in which:
    CAP = {"1-moon-sun": "MOON MAP · SUNLIGHT, 2023 TO 2035", "2-moon-ice": "MOON MAP · WHERE WATER ICE CAN LAST", "3-history": "MISSION HISTORY · SIX REAL LANDINGS",
           "4-surface": "3D VIEW FROM THE SURFACE", "5-ask": "ASK LUNI · TYPE OR SPEAK", "6-windows": "MISSION WINDOWS · 12 MONTHS", "7-ops": "OPERATIONS PLAN", "8-tutorial": "GUIDED TUTORIAL"}
    f1 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26); fr = []
    for k in sorted(CAP):
        p = f"{G}/more/{k}.png"
        if not os.path.exists(p): print("missing", k); continue
        im = Image.open(p).convert("RGB").resize((992, 620), Image.LANCZOS); d = ImageDraw.Draw(im)
        d.rectangle([0, 568, 992, 620], fill=(22, 87, 208)); d.text((20, 580), f"{k[0]} / 8   {CAP[k]}", font=f1, fill="white"); fr.append(q(im))
    save(fr, [1700] * len(fr), "more.gif")
