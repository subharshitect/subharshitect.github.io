(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const gallery = U.qs("#archive-gallery");
  const log = U.qs("#archive-log");
  const toggle = U.qs("#archive-view-toggle");
  if (!gallery || !log || !toggle) return;

  const traces = [
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

  const asciiStrip = "..::--==++**##%%@@";

  gallery.innerHTML = traces.map((t, i) => `
    <article class="artifact" role="listitem" tabindex="0" data-i="${i}" style="margin-left: ${(i % 3) * 0.75}rem">
      <div class="artifact-inner">
        <span class="artifact-id">${t[0]}</span>
        <span class="artifact-title">${t[1]}</span>
        <p class="artifact-fragment">${t[2]}</p>
        <pre class="ascii-strip" aria-hidden="true">${asciiStrip}</pre>
        <div class="artifact-deep">expanded layer: scheduler residue, cache temperatures, witness timestamps.</div>
      </div>
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
    toggle.textContent = v === "gallery" ? "LOG" : "TRACES";
    U.storageSet("archive-view", v);
  }

  toggle.addEventListener("click", () => {
    setView(document.body.dataset.archiveView === "gallery" ? "log" : "gallery");
  });

  const drift = { mx: 0, my: 0, sy: 0 };
  let paintScheduled = false;
  const allArtifacts = () => U.qsa(".artifact", gallery);

  function paint() {
    paintScheduled = false;
    const safe = document.body.dataset.safe === "on" || U.prefersReducedMotion();
    if (safe) {
      allArtifacts().forEach((el) => { el.style.transform = "translate3d(0,0,0)"; });
      return;
    }
    allArtifacts().forEach((el, i) => {
      const f = (i + 1) * 0.5;
      const dx = (drift.mx - 0.5) * f * 6;
      const dy = (drift.my - 0.5) * f * 6 + drift.sy * (0.006 * f);
      el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
    });
  }

  function schedulePaint() {
    if (paintScheduled) return;
    paintScheduled = true;
    requestAnimationFrame(paint);
  }

  window.addEventListener("mousemove", (e) => {
    drift.mx = e.clientX / Math.max(window.innerWidth, 1);
    drift.my = e.clientY / Math.max(window.innerHeight, 1);
    schedulePaint();
  });
  window.addEventListener("scroll", () => {
    drift.sy = window.scrollY;
    schedulePaint();
  }, { passive: true });
  window.addEventListener("safe-mode-change", paint);

  setView(U.storageGet("archive-view", "gallery"));
  paint();
})();
