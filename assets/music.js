(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;
  const grid = U.qs("#music-grid");
  const bar = U.qs("#tag-filters");
  const extToggle = U.qs("#external-thumbs");
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
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || "";
      return u.searchParams.get("v") || "";
    } catch (_e) { return ""; }
  }

  function asciiThumb(seedText, pulse = 0) {
    const seed = U.hash(seedText);
    const r = U.seeded(seed + Math.floor(pulse * 1000));
    const chars = " .:-=+*#@";
    const lines = [];
    for (let y = 0; y < 8; y += 1) {
      let row = "";
      for (let x = 0; x < 30; x += 1) {
        const sig = Math.sin((x + pulse * 6) * 0.22) * Math.cos((y - pulse * 3) * 0.41);
        const v = ((sig + 1) * 0.5) * 0.65 + r() * 0.35;
        row += chars[Math.floor(U.clamp(v, 0, 0.999) * (chars.length - 1))] || " ";
      }
      lines.push(row);
    }
    return lines.join("\n");
  }

  let keyboardBound = false;

  function enableKeyboardGrid() {
    const links = U.qsa(".song-link", grid);
    if (!links.length || keyboardBound) return;
    keyboardBound = true;
    grid.addEventListener("keydown", (e) => {
      const focused = document.activeElement;
      const i = links.indexOf(focused);
      if (i < 0) return;
      const col = Math.max(1, Math.floor(grid.clientWidth / 220));
      let next = i;
      if (e.key === "ArrowRight") next = Math.min(links.length - 1, i + 1);
      else if (e.key === "ArrowLeft") next = Math.max(0, i - 1);
      else if (e.key === "ArrowDown") next = Math.min(links.length - 1, i + col);
      else if (e.key === "ArrowUp") next = Math.max(0, i - col);
      else if (e.key === "Enter") { focused.click(); return; }
      else return;
      e.preventDefault();
      links[next].focus();
    });
  }

  function maybeAttachExternalThumb(tile, id) {
    if (!extToggle || !extToggle.checked || !id) return;
    try {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.style.maxWidth = "100%";
      img.style.opacity = "0.4";
      img.style.border = "1px solid var(--line)";
      img.onerror = () => { img.remove(); };
      img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      tile.appendChild(img);
    } catch (_e) {
      return;
    }
  }

  function render(tag = "ALL") {
    const items = tracks.filter((t) => tag === "ALL" || t.tags.includes(tag));
    grid.innerHTML = items.map((t, i) => {
      const id = parseYouTubeId(t.url);
      return `<article class="song-tile" data-i="${i}" tabindex="-1">
        <pre class="song-ascii">${asciiThumb(id || t.title, 0)}</pre>
        <a class="song-link" href="${t.url}" target="_blank" rel="noopener noreferrer">${t.title}</a>
        <div class="song-tags">${t.tags.join(" · ")} · id:${id || "unknown"}</div>
        <div class="signal-preview">preview - carrier stable, sideband latent</div>
      </article>`;
    }).join("");

    U.qsa(".song-tile", grid).forEach((tile) => {
      const link = U.qs(".song-link", tile);
      const ascii = U.qs(".song-ascii", tile);
      if (!link || !ascii) return;
      const id = parseYouTubeId(link.href);
      const preview = U.qs(".signal-preview", tile);
      maybeAttachExternalThumb(tile, id);
      const animate = () => {
        if (document.body.dataset.safe === "on" || U.prefersReducedMotion()) return;
        ascii.textContent = asciiThumb(id || link.textContent || "", 0.8);
        if (preview) preview.textContent = "preview - interference rising, contour retained";
        setTimeout(() => {
          ascii.textContent = asciiThumb(id || link.textContent || "", 0);
          if (preview) preview.textContent = "preview - carrier stable, sideband latent";
        }, 180);
      };
      tile.addEventListener("mouseenter", animate);
      tile.addEventListener("focusin", animate);
    });

    enableKeyboardGrid();
  }

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tag]");
    if (!btn) return;
    const tag = btn.dataset.tag || "ALL";
    U.qsa("button[data-tag]", bar).forEach((b) => b.classList.toggle("active", b === btn));
    render(tag);
  });

  if (extToggle) extToggle.addEventListener("change", () => {
    const active = U.qs("button[data-tag].active", bar);
    render(active?.dataset.tag || "ALL");
  });

  window.__MUSIC_TEST__ = { parseYouTubeId };
  render("ALL");
})();
