#!/usr/bin/env python3
"""Builds about/index.html: the project page (what LUNI is, the local judging result, the classroom lesson and the
timeline). Sources: docs/lesson.md and the version list inside docs/version-history.html. Needs: pip install markdown.
Run from the repository: python3 tools/build_about.py"""
import base64, html, json, os, re
import markdown

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(ROOT, "about", "img"), exist_ok=True)

# ---- the lesson -------------------------------------------------------------------------------------------------
md = open(os.path.join(ROOT, "docs", "lesson.md"), encoding="utf-8").read()
title, md = md.split("\n", 1)
lesson = markdown.markdown(md, extensions=["tables"])
lesson = re.sub(r"<(/?)h3", r"<\1h5", lesson); lesson = re.sub(r"<(/?)h2", r"<\1h4", lesson)
lesson = lesson.replace("<table>", '<div class="tscroll"><table>').replace("</table>", "</table></div>")
lesson_title = html.escape(title.lstrip("# ").strip())

# ---- the timeline -----------------------------------------------------------------------------------------------
vh = open(os.path.join(ROOT, "docs", "version-history.html"), encoding="utf-8").read()
a = vh.index("const V = ") + 10; b = vh.index("];", a) + 1
V = json.loads(vh[a:b])
for v in V:
    for kind in ("main", "finder"):
        src = v.get(kind)
        if src:
            name = f"v-{v['id']}-{kind}.jpg"
            open(os.path.join(ROOT, "about", "img", name), "wb").write(base64.b64decode(src.split(",", 1)[1]))
            v[kind] = "img/" + name
# the weekend in order: every draft and release, with the milestones that are not app versions
MILE = {None: ("Sat 14 Nov \u00b7 9:00 AM", "The hackathon opens", ["NASA Space Apps Challenge 2026. Team Mystic Research picks the Lunar Landing Site Navigator challenge."]),
        "r7": ("Sun 15 Nov \u00b7 afternoon", "Presented, submitted, and an award", ["Submitted for global judging.", "Local judging: three minutes to present, five minutes of questions.", "LUNI wins Best Use of Data."])}
def mile(m): return f'    <li class="mile"><time>{html.escape(m[0])}</time><h4>{html.escape(m[1])}</h4><ul>' + "".join(f"<li>{html.escape(c)}</li>" for c in m[2]) + "</ul></li>"
rows = [mile(MILE[None])]
for v in V:
    rows.append(f'    <li><time>{html.escape(v["when"])} \u00b7 {html.escape(v["saves"])}</time><h4><em>{html.escape(v["tag"].upper())}</em>{html.escape(v["name"])}</h4><ul>'
                + "".join(f"<li>{html.escape(c)}</li>" for c in v["changes"]) + f'</ul><button data-v="{v["id"]}">SEE THIS SCREEN \u25b2</button></li>')
    if v["id"] in MILE: rows.append(mile(MILE[v["id"]]))
timeline = "\n".join(rows)
versions = json.dumps(V, ensure_ascii=False).replace("</", "<\\/")
first = V[-1]

page = open(os.path.join(ROOT, "tools", "about-template.html"), encoding="utf-8").read()
page = (page.replace("{{LESSON_TITLE}}", lesson_title).replace("{{LESSON}}", lesson).replace("{{VERSIONS}}", versions).replace("{{TIMELINE}}", timeline)
        .replace("{{N_RELEASES}}", str(sum(1 for v in V if v["id"].startswith("r")))).replace("{{LATEST}}", first["tag"]))
open(os.path.join(ROOT, "about", "index.html"), "w", encoding="utf-8").write(page)
print("about/index.html", len(page), "bytes;", len(V), "versions;", len(os.listdir(os.path.join(ROOT, "about", "img"))), "pictures")
