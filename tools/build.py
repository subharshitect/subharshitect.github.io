"""Render the small collections in data/ into the site's static HTML.

Standard library only. The site still has no build step to *serve* it: the
output is committed, so GitHub Pages serves files as they are. Run this after
editing anything in data/:

    python3 tools/build.py          # rewrite the generated blocks + feed.xml
    python3 tools/build.py --check  # exit 1 if anything is out of date (used by tests)

Generated regions sit between markers in the HTML:

    <!-- build:notes-latest -->  ...  <!-- /build:notes-latest -->

Everything outside the markers is hand-written and never touched. Entries
with "draft": true are rendered with a data-draft attribute, which hides
them unless the page is opened with ?drafts=1, and are left out of the feed.
"""

import argparse
import datetime as dt
import html
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://subharshitect.github.io"
AUTHOR = "Subharshi Roy"
NOTE_STATUSES = {"observation", "experiment", "open question", "failed attempt", "memory"}
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def esc(s):
    return html.escape(str(s or ""), quote=True)


def load(name):
    with open(ROOT / "data" / name, encoding="utf-8") as f:
        return json.load(f)


def draft_attr(item):
    return " data-draft" if item.get("draft") else ""


def human_date(iso):
    if not iso:
        return ""
    d = dt.date.fromisoformat(iso)
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def month_name(ym):
    y, m = ym.split("-")
    return f"{MONTHS[int(m) - 1]} {y}"


def published(items):
    return [i for i in items if not i.get("draft")]


def indent(lines, n):
    pad = " " * n
    return "\n".join(pad + l if l else l for l in lines)


# ——— validation: fail loudly on malformed data instead of rendering it ———

def check_notes(notes):
    seen = set()
    for n in notes:
        for k in ("slug", "title", "date", "status", "summary"):
            if not n.get(k):
                sys.exit(f"data/notes.json: entry {n.get('slug', '?')} is missing {k}")
        if n["status"] not in NOTE_STATUSES:
            sys.exit(f"data/notes.json: {n['slug']} has status {n['status']!r}; use one of {sorted(NOTE_STATUSES)}")
        if not re.fullmatch(r"[a-z0-9-]+", n["slug"]):
            sys.exit(f"data/notes.json: slug {n['slug']!r} should be lowercase letters, digits and hyphens")
        if n["slug"] in seen:
            sys.exit(f"data/notes.json: duplicate slug {n['slug']}")
        seen.add(n["slug"])
        dt.date.fromisoformat(n["date"])
        if not (ROOT / "notebook" / f"{n['slug']}.html").exists():
            sys.exit(f"data/notes.json: notebook/{n['slug']}.html does not exist")
    return sorted(notes, key=lambda n: n["date"], reverse=True)


# ——— renderers ———

def note_item(n, heading="h3"):
    tags = " ".join(n.get("tags", []))
    return [
        f'<li class="entry" data-note data-tags="{esc(tags)}" data-title="{esc(n["title"])}" data-summary="{esc(n["summary"])}"{draft_attr(n)}>',
        f'  <div class="entry-meta"><time datetime="{esc(n["date"])}">{esc(human_date(n["date"]))}</time>'
        f'<span class="status" data-status="{esc(n["status"])}">{esc(n["status"])}</span>'
        + (f'<span>{esc(", ".join(n.get("tags", [])))}</span>' if n.get("tags") else "")
        + ("<span>draft</span>" if n.get("draft") else "") + "</div>",
        f'  <{heading}><a href="/notebook/{esc(n["slug"])}.html">{esc(n["title"])}</a></{heading}>',
        f'  <p>{esc(n["summary"])}</p>',
        "</li>",
    ]


def render_notes_latest(notes):
    pub = published(notes)[:3]
    lines = [f for n in pub for f in note_item(n)]
    lines += [f for n in notes if n.get("draft") for f in note_item(n)]
    if not pub:
        lines.append('<li class="empty">No entries published yet.</li>')
    return ['<ul class="entry-list">', *("  " + l for l in lines), "</ul>"]


def render_notes_list(notes):
    lines = [f for n in notes for f in note_item(n, "h2")]
    if not published(notes):
        lines.append('<li class="empty">No entries published yet.</li>')
    return ['<ul class="entry-list" id="note-list">', *("  " + l for l in lines), "</ul>"]


