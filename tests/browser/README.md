# Browser checks

These drive the real app in a headless browser (Playwright). They are the checks that were run before every release.

Start the app first, from the project folder:

```bash
python3 -m http.server 8080
```

Then, from this folder:

```bash
node sizes.js
```

```bash
node test-e.js
```

```bash
node test-d.js
```

```bash
node slides.js
```

```bash
node about.js check
```

| Script | What it checks | A good result |
|---|---|---|
| `sizes.js` | The main screen (a NO-GO and a GO with a warning), ENERGY and the Best Site Finder at six window sizes | every line says `ok` and `errors none` |
| `test-e.js` | The six-task user test, set E, done the intended way | `Score: 6/6` and `errors: []` |
| `test-d.js` | The same for set D (site list, ASK LUNI, scan distance, move) | `Score: 6/6` |
| `slides.js` | The web slides at three sizes: pictures load, the recording moves | `page errors: 0`, `failed files: 0` |
| `about.js check` | The project page: the order of its sections, the version viewer, no sideways scroll | `page errors: 0` |

`about.js cover` retakes `about/img/demo-cover.jpg` from the first slide; run it after the cover slide changes.

Pictures go to `out/`, which is not saved in git. To check another address, set `LUNI_URL`, for example
`LUNI_URL=http://localhost:9000 node sizes.js`.

Needs Node 22 and Playwright with Chromium. The calculation checks are one folder up (`node tests/check_*.mjs`).
