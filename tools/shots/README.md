# Picture makers

Scripts that record the pictures and recordings used on the slides and in the lesson, from the real app.
Nothing here is drawn by hand or by an image model. Start the app first (`python3 -m http.server 8080` in the
project folder). Everything is written to `out/`, which is not saved in git.

| Script | Makes |
|---|---|
| `gif-frames.js`, `more-frames.js`, then `make_gifs.py` | the three recordings on the slides (Best Site Finder, 25 days of skyline, more features) |
| `deck-shots.js` | the still pictures on the slides |
| `lesson-guide.js`, then `annotate_guide.py` | `docs/figures/lesson-screen-guide.jpg`, the opening screen with nine numbered frames |

These were copied from the working folder of the hackathon weekend on 16 Nov 2026 with their folders made
relative. The checks in `tests/browser/` were run again after the copy; these picture makers were only checked
for syntax, not run again, so expect to adjust a wait time or a file name the first time.