def render_currently(cur):
    lines = [f'<aside class="currently" aria-labelledby="currently-title"{draft_attr(cur)}>',
             '  <h2 id="currently-title">Currently</h2>', "  <dl>"]
    for item in cur["items"]:
        text = esc(item.get("text") or "—")
        if item.get("href"):
            text = f'<a href="{esc(item["href"])}">{text}</a>'
        lines += [f"    <dt>{esc(item['label'])}</dt>", f"    <dd>{text}</dd>"]
    lines.append("  </dl>")
    if cur.get("updated"):
        lines.append(f'  <p class="updated">Updated <time datetime="{esc(cur["updated"])}">{esc(human_date(cur["updated"]))}</time></p>')
    lines.append("</aside>")
    return lines


def render_questions(qs):
    lines = ['<section class="question" data-questions aria-labelledby="question-title" hidden>',
             '  <h2 id="question-title">A question I’m thinking about</h2>', "  <ul>"]
    for i, q in enumerate(qs):
        related = "".join(f' <a href="{esc(r["href"])}">{esc(r["label"])} →</a>' for r in q.get("related", []))
        hidden = " hidden" if i else ""
        lines += [f'    <li data-qid="{esc(q["id"])}"{draft_attr(q)}{hidden}>',
                  f"      <blockquote>{esc(q['text'])}</blockquote>"]
        if q.get("status"):
            lines.append(f'      <p class="entry-meta">{esc(q["status"])}</p>')
        if related:
            lines.append(f'      <p class="question-foot">{related.strip()}</p>')
        lines.append("    </li>")
    lines += ["  </ul>",
              '  <p class="question-foot"><button type="button" class="btn btn-quiet" data-question-next hidden>Another question</button></p>',
              "</section>"]
    return lines


def ascii_thumb(seed_text, cols=30, rows=8):
    """Deterministic little texture per track (same idea as the old music page)."""
    chars = " .:-=+*#%@"
    seed = (sum(ord(c) for c in seed_text) * 2654435761) & 0xFFFFFFFF
    out = []
    for y in range(rows):
        row = ""
        for x in range(cols):
            seed = (1664525 * seed + 1013904223) & 0xFFFFFFFF
            v = (math.sin(x * 0.25 + y * 0.7) + 1) / 2 * 0.5 + (seed / 2**32) * 0.5
            row += chars[min(len(chars) - 1, int(v * (len(chars) - 1)))]
        out.append(row)
    return "\n".join(out)


def youtube_id(url):
    m = re.search(r"(?:v=|youtu\.be/|/shorts/)([A-Za-z0-9_-]{6,})", url)
    return m.group(1) if m else ""


def track_item(t):
    vid = youtube_id(t["url"])
    artist = f' <span class="artist">· {esc(t["artist"])}</span>' if t.get("artist") else ""
    # The video's own thumbnail, stored in the site (assets/images/listening/<id>.jpg)
    # so the page makes no request to YouTube until someone presses play.
    # Tracks without one fall back to a generated texture.
    thumb = f"/assets/images/listening/{vid}.jpg" if vid else ""
    if thumb and (ROOT / thumb.lstrip("/")).exists():
        art = f'  <img class="track-thumb" src="{esc(thumb)}" alt="" width="320" height="180" loading="lazy" decoding="async">'
    else:
        art = f'  <pre class="track-thumb track-texture" aria-hidden="true">{esc(ascii_thumb(vid or t["title"]))}</pre>'
    lines = [f'<li class="track"{draft_attr(t)}>',
             art,
             "  <div>",
             f'    <h3 class="track-title">{esc(t["title"])}{artist}</h3>']
    if t.get("note"):
        lines.append(f'    <p class="track-note">{esc(t["note"])}</p>')
    meta = [f"added {human_date(t['added'])}"] if t.get("added") else []
    meta += t.get("tags", [])
    lines.append('    <p class="track-actions">'
                 f'<a href="{esc(t["url"])}" rel="noopener noreferrer">Listen on YouTube ↗</a>'
                 + (f'<button type="button" class="btn btn-quiet" data-embed-id="{esc(vid)}" data-title="{esc(t["title"])}" aria-expanded="false" hidden>Play here</button>' if vid else "")
                 + (f'<span class="entry-meta">{esc(" · ".join(meta))}</span>' if meta else "")
                 + "</p>")
    lines += ["  </div>", '  <div class="track-player" hidden></div>', "</li>"]
    return lines


def render_listening(tracks, limit=None):
    items = tracks[:limit] if limit else tracks
    lines = [l for t in items for l in track_item(t)]
    return ['<ul class="entry-list">', *("  " + l for l in lines), "</ul>"]


