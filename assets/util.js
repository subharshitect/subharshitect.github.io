(() => {
  "use strict";
  const U = {
    qs: (s, r = document) => r.querySelector(s),
    qsa: (s, r = document) => Array.from(r.querySelectorAll(s)),
    clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    debounce(fn, wait = 100) {
      let t = null;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    },
    storageGet(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (_e) {
        console.warn("storageGet failed", key);
        return fallback;
      }
    },
    storageSet(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (_e) { console.warn("storageSet failed", key); }
    },
    prefersReducedMotion() {
      try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
      catch (_e) { return false; }
    },
    seeded(seed) {
      let s = seed >>> 0;
      return () => {
        s = (1664525 * s + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }
  };
  window.__UTIL__ = U;
})();
