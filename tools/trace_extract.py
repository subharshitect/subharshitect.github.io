"""Convert a Chrome-format trace (torch.profiler, Perfetto JSON, nsys export)
into the compact format /experiments/trace.html loads.

Standard library only. What it does:

  * keeps only the event kinds that become lanes (see LANES below); on the
    CPU only top-level PyTorch ops, not the ops nested inside them
  * makes times relative to the first kept event, in milliseconds
  * shortens kernel names (drops "void ", template and argument lists)
  * drops every `args` field, file path, pid/tid and input shape, so nothing
    private in the raw trace reaches the browser
  * stores events as [lane, start, duration, label] rows with a shared label
    table, which keeps the file a few percent of the raw trace's size
  * downsamples the memory counter

    python3 tools/trace_extract.py raw.trace.json --out data/traces/run.json \
        [--context context.json] [--annotations annotations.json]

`--context` is a JSON object shown above the timeline (hardware, workload,
settings, source). `--annotations` is a list of {"match": {...}, "title": ..., "text": ...}
where `match` picks one event by lane, name substring and occurrence (see
tools/example_annotations.json). Matching by content instead of by generated
id keeps annotations valid when the trace is re-extracted.
"""

import argparse
import json
import re
import sys

LANES = ["Steps", "CPU: PyTorch ops", "GPU kernels", "GPU memory"]
MEMORY_POINTS = 400


def short_name(name):
    name = name.replace("(anonymous namespace)", "")
    name = re.sub(r"^void\s+", "", name)
    # Drop template lists, innermost first, then the argument list.
    for _ in range(10):
        new = re.sub(r"<[^<>]*>", "", name)
        if new == name:
            break
        name = new
    name = name.split("(", 1)[0]
    name = re.sub(r"(?:[A-Za-z_]\w*)?::", "", name)  # namespaces and stray ::
    name = re.sub(r"[/\\]\S*", "", name)  # anything path-like
    return name.strip()[:72] or "kernel"


def lane_of(ev):
    cat = ev.get("cat", "")
    if cat == "user_annotation" and ev.get("ph") == "X":
        return "Steps"
    if cat == "cpu_op" and ev.get("ph") == "X":
        return "CPU: PyTorch ops"
    if cat == "kernel" and ev.get("ph") == "X":
        return "GPU kernels"
    return None


def gpu_memory_points(events):
    pts = []
    for ev in events:
        if ev.get("name") != "[memory]":
            continue
        a = ev.get("args", {})
        if a.get("Device Type") != 1:  # 1 = CUDA in torch.profiler
            continue
        if "Total Allocated" in a:
            pts.append((float(ev["ts"]), a["Total Allocated"] / 2**20))
    pts.sort()
    return pts


def top_level(events):
    """Ops not contained in an earlier op on the same thread."""
    out, end = [], {}
    for ev in sorted(events, key=lambda e: (str(e.get("tid", "")), float(e["ts"]), -float(e.get("dur", 0)))):
        ts = float(ev["ts"])
        if ts >= end.get(str(ev.get("tid", "")), -1):
            out.append(ev)
            end[str(ev.get("tid", ""))] = ts + float(ev.get("dur", 0))
    return out


def downsample(points, n):
    """Keep the lowest and highest value in each of n/2 time buckets, so
    short peaks and drops survive."""
    if len(points) <= n:
        return points
    t0, t1 = points[0][0], points[-1][0]
    buckets = max(1, n // 2)
    width = (t1 - t0) / buckets or 1
    groups = {}
    for p in points:
        groups.setdefault(min(buckets - 1, int((p[0] - t0) / width)), []).append(p)
    out = []
    for _, g in sorted(groups.items()):
        lo = min(g, key=lambda p: p[1])
        hi = max(g, key=lambda p: p[1])
        out.extend(sorted({lo, hi}))
    if out[-1] != points[-1]:
        out.append(points[-1])
    return out


def match_event(events, match):
    hits = [
        e for e in events
        if e["lane"] == match["lane"] and match.get("name", "") in e["label"]
    ]
    k = match.get("occurrence", 1)
    if len(hits) < k:
        raise SystemExit(f"annotation match found {len(hits)} events, needs occurrence {k}: {match}")
    return hits[k - 1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("trace")
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="Example inference run")
    ap.add_argument("--context")
    ap.add_argument("--annotations")
    args = ap.parse_args()

    with open(args.trace) as f:
        raw = json.load(f)
    events = raw["traceEvents"] if isinstance(raw, dict) else raw

    kept, cpu_ops = [], []
    for ev in events:
        lane = lane_of(ev)
        if lane == "CPU: PyTorch ops":
            cpu_ops.append(ev)
        elif lane:
            kept.append((lane, ev))
    kept += [("CPU: PyTorch ops", ev) for ev in top_level(cpu_ops)]
    if not kept:
        sys.exit("no step, CPU op or kernel events found")
    t0 = min(float(ev["ts"]) for _, ev in kept)

    def ms(us):
        return round((us - t0) / 1000.0, 4)

    out_events = []
    for lane, ev in kept:
        ts, dur = float(ev["ts"]), float(ev.get("dur", 0))
        label = ev["name"] if lane in ("Steps", "CPU: PyTorch ops") else short_name(ev["name"])
        out_events.append({"lane": lane, "start": ms(ts), "duration": round(dur / 1000.0, 4), "label": label})
    out_events.sort(key=lambda e: (LANES.index(e["lane"]), e["start"]))

    mem = [(ms(t), round(v, 2)) for t, v in gpu_memory_points(events) if t >= t0]
    duration = round(max(e["start"] + e["duration"] for e in out_events), 4)

    annotations = []
    if args.annotations:
        with open(args.annotations) as f:
            for a in json.load(f):
                ev = match_event(out_events, a["match"])
                annotations.append({"event": out_events.index(ev), "title": a["title"], "text": a["text"]})

    context = {}
    if args.context:
        with open(args.context) as f:
            context = json.load(f)

    labels = sorted({e["label"] for e in out_events})
    label_index = {l: i for i, l in enumerate(labels)}
    doc = {
        "format": "sr-trace",
        "v": 1,
        "title": args.title,
        "timeUnit": "ms",
        "duration": duration,
        "lanes": LANES,
        "context": context,
        "labels": labels,
        "eventFields": ["lane", "start", "duration", "label"],
        "events": [[LANES.index(e["lane"]), e["start"], e["duration"], label_index[e["label"]]] for e in out_events],
        "counters": [{"lane": "GPU memory", "unit": "MiB", "label": "allocated", "points": downsample(mem, MEMORY_POINTS)}] if mem else [],
        "annotations": annotations,
    }
    with open(args.out, "w") as f:
        json.dump(doc, f, separators=(",", ":"))
    by_lane = {l: sum(1 for e in out_events if e["lane"] == l) for l in LANES}
    print(f"wrote {args.out}: {len(out_events)} events {by_lane}, {len(mem)} memory points, {duration} ms")


if __name__ == "__main__":
    main()
