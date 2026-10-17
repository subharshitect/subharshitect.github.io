// Draws a simulation frame onto a canvas as a plate: one character per cell
// (or a small block when cells get too small to read), coloured by tone,
// with a soft glow underneath. The frame's text stays the source of truth;
// this only presents it.

import { PALETTE } from "./sim/sims.js";

const LAST = PALETTE.length - 1;

// How much ink each character carries, for drawing cells as blocks when
// they are too small for glyphs. Characters outside the palette are solid.
const INK = new Map([..." .:-=+*#%@"].map((c, i) => [c, i === 0 ? 0 : 0.14 + (0.86 * i) / 9]));
const ink = (c) => (INK.has(c) ? INK.get(c) : 1);

function css(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || fallback;
}

export function resolveTones(names = []) {
  return names.map((n) => css(n, "#4eb8e0"));
}

export class PlateCanvas {
  constructor(canvas, { cols, rows, aspect = 1.8, tones = null }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.buf = document.createElement("canvas");
    this.bctx = this.buf.getContext("2d");
    this.cols = cols;
    this.rows = rows;
    this.aspect = aspect;
    this.toneColours = tones ? resolveTones(tones) : null;
    this.accent = css("accent", "#4eb8e0");
    this.mono = css("font-mono", "monospace");
    this.last = null;
    this.resize = this.resize.bind(this);
    if ("ResizeObserver" in window) new ResizeObserver(this.resize).observe(canvas);
    window.addEventListener("sr:prefs", () => this.redraw());
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    if (!w) return;
    const h = (w / this.cols) * this.aspect * this.rows;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.height = `${h}px`;
    this.canvas.width = this.buf.width = Math.round(w * dpr);
    this.canvas.height = this.buf.height = Math.round(h * dpr);
    this.scale = dpr;
    this.cellW = w / this.cols;
    this.cellH = this.cellW * this.aspect;
    this.redraw();
  }

  redraw() {
    if (this.last) this.draw(this.last.text, this.last.tones);
  }

  // text: rows joined by "\n"; tones: optional Uint8Array (255 = empty).
  draw(text, tones = null) {
    this.last = { text, tones };
    if (!this.cellW) return;
    const { bctx: b, buf, scale, cellW: cw, cellH: ch } = this;
    b.setTransform(scale, 0, 0, scale, 0, 0);
    b.clearRect(0, 0, buf.width, buf.height);
    const glyphs = cw >= 6.5;
    if (glyphs) {
      const px = this.aspect >= 1.5 ? ch * 0.95 : cw * 1.25;
      b.font = `${px.toFixed(2)}px ${this.mono}`;
      b.textAlign = "center";
      b.textBaseline = "middle";
    }
    const lines = text.split("\n");
    // Group cells by colour so fillStyle changes stay few.
    const groups = new Map();
    for (let y = 0; y < lines.length; y += 1) {
      const line = lines[y];
      for (let x = 0; x < line.length; x += 1) {
        const c = line[x];
        if (c === " ") continue;
        const i = y * this.cols + x;
        let key;
        if (tones && this.toneColours) {
          const t = tones[i];
          if (t === 255) continue;
          key = glyphs ? `t${t}` : `t${t}:${ink(c)}`;
        } else {
          key = `a${Math.max(1, PALETTE.indexOf(c))}`;
        }
        let g = groups.get(key);
        if (!g) { g = []; groups.set(key, g); }
        g.push(x, y, c);
      }
    }
    for (const [key, cells] of groups) {
      if (key[0] === "t") {
        const [tone, weight] = key.slice(1).split(":");
        b.fillStyle = this.toneColours[Number(tone)];
        b.globalAlpha = weight === undefined ? 1 : Number(weight);
      } else {
        b.fillStyle = this.accent;
        b.globalAlpha = 0.2 + 0.8 * (Number(key.slice(1)) / LAST);
      }
      for (let k = 0; k < cells.length; k += 3) {
        const x = cells[k];
        const y = cells[k + 1];
        if (glyphs) b.fillText(cells[k + 2], (x + 0.5) * cw, (y + 0.5) * ch);
        else b.fillRect(x * cw, y * ch, cw + 0.35, ch + 0.35);
      }
    }
    b.globalAlpha = 1;
    this.composite();
  }

  // Glow: a blurred copy added underneath the sharp frame. Off in reading view.
  composite() {
    const { ctx, buf, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const glow = document.documentElement.dataset.presentation !== "reading";
    if (glow && "filter" in ctx) {
      ctx.filter = `blur(${Math.round(5 * this.scale)}px)`;
      ctx.globalAlpha = 0.7;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(buf, 0, 0);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(buf, 0, 0);
  }

  // The plate with a caption block underneath, for "Save as PNG" and postcards.
  compose(caption = []) {
    const pad = 32 * this.scale;
    const lh = 22 * this.scale;
    const out = document.createElement("canvas");
    const capH = caption.length ? pad * 0.75 + caption.length * lh : 0;
    out.width = this.canvas.width + pad * 2;
    out.height = this.canvas.height + pad * 2 + capH;
    const c = out.getContext("2d");
    c.fillStyle = css("background", "#030507");
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(this.canvas, pad, pad);
    if (caption.length) {
      const top = pad + this.canvas.height + pad * 0.75;
      c.strokeStyle = css("border", "#25303d");
      c.lineWidth = this.scale;
      c.beginPath();
      c.moveTo(pad, top - pad * 0.4);
      c.lineTo(out.width - pad, top - pad * 0.4);
      c.stroke();
      c.font = `${13 * this.scale}px ${this.mono}`;
      c.textBaseline = "top";
      caption.forEach((t, i) => {
        c.fillStyle = i === 0 ? css("text", "#d3dbe5") : css("text-secondary", "#a5b0bf");
        c.fillText(t, pad, top + i * lh);
      });
    }
    return out;
  }

  thumb(width = 96) {
    const out = document.createElement("canvas");
    out.width = width;
    out.height = Math.max(1, Math.round((this.canvas.height / this.canvas.width) * width));
    const c = out.getContext("2d");
    c.fillStyle = css("background", "#030507");
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(this.canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }
}
