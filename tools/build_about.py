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
lesson = lesson.replace('src="figures/', 'loading="lazy" src="../docs/figures/')      # the lesson's pictures live beside it in docs/
lesson = lesson.replace("<li>[ ] ", '<li class="chk"><span aria-hidden="true">☐</span> ')      # checklist boxes, as GitHub shows them
lesson_title = html.escape(title.lstrip("# ").strip())

# Everything addressed to the teacher gets its own color (a teacher's review, 15 Nov: "should be in a different color").
def wrap(text, start, end, cls):
    a = text.find(start)
    b = text.find(end, a + 1) if a >= 0 else -1
    if a < 0 or b < 0:
        raise SystemExit(f"lesson section not found: {start} .. {end}")
    return text[:a] + f'<div class="{cls}">' + text[a:b] + "</div>" + text[b:]
lesson = wrap(lesson, "<h4>For the teacher: do these first</h4>", "<h4>What students learn</h4>", "teacher")
lesson = wrap(lesson, "<h5>If a pair is stuck</h5>", "<h5>Part 6.", "teacher")
lesson = wrap(lesson, "<h4>Teacher key</h4>", "<h4>Going further</h4>", "teacher")
lesson = lesson.replace("<p><strong>Check:</strong>", '<p class="check"><strong>Check:</strong>')
lesson = '<p class="legend"><span class="lg-t">Orange: for the teacher.</span> <span class="lg-s">Blue: what the class does.</span></p>\n' + lesson

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
