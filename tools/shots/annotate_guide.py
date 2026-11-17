"""Draw the nine numbered frames on the opening screen for the lesson (needs Pillow). Run lesson-guide.js first."""
import json
from PIL import Image, ImageDraw, ImageFont
import os
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, "out") + "/"   # made by lesson-guide.js
im = Image.open(P + "guide-raw.png").convert("RGB")
B = json.load(open(P + "guide.json"))["boxes"]
S = 2
GOLD = (255, 209, 102)
d = ImageDraw.Draw(im)
f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44)

def grow(b, l=0, t=0, r=0, btm=0):
    x, y, w, h = b
    return [x - l, y - t, w + l + r, h + t + btm]

s2 = grow(B["s2"], btm=78)       # the heading and the date pickers under it
s3 = grow(B["s3"], btm=70)       # the heading and the mission length row
items = [
    (1, grow(B["list"], t=34), "tl"),
    (2, s2, "tl"),
    (3, s3, "tl"),
    (4, B["verdict"], "tl"),
    (5, B["side"], "tr"),
    (6, B["sky"], "tr"),
    (7, B["tl"], "tr"),
    (8, B["keys"], "tl"),
    (9, B["tabs"], "tl"),
]
for n, (x, y, w, h), corner in items:
    x0, y0, x1, y1 = x * S, y * S, (x + w) * S, (y + h) * S
    for k in range(5):
        d.rectangle([x0 - k, y0 - k, x1 + k, y1 + k], outline=GOLD)
    r = 38
    cx = x0 if corner == "tl" else x1
    cy = y0
    cx = max(r + 4, min(im.width - r - 4, cx)); cy = max(r + 4, cy)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD, outline=(6, 18, 42), width=4)
    tw = d.textlength(str(n), font=f)
    d.text((cx - tw / 2, cy - 27), str(n), font=f, fill=(6, 18, 42))
out = im.resize((1600, 1000), Image.LANCZOS)
out.save(os.path.join(HERE, "..", "..", "docs", "figures", "lesson-screen-guide.jpg"), quality=86)
print(out.size)
