(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const gallery = U.qs("#archive-gallery");
  const log = U.qs("#archive-log");
  const toggle = U.qs("#archive-view-toggle");
  if (!gallery || !log || !toggle) return;

  const tiles = [
    ["TRACE-001", "cache churn plateau", "KV eviction pattern resolves into thermodynamic debt."],
    ["TRACE-009", "allocator ghost", "memory climbs with no gradient pressure then collapses at dawn."],
    ["TRACE-014", "precision scar", "quantization recovers speed but amputates an intention."],
    ["TRACE-021", "paging weather", "swap storms begin when attention windows overstay."],
    ["TRACE-027", "thermal witness", "silicon heat map mirrors the model's hesitation."],
    ["TRACE-033", "inference rust", "latency stabilizes while semantic drift keeps widening."]
  ];

  const logs = [
    ["2025-01-14T01:17:00Z", "checkpoint review - compression recovered 16% memory with 2.1% narrative loss"],
    ["2025-02-22T03:45:00Z", "trace ingestion - found periodic stall linked to attention page faults"],
    ["2025-03-09T02:08:00Z", "perf audit - transient gains masked long-tail coherence decay"],
    ["2025-04-18T00:32:00Z", "archive patch - rebuilt lens path for deterministic sentence generation"],
    ["2025-05-11T04:01:00Z", "safety pass - safe mode now halts loops on hidden tab and reduced motion"]
  ];

  const mini = ["..::--==", "==++**##", "##%%@@%%", "**++==--"];

  gallery.innerHTML = tiles.map((t, i) => `
    <article class="tile" role="listitem" tabindex="0" data-i="${i}">
      <div class="meta">${t[0]} - ${t[1]}</div>
      <pre class="ascii-mini">${mini.join("\n")}</pre>
      <div>${t[2]}</div>
      <div class="deep">expanded layer: scheduler residue, cache temperatures, and witness timestamps remain visible in explosion mode.</div>
    </article>
  `).join("");

  log.innerHTML = logs.map((l) => `
    <div class="log-entry"><time>${l[0]}</time><div>${l[1]}</div></div>
  `).join("");

  function setView(view) {
    const v = view === "log" ? "log" : "gallery";
    document.body.dataset.archiveView = v;
    gallery.hidden = v !== "gallery";
    log.hidden = v !== "log";
    toggle.textContent = `VIEW: ${v.toUpperCase()}`;
    U.storageSet("archive-view", v);
  }

  toggle.addEventListener("click", () => {
    setView(document.body.dataset.archiveView === "gallery" ? "log" : "gallery");
  });

  const drift = { mx: 0, my: 0, sy: 0 };
  const allTiles = () => U.qsa(".tile", gallery);

  function paint() {
    const safe = document.body.dataset.safe === "on" || U.prefersReducedMotion();
    if (safe) {
      allTiles().forEach((tile) => { tile.style.transform = "translate3d(0,0,0)"; });
      return;
    }
    allTiles().forEach((tile, i) => {
      const f = (i + 1) * 0.7;
      const dx = (drift.mx - 0.5) * f * 8;
      const dy = (drift.my - 0.5) * f * 8 + drift.sy * (0.008 * f);
      tile.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
    });
  }

  window.addEventListener("mousemove", U.debounce((e) => {
    drift.mx = e.clientX / Math.max(window.innerWidth, 1);
    drift.my = e.clientY / Math.max(window.innerHeight, 1);
    paint();
  }, 16));
  window.addEventListener("scroll", U.debounce(() => {
    drift.sy = window.scrollY;
    paint();
  }, 16), { passive: true });
  window.addEventListener("safe-mode-change", paint);

  setView(U.storageGet("archive-view", "gallery"));
  paint();
})();
