# Vision: surface, not portfolio

**Core priority: aesthetic coherence and visual authorship.**

The system must serve the visual language. Not the other way around.

This is not a portfolio. It is a **surface**. A constructed atmosphere. A controlled visual environment. The codebase is infrastructure. The aesthetic is the product.

Every technical decision is evaluated by one question:

**Does this protect and amplify the visual language?**

---

## Primary design goals

- **A singular, unmistakable visual identity** — One voice. No template residue.
- **Graphic restraint** — Nothing ornamental without intention. Every element earns its presence.
- **Biological + machine hybridity** — Texture and motion that feel both organic and systemic.
- **Controlled noise, controlled entropy** — Signal and grain are tuned, not random. The chaos is authored.
- **Typography as structure, not decoration** — Type carries hierarchy and rhythm. No visual clutter.
- **Interaction as signal modulation** — Not UI gimmick. Calibration, not chrome.

The architecture should **disappear behind the surface**. It should be invisible.

---

## Surface as material

The background is not a background. It is a **material**.

- Grain, scanlines, signal bleed, depth layers.
- It must feel like a **medium** — something you look *through* or *into* — not a webpage.
- The surface can evolve: more strata, different noise algorithms, generative states tied to lens or signal. The implementation is a support layer; the material is what the viewer experiences.

---

## Motion as metabolism

Animations should feel **biological or thermodynamic**.

- Subtle drift, oscillation, decay.
- Not “web animation” — system activity. As if the surface has a slow pulse or the traces are settling.
- Motion is part of the atmosphere. When reduced (safe mode, prefers-reduced-motion), the surface remains legible and intentional — not broken, just still.

---

## Data as artifact

Traces, writing, music are **recovered fragments**, not content cards.

- Avoid standard grids unless they are **graphically transformed** — staggered, weighted, treated as specimens.
- Presentation should feel like evidence or log entries, not feeds. The grid (if any) serves the metaphor: archive, trace index, signal map.

---

## Typography as hierarchy engine

- **Monospace for structure** — The skeleton of the page. Consistent, technical.
- **Variable weight or contrast for emphasis** — Sparingly. The restraint creates intensity.
- **Generous negative space** — Room to breathe. No clutter. Typography and space do the work; decoration does not.

---

## Interaction as signal

Sliders and toggles should feel like **calibration instruments**.

- Not UI widgets — **instruments**. Mode, signal intensity, lens sliders: they modulate the system. The feedback (glow, grain, sentence) is the readout.
- Reduce visible UI where possible. Every control that remains should feel necessary to the metaphor.

---

## Minimal color system

- **One dominant dark field.** The primary environment.
- **One accent.** Used for signal, focus, and emphasis. Rare enough to matter.
- **Everything else: tonal variation.** Muted, line, soft — all derived from the same palette. The restraint creates intensity.

---

## Rebuilding for aesthetic dominance

If the site were rebuilt purely under this lens:

1. **Reduce visible UI** — Strip anything that doesn’t serve the atmosphere or the metaphor.
2. **Remove anything generic** — No template patterns, no “portfolio” conventions unless they’re deliberately subverted.
3. **Push atmosphere over feature density** — Fewer sections, stronger presence. One strong surface beats many weak blocks.
4. **Make the page feel like an interface to a system** — Not a website. The visitor is tuning into something, not browsing a CV.

---

## Architecture: support layer

Architecture is **invisible scaffolding**.

- Its job: **zero friction to visual experimentation.** You should be able to change texture, motion, type, and layout without rewriting logic.
- Visual language lives in: tokens (color, space, type), CSS (surface, motion, layout), and authored content. The code that loads data, applies mode, or drives the ASCII field exists only to **support** those layers.
- Technical choices (vanilla vs. framework, data in JSON vs. inline, one script vs. many) are all answerable by: *Does this protect and amplify the visual language?* If a pattern makes it harder to iterate on the surface or forces generic structure, it loses.

**Long-term evolution** should focus on:

- **Visual refinement cycles** — Iterate on grain, depth, motion, type.
- **Texture evolution** — New materials, new blend modes, generative background states tied to lens or signal.
- **New display modalities** — Projection view, print view, minimal mode. The same content and logic, different visual treatment.
- **Evolving the visual language without rewriting logic** — The system should allow new surfaces (e.g. “minimal,” “print,” “signal-only”) by swapping or tuning CSS and tokens, not by refactoring core behavior.

---

## Summary

| Principle | Meaning |
|-----------|--------|
| **Aesthetic is the product** | The surface is what matters. Code serves it. |
| **Surface as material** | Background = medium. Grain, bleed, depth. Not “webpage.” |
| **Motion as metabolism** | Biological/thermodynamic. Drift, oscillation, decay. System activity. |
| **Data as artifact** | Traces and fragments, not cards. Grids only if graphically transformed. |
| **Typography as hierarchy** | Monospace structure. Restraint. Negative space. |
| **Interaction as signal** | Instruments, not widgets. Calibration and readout. |
| **Minimal color** | One dark field. One accent. Tonal variation. |
| **Architecture** | Invisible. Support layer. Zero friction to visual experimentation. |

The ideal version is a **controlled visual environment** that feels like an interface to a system — unmistakable, restrained, and authored. The infrastructure exists only to keep that surface coherent and easy to evolve.

---

## Appendix: technical scaffolding (invisible)

Implementation serves the surface. No more.

- **Tokens in one place** — Color, spacing, type scale, motion duration. Change the atmosphere by editing tokens, not hunting through CSS or JS.
- **Surface = CSS + optional canvas/SVG** — Grain, scanlines, glow, depth. Logic only supplies values (e.g. signal strength); the *look* lives in styles or generative art. New modalities (print, minimal, projection) = different CSS or token sets, same data.
- **Content separate from layout** — Traces, writing, music as data. Presentation (grid, list, artifact) is a visual choice. Change how fragments are displayed without touching content.
- **Interaction drives state; state drives appearance** — Mode, signal, lens write to `data-*` or CSS variables. The surface reacts. No UI logic in the “look”; no look logic in the “UI.”
- **Minimal script surface** — Only what’s needed for: applying token state, rendering data into the DOM, and running instruments (lens, ASCII, parallax). Everything else is CSS and content. So you can refine the visual language without rewriting logic.
