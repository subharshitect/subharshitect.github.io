#!/usr/bin/env python3
"""Turn a prose note written in Markdown into a notebook page.

    python3 tools/note_from_md.py docs/notes.md the-evenings-that-belonged-to-us
    python3 tools/build.py

Supported Markdown: "# Title" (first line), an optional "*italic*" line right
after it (the place and time), blank-line separated paragraphs, "## Heading",
and *italic* / **bold** inside paragraphs. The page's date, status and tags come
from the entry in data/notes.json, so add that first. Re-run after editing the
Markdown; the page is overwritten, the header and footer are filled by build.py.
"""
import html
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} · Notebook · Subharshi Roy</title>
  <meta name="description" content="{summary}">
  <link rel="icon" href="/assets/images/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/atom+xml" title="Subharshi Roy: notebook" href="/feed.xml">
  <link rel="preload" href="/assets/fonts/terminal-grotesque.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/layout.css">
  <link rel="stylesheet" href="/assets/css/components.css">
  <link rel="stylesheet" href="/assets/css/motion.css">
  <link rel="stylesheet" href="/assets/css/memoir.css">
  <link rel="stylesheet" href="/assets/css/print.css">
  <script src="/assets/js/prefs.js"></script>
</head>
<body class="memoir">
  <!-- build:site-header -->
  <!-- /build:site-header -->

  <div class="reading-progress" aria-hidden="true"></div>
  <main id="main" class="container">
    <div class="memoir-page">
      <header class="memoir-head">
        <p class="memoir-meta"><a href="/notebook/">← Notebook</a></p>
        <p class="memoir-meta"><time datetime="{iso}">{pretty}</time></p>
        <p class="memoir-meta"><span class="status" data-status="{status}">{status}</span></p>
        <h1>{title}</h1>
        {kicker}
      </header>

      <article class="note note-prose memoir-body">
{body}
      </article>
    </div>
  </main>

  <!-- build:site-footer -->
  <!-- /build:site-footer -->
  <script type="module" src="/assets/js/article.js"></script>
</body>
</html>
"""


def inline(text):
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, slug = Path(sys.argv[1]), sys.argv[2]
    entry = next((n for n in json.loads((ROOT / "data/notes.json").read_text()) if n["slug"] == slug), None)
    if not entry:
        sys.exit(f"add {slug!r} to data/notes.json first")

    blocks = [b.strip() for b in src.read_text(encoding="utf-8").split("\n\n") if b.strip()]
    if not blocks[0].startswith("# "):
        sys.exit("the note must start with '# Title'")
    title = blocks.pop(0)[2:].strip()

    kicker = ""
    if blocks and re.fullmatch(r"\*[^*].*[^*]\*", blocks[0]):
        kicker = f'<p class="memoir-kicker">{inline(blocks.pop(0).strip("*"))}</p>'

    body = []
    for b in blocks:
        if b.startswith("## "):
            body.append(f"        <h2>{inline(b[3:])}</h2>")
        else:
            body.append(f"        <p>{inline(' '.join(b.splitlines()))}</p>")

    d = date.fromisoformat(entry["date"])
    page = PAGE.format(
        title=html.escape(title), summary=html.escape(entry["summary"], quote=True),
        iso=entry["date"], pretty=f"{d.day} {d:%B %Y}", status=html.escape(entry["status"]),
        kicker=kicker, body="\n".join(body),
    )
    out = ROOT / "notebook" / f"{slug}.html"
    out.write_text(page, encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