def render_snapshots_list(snaps):
    lines = []
    for s in sorted(snaps, key=lambda s: s["month"], reverse=True):
        lines += [f'<li class="entry"{draft_attr(s)}>',
                  f'  <div class="entry-meta"><time datetime="{esc(s["month"])}">{esc(month_name(s["month"]))}</time>'
                  + ("<span>draft</span>" if s.get("draft") else "") + "</div>",
                  f'  <h2><a href="/snapshots/{esc(s["month"])}.html">{esc(s.get("title") or month_name(s["month"]))}</a></h2>',
                  f'  <p>{esc(s.get("summary", ""))}</p>' if s.get("summary") else "",
                  "</li>"]
    if not published(snaps):
        lines.append('<li class="empty">No snapshots published yet.</li>')
    return ['<ul class="entry-list">', *("  " + l for l in lines if l), "</ul>"]


def render_snapshot_nav(snaps, month):
    order = sorted(snaps, key=lambda s: s["month"])
    i = next(k for k, s in enumerate(order) if s["month"] == month)
    parts = ['<nav class="prev-next" aria-label="Other snapshots">']
    if i > 0:
        p = order[i - 1]
        parts.append(f'  <a href="/snapshots/{esc(p["month"])}.html"{draft_attr(p)}>← {esc(month_name(p["month"]))}</a>')
    parts.append('  <a href="/snapshots/">All snapshots</a>')
    if i < len(order) - 1:
        n = order[i + 1]
        parts.append(f'  <a href="/snapshots/{esc(n["month"])}.html"{draft_attr(n)}>{esc(month_name(n["month"]))} →</a>')
    parts.append("</nav>")
    return parts


def render_field(items):
    if not items:
        return ['<p class="empty">Nothing here yet.</p>']
    lines = ['<ul class="field-grid" id="field-grid">']
    for it in items:
        attrs = {
            "data-alt": it["alt"], "data-caption": it["caption"], "data-date": human_date(it.get("date")),
            "data-context": it.get("context", ""), "data-note": it.get("note", ""),
            "data-w": it["width"], "data-h": it["height"],
        }
        attr = " ".join(f'{k}="{esc(v)}"' for k, v in attrs.items())
        lines += [f'  <li{draft_attr(it)}>',
                  f'    <a href="{esc(it["src"])}" data-field {attr}>',
                  "      <figure>",
                  f'        <img src="{esc(it["thumb"])}" alt="{esc(it["alt"])}" width="{it["thumb_width"]}" height="{it["thumb_height"]}" loading="lazy" decoding="async">',
                  f'        <figcaption>{esc(it["caption"])}</figcaption>',
                  "      </figure>",
                  "    </a>",
                  "  </li>"]
    lines.append("</ul>")
    return lines


def render_feed(notes, snaps):
    entries = []
    for n in published(notes):
        entries.append((n["date"], n["title"], f"{SITE}/notebook/{n['slug']}.html", n["summary"]))
    for s in published(snaps):
        entries.append((f"{s['month']}-28", s.get("title") or month_name(s["month"]), f"{SITE}/snapshots/{s['month']}.html", s.get("summary", "")))
    entries.sort(reverse=True)
    updated = entries[0][0] if entries else "2026-01-01"
    out = ['<?xml version="1.0" encoding="utf-8"?>',
           '<feed xmlns="http://www.w3.org/2005/Atom">',
           f"  <title>{esc(AUTHOR)}: notebook</title>",
           f'  <link href="{SITE}/"/>',
           f'  <link rel="self" href="{SITE}/feed.xml"/>',
           f"  <id>{SITE}/</id>",
           f"  <updated>{updated}T00:00:00Z</updated>",
           f"  <author><name>{esc(AUTHOR)}</name></author>"]
    for date, title, url, summary in entries:
        out += ["  <entry>", f"    <title>{esc(title)}</title>", f'    <link href="{esc(url)}"/>', f"    <id>{esc(url)}</id>",
                f"    <updated>{date}T00:00:00Z</updated>", f"    <summary>{esc(summary)}</summary>", "  </entry>"]
    out.append("</feed>")
    return "\n".join(out) + "\n"


# ——— shared header and footer (every page with the markers) ———

NAV = [("Work", "/#work", None), ("Notebook", "/notebook/", "notebook"), ("Specimens", "/specimens/", "specimens"),
       ("Listening", "/listening/", "listening"), ("About", "/#about", None)]


