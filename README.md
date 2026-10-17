# subharshitect.github.io

A personal research space with an experimental visual layer: notes, a cabinet
of specimens reconstructed from classic papers, an annotated inference trace,
and a listening shelf.

Static HTML, CSS and JavaScript. No framework, no dependencies, no build step
to serve it: GitHub Pages serves the files as they are.

## Preview locally

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

Opening `index.html` directly from disk no longer works well, because the
pages use root-relative paths (`/assets/...`) and ES modules.

`?drafts=1` on any page shows draft material for the rest of that browser
session (`?drafts=0` hides it again). Drafts carry `data-draft` in the HTML or
`"draft": true` in `data/`, and draft pages say so in a banner.

## Updating content

Most of the routine work is editing a JSON file and running the build:

| To add or change | Edit | Then |
|---|---|---|
| A notebook entry | copy `notebook/how-these-notes-work.html` to `notebook/<slug>.html`, add the entry to `data/notes.json` | `python3 tools/build.py` |
| The "Currently" corner | `data/currently.json` (three fields + `updated`) | build |
| A question | `data/questions.json` | build |
| A track | `data/listening.json` (`note` is the point of the shelf) | build |
| A monthly snapshot | copy `snapshots/2026-10.html`, add it to `data/snapshots.json` | build |
| Field-notebook images | `data/field.json` (`src`, `thumb`, `width`, `height`, `thumb_width`, `thumb_height`, `alt`, `caption`, optional `date`, `context`, `note`) | build |

`tools/build.py` (standard library only) rewrites the regions between
`<!-- build:name -->` markers — lists, the shared header and footer, snapshot
prev/next links — and `feed.xml`. Everything outside the markers is
hand-written and left alone. The generated output is committed.

Remove `"draft": true` (or the `data-draft` attribute) when something is
ready. See `docs/CONTENT.md` for what is still a placeholder.

## Tests

```bash
node --test tests/               # or: npm test   (Node 18+, nothing to install)
```

They cover what can break silently: URL state round-tripping, deterministic
simulation output (checked against Rule 90 and Rule 30 maths, not only
snapshots), validation of imported saves, trace time calculations and the
published trace's numbers, generated HTML being in sync with `data/`, and
local links pointing at real files. Layout, keyboard use, motion preferences
and reading comfort still need a look in a browser.

## Specimens

`/specimens/` is a catalogue of plates, each reconstructing one paper:

| Plate | Page | Model | Checked against the paper (tests/specimens.test.mjs, tests/sim.test.mjs) |
|---|---|---|---|
| I | feedforward.html | threshold units, ReLU or all-or-none | — (illustrative) |
| II | gray-scott.html | Gray–Scott (Pearson 1993) | the mitosis preset forms dividing spots |
| III | rule-30.html | elementary CA | rule 90 = Pascal mod 2; rule 30 = its boolean formula |
| IV | kaleidoscope.html | Nowak & May 1992 | exact D4 symmetry from one defector; cooperators ≈ 0.318 at b = 1.85; frozen below 9/8; collapse above 2 |
| V | evolving-computers.html | Das, Mitchell & Crutchfield 1994 | φpar's P149 = 0.775; GKL ≈ 0.81; local majority = 0 |
| VI | sectors.html | Eden growth, Hallatschek et al. 2007 | sectors coarsen; more survive from a larger homeland; neutral on average |
| VII | trace.html (draft) | profiler trace of opt-125m | the notes' numbers |

Simulations live in `assets/js/sim/` (no DOM). `specimen.js` drives a plate page,
`evca-plate.js` + `evca-worker.js` drive Plate V (the GA runs in a Web Worker),
`plate-canvas.js` draws every plate, `stills.js` the catalogue thumbnails. Each
plate page's prose is hand-written HTML; the "Reflection" sections are drafts.

## The inference trace

`/specimens/trace.html` loads `data/traces/opt125m-decode.json`, a 120 KB
extract of a 7.3 MB torch.profiler trace. To record a new one:

```bash
python3 tools/profile_example.py --out raw.trace.json      # needs torch + transformers
python3 tools/trace_extract.py raw.trace.json --out data/traces/run.json \
    --context tools/example_context.json --annotations tools/example_annotations.json
```

`trace_extract.py` works on any Chrome-format trace. It keeps step markers,
top-level CPU ops, GPU kernels and GPU memory; drops every `args` field, path
and identifier; and matches annotations to events by lane, name and
occurrence, so they survive re-extraction.

## Layout

```text
index.html                 homepage: intro, currently, work, notebook, specimens, listening, about
notebook/                  index + one HTML page per entry
specimens/                 the catalogue and one page per plate (experiments/ redirects here)
listening/  snapshots/  field/
data/                      notes, currently, questions, listening, snapshots, field, traces/
assets/css/                tokens, layout, components, motion (+ reading view), print
assets/js/
  prefs.js                 motion / reading-view preferences, drafts flag (classic script in <head>)
  sim/core.js  sim/sims.js simulation state, seeds, URL + saved-state validation (no DOM)
  sim/evca.js              evolving cellular automata and the GA (no DOM)
  specimen.js  plate-canvas.js  stills.js  evca-plate.js  evca-worker.js
  runner.js                one animation loop; pauses offscreen, in hidden tabs, by preference
  hero.js                  the homepage visual (Plate III)
  trace-model.js           trace logic (no DOM)   trace-viewer.js  the SVG viewer
  download.js  saves.js  questions.js  notebook-index.js  article.js  field.js  listening.js
tools/                     build.py, trace_extract.py, profile_example.py, favicon.mjs
tests/                     node --test
docs/                      ARCHITECTURE_VISION.md, CONTENT.md
```

`music.html` redirects to `/listening/` so old links keep working.
