# Content that needs your writing

Everything below is built and working, but either hidden as a draft or using
placeholder text. Preview it all with `?drafts=1`. Nothing here was invented
as if it were yours: the drafts are templates or suggestions to replace.

## Check first (visible now)

- [ ] **Introduction and Work** (`index.html`): rewritten from the old site's
      own wording (IIT Delhi PhD; KV caches, paging, parameter deltas,
      trace-driven inference; PyTorch · CUDA · Triton · eBPF · perf;
      "measure, reduce, remain"). Check that it describes your research
      accurately; "parameter deltas and compression" is my reading of the old
      "parameter decay / deltas".
- [ ] **Listening** (`data/listening.json`): the seven tracks from the old
      music page, with titles as you wrote them. `artist` and `note` are
      empty, and the old VOID/KINETIC/… tags are gone. The annotation is the
      point of the shelf, so add one or two sentences per track. `added` is the
      date the music page was first committed (2026-02-21).

## Drafts (hidden until you remove the flag)

- [ ] **Projects** row in Work: two or three projects with a one-line result and a link.
- [ ] **CV** row in About: add `cv.pdf` at the site root, then remove `data-draft`.
- [ ] **Currently** (`data/currently.json`): three fields and the update date.
- [ ] **Questions** (`data/questions.json`): five *suggestions* drawn from the
      themes of the old site. Replace them with questions you actually care
      about, and link related notes.
- [ ] **First notebook entry.** `notebook/how-these-notes-work.html` is a
      template showing every component: status, margin note, figure with
      result/annotation/data views, uncertainty section, related links.
      The RaBitQ trace notebook in codec-got-ragged would make a natural
      first entry.
- [ ] **First failed attempt**: `notebook/failed-attempt-template.html`.
- [ ] **Reflections on Plates I–VI** (`specimens/*.html`): each plate has a
      drafted "Reflection" section, hidden until you remove its `data-draft`.
      They are my drafts of the philosophical reading; rewrite them in your
      voice. Everything else on the plates (the original, what it shows, what
      it does not show, further reading) is checked against the papers.
- [ ] **The annotated trace** (`specimens/trace.html`, Plate VII): real data, recorded on
      the H200 on 2026-10-17 (opt-125m, fp16, 104-token prompt, 8 decode steps).
      The six notes in `tools/example_annotations.json` state only what the
      trace measures (step times, GPU busy share, kernel counts, memory growth
      per token). They are hedged where the evidence is indirect (the lm_head
      kernel identification). Rewrite them in your own voice, then remove
      `draft` from the page and the `data-draft` links to it (homepage, the
      catalogue, and Plate VI's next link). `tests/trace.test.mjs` checks the numbers the notes
      quote.
- [ ] **First snapshot** (`snapshots/2026-10.html`): the template for the
      monthly record. When one is published, the footer shows "Monthly
      snapshots" and "Feed" automatically.
- [ ] **Field notebook** (`/field/`): built (grid, accessible enlarged view,
      lazy loading) but empty and not linked. Add images to `data/field.json`
      and a link from the homepage when there is a first set.

## Removed from the homepage

The old archive entries (TRACE-001…033) and log lines had specific-looking
numbers ("recovered 16% memory with 2.1% narrative loss") that weren't backed
by experiments, so they were removed. The mechanism-lens sliders became real,
named conditions on the specimen plates.

Your own lines, kept here so they aren't lost (they also remain in git
history). Some could become margin notes or captions:

> genes write structure; minds write meaning; matter learns to model itself: consciousness  *(still on the homepage, in About)*
>
> i build architectures for exhaustion, machines that feel the weight of their own precision
>
> I profile the silence between CUDA kernels before I trust the throughput report.
> The trace says memory is stable, then one allocator spike writes panic into the night.
> I name each bottleneck like evidence, then ask which one is lying by omission.
> Compression feels ethical until the lost token is a human intention.
> Every cache hit is temporary mercy, every miss a confession of architecture.
> I log thermal drift beside model drift because silicon also keeps a body ledger.
> When latency drops, I listen harder for what meaning was shaved to get there.
>
> the machine hums quietly beneath the words.
> this page; bare metal and breath-hosts my work, my decay, my deltas.

"machine / memory / myth" stays in the footer.