def render_header(rel):
    section = rel.split("/")[0] if "/" in rel else None
    items = []
    for label, href, key in NAV:
        current = ' aria-current="page"' if key and key == section else ""
        items.append(f'        <li><a href="{href}"{current}>{label}</a></li>')
    return ['<a class="skip-link" href="#main">Skip to content</a>',
            '<header class="site-header">',
            '  <div class="container header-inner">',
            '    <a class="identity" href="/">Subharshi Roy</a>',
            '    <nav class="site-nav" aria-label="Main">',
            "      <ul>", *items, "      </ul>",
            "    </nav>",
            '    <div class="prefs">',
            '      <button type="button" class="toggle" data-pref-toggle="presentation" aria-pressed="false">Reading view</button>',
            '      <button type="button" class="toggle" data-pref-toggle="motion" aria-pressed="false">Pause motion</button>',
            "    </div>",
            "  </div>",
            "</header>"]


def render_footer(snaps, notes):
    # Links to collections appear only once there is something in them.
    snap_attr = "" if published(snaps) else " data-draft"
    feed_attr = "" if published(snaps) or published(notes) else " data-draft"
    return ['<footer class="site-footer">',
            '  <div class="container footer-inner">',
            "    <p>© 2026 Subharshi Roy · machine / memory / myth</p>",
            "    <ul>",
            f'      <li{snap_attr}><a href="/snapshots/">Monthly snapshots</a></li>',
            f'      <li{feed_attr}><a href="/feed.xml">Feed</a></li>',
            '      <li><a href="https://github.com/subharshitect" rel="me">GitHub</a></li>',
            '      <li><a href="mailto:r.subharshi@gmail.com">Email</a></li>',
            "    </ul>",
            "  </div>",
            "</footer>"]


# ——— splicing ———

MARK = re.compile(r"(?P<indent>[ \t]*)<!-- build:(?P<name>[\w-]+) -->.*?<!-- /build:(?P=name) -->", re.S)


def splice(text, blocks, path):
    found = set()

    def repl(m):
        name = m.group("name")
        if name not in blocks:
            sys.exit(f"{path}: unknown build block {name}")
        found.add(name)
        ind = m.group("indent")
        body = indent(blocks[name], len(ind))
        return f"{ind}<!-- build:{name} -->\n{body}\n{ind}<!-- /build:{name} -->"

    out = MARK.sub(repl, text)
    missing = set(blocks) - found
    if missing:
        sys.exit(f"{path}: missing build markers for {sorted(missing)}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report stale files instead of writing them")
    args = ap.parse_args()

    notes = check_notes(load("notes.json"))
    current = load("currently.json")
    questions = load("questions.json")
    tracks = sorted(load("listening.json"), key=lambda t: t.get("added", ""), reverse=True)
    snaps = load("snapshots.json")
    field = load("field.json")

    pages = {
        "index.html": {
            "currently": render_currently(current),
            "questions": render_questions(questions),
            "notes-latest": render_notes_latest(notes),
            "listening-latest": render_listening(tracks, limit=3),
        },
        "notebook/index.html": {"notes-list": render_notes_list(notes)},
        "listening/index.html": {"listening-list": render_listening(tracks)},
        "snapshots/index.html": {"snapshots-list": render_snapshots_list(snaps)},
        "field/index.html": {"field-grid": render_field(field)},
    }
    for s in snaps:
        pages[f"snapshots/{s['month']}.html"] = {"snapshot-nav": render_snapshot_nav(snaps, s["month"])}

    for path in sorted(ROOT.glob("**/*.html")):
        rel = str(path.relative_to(ROOT))
        if "<!-- build:site-header -->" in path.read_text(encoding="utf-8"):
            pages.setdefault(rel, {})
            pages[rel]["site-header"] = render_header(rel)
            pages[rel]["site-footer"] = render_footer(snaps, notes)

    outputs = {}
    for rel, blocks in pages.items():
        path = ROOT / rel
        if not path.exists():
            sys.exit(f"{rel} does not exist")
        outputs[path] = splice(path.read_text(encoding="utf-8"), blocks, rel)
    outputs[ROOT / "feed.xml"] = render_feed(notes, snaps)

    stale = [p for p, text in outputs.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
    if args.check:
        if stale:
            print("out of date (run python3 tools/build.py):", *[str(p.relative_to(ROOT)) for p in stale], sep="\n  ")
            sys.exit(1)
        print("generated files are up to date")
        return
    for p in stale:
        p.write_text(outputs[p], encoding="utf-8")
    print(f"updated {len(stale)} file(s)" + (": " + ", ".join(str(p.relative_to(ROOT)) for p in stale) if stale else ""))


if __name__ == "__main__":
    main()
