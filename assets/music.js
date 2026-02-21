(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;
  const grid = U.qs("#music-grid");
  const bar = U.qs("#tag-filters");
  if (!grid || !bar) return;

  const tracks = [
    { url: "https://www.youtube.com/watch?v=M1dtkfI_iuI", title: "the ghost song", tags: ["VOID", "NOCTURNE"] },
    { url: "https://www.youtube.com/watch?v=XgCnUYeyeiA", title: "when the smoke is going down", tags: ["TENDER", "RITUAL"] },
    { url: "https://www.youtube.com/watch?v=mJx5GlTEcmQ", title: "draconid - creatureism", tags: ["FERAL", "KINETIC"] },
    { url: "https://www.youtube.com/watch?v=ix-6vG3qXPc", title: "three lices and a molly - 'maybe we'll hug each other in a past life", tags: ["TENDER", "NOCTURNE"] },
    { url: "https://www.youtube.com/watch?v=7GbB2PgUeXs", title: "sorry i sleepwalked at your funeral", tags: ["VOID", "RITUAL"] },
    { url: "https://www.youtube.com/watch?v=Qw_tkIBb7u4", title: "febrile", tags: ["KINETIC", "FERAL"] },
    { url: "https://www.youtube.com/watch?v=8LiTxEUxSHU&list=RD8LiTxEUxSHU&start_radio=1", title: "quazar / sanxion - hybrid song", tags: ["KINETIC", "NOCTURNE"] }
  ];

  function parseYouTubeId(raw) {
    try {
      const u = new URL(raw);
      if (u.hostname.includes("youtu.be")) return u.pathname.replace(/^\//, "").split("/")[0] || "";
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || "";
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v") || "";
      const maybe = u.searchParams.get("v");
      return maybe || "";
    } catch (_e) {
      return "";
    }
  }

  function asciiThumb(seedText) {
    const seed = seedText.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + 37;
    const r = U.seeded(seed);
    const chars = " .:-=+*#%@";
    const lines = [];
    for (let y = 0; y < 8; y += 1) {
      let row = "";
      for (let x = 0; x < 30; x += 1) {
        const v = (Math.sin(x * 0.25 + y * 0.7) + 1) / 2 * 0.5 + r() * 0.5;
        row += chars[Math.floor(v * (chars.length - 1))];
      }
      lines.push(row);
    }
    return lines.join("\n");
  }

  function render(tag = "ALL") {
    const items = tracks.filter((t) => tag === "ALL" || t.tags.includes(tag));
    grid.innerHTML = items.map((t) => {
      const id = parseYouTubeId(t.url);
      return `<article class="song-tile">
        <pre class="song-ascii">${asciiThumb(id || t.title)}</pre>
        <a href="${t.url}" target="_blank" rel="noopener noreferrer">${t.title}</a>
        <div class="song-tags">${t.tags.join(" · ")} · id:${id || "unknown"}</div>
      </article>`;
    }).join("");
  }

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tag]");
    if (!btn) return;
    const tag = btn.dataset.tag || "ALL";
    U.qsa("button[data-tag]", bar).forEach((b) => b.classList.toggle("active", b === btn));
    render(tag);
  });

  window.__MUSIC_TEST__ = { parseYouTubeId };
  render("ALL");
})();
