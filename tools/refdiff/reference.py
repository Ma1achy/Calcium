"""
The reference half of `make refdiff` — matplotlib rendered to braille.

**Why this is a text renderer and not a PNG.** A raster comparison shows that
two pictures differ and cannot show *which half* differs. Run the first time,
this rig immediately separated the two: our line curve sat on exactly the cells
matplotlib's did, and everything that differed was furniture — a missing right
border, absent ticks, no x labels. That is a different bug list from "the line
is in the wrong place", and no side-by-side of two images distinguishes them.

**The geometry is made comparable deliberately, in three steps.**

1. `axis("off")` and a full-bleed axes rectangle, so the figure *is* the data
   area. matplotlib's own furniture is not the subject — ours is compared
   against termplot and UnicodePlots, not against matplotlib.
2. The figure is sized in pixels to `(2·cols, 4·rows)`, because a braille cell
   is a 2×4 dot grid. The braille output is then exactly `cols × rows`
   characters, and lands on the same grid as a calcium plot area rendered with
   `axes: false`.
3. One fixture set for both sides, exported from `CATALOGUE_FORMS`.

Anything not in `RENDERERS` is reported as skipped with a reason. A form
silently missing from a comparison reads as a form that passed it.
"""
import io
import json, os, sys, warnings
warnings.filterwarnings("ignore")

from PIL import Image
# Pillow >= 10 removed `Image.ANTIALIAS`; drawille's image path still asks for it.
if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.LANCZOS

import matplotlib
matplotlib.use("module://drawilleplot")
import matplotlib.pyplot as plt
import numpy as np

F_OURS = json.load(open("/work/ours.json"))
COLS = F_OURS["cols"]
GRID = F_OURS["grid"]        # form -> the row count our renderer actually produced
ROWS = max(GRID.values())
# 72 dpi makes one typographic point one pixel, so `lw=1` is a one-pixel line
# and no resampling stands between the figure and the dot grid.
DPI = 72
F = json.load(open("/work/fixtures.json"))
OUT = "/work/out"
# **Cleared, not merely created.** A form dropped from `RENDERERS` — because
# matplotlib has no primitive for it, or because its fixture changed shape —
# leaves its last render behind, and `pair.mjs` finds the file and compares
# against it. That is the third manufacture-evidence shape again: real braille
# from a real run, describing a form that is no longer being rendered.
if os.path.isdir(OUT):
    for stale in os.listdir(OUT):
        os.remove(os.path.join(OUT, stale))
os.makedirs(OUT, exist_ok=True)


def figure(rows):
    """A figure that is nothing but its data area, sized to the braille grid."""
    fig = plt.figure(figsize=(COLS * 2 / DPI, rows * 4 / DPI), dpi=DPI)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.axis("off")
    ax.margins(0)
    return fig, ax


def to_braille(fig, rows, threshold=200):
    """
    The figure's pixels as a fixed `COLS x ROWS` braille block.

    **Not `drawilleplot.show()`, and the two differences are both fatal to a
    geometry diff.** That path hardcodes a 240-pixel resize, so the caller never
    controls the grid; and it calls `Canvas.frame()` with no bounds, which trims
    to the bounding box of the ink — discarding exactly the absolute position
    the comparison is about. A curve drawn in the wrong half of the plot comes
    back looking identical to one drawn in the right half.
    """
    from drawille import Canvas
    buf = io.BytesIO()
    fig.canvas.print_png(buf)
    buf.seek(0)
    img = Image.open(buf).convert("L")
    w, h = COLS * 2, rows * 4
    if img.size != (w, h):
        img = img.resize((w, h), Image.LANCZOS)
    can = Canvas()
    px = img.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] < threshold:
                can.set(x, y)
    return can.frame(0, 0, w, h)


def vals(spec, i=0):
    s = spec.get("series", [])
    if len(s) <= i:
        return []
    return [x for x in s[i]["values"] if x is not None]


def series(spec):
    return [[x for x in s["values"] if x is not None] for s in spec.get("series", [])]


def grid(spec):
    """Matrix forms: a `rows`x`cols` field, however the fixture spells it."""
    if "matrix" in spec:
        return np.array(spec["matrix"], dtype=float)
    ss = series(spec)
    if len(ss) > 1:
        n = min(len(r) for r in ss)
        return np.array([r[:n] for r in ss], dtype=float)
    v = vals(spec)
    side = max(1, int(len(v) ** 0.5))
    return np.array(v[: side * side], dtype=float).reshape(side, side)


# --- one renderer per form -------------------------------------------------
# Each draws the chart type the *reference* says it is, not the one we
# implemented. That asymmetry is the point: where they disagree, the reference
# is the specification.

def r_line(a, s): a.plot(vals(s), lw=1)
def r_scatter(a, s): a.plot(vals(s), ".", ms=2)
def r_step(a, s): v = vals(s); a.step(range(len(v)), v, where="post", lw=1)
def r_area(a, s): v = vals(s); a.fill_between(range(len(v)), v, lw=1)


def r_ecdf(a, s):
    v = np.sort(vals(s))
    a.step(v, np.arange(1, len(v) + 1) / len(v), where="post", lw=1)


def r_density(a, s):
    import seaborn as sns
    sns.kdeplot(vals(s), fill=False, ax=a, lw=1)


def r_bar(a, s):
    v = vals(s)
    a.barh(range(len(v)), v)
    a.invert_yaxis()


def r_bar_v(a, s):
    v = vals(s)
    a.bar(range(len(v)), v)


def r_hist(a, s): a.hist(vals(s), bins=8, orientation="horizontal")
def r_lollipop(a, s):
    v = vals(s)
    a.hlines(range(len(v)), 0, v, lw=1); a.plot(v, range(len(v)), "o", ms=3); a.invert_yaxis()


def r_dotplot(a, s):
    v = vals(s); a.plot(v, range(len(v)), "o", ms=3); a.invert_yaxis()


def r_funnel(a, s):
    v = vals(s)
    for i, x in enumerate(v):
        a.barh(i, x, left=-x / 2)
    a.invert_yaxis()


def r_gantt(a, s):
    v, off = vals(s), s.get("offsets", [0] * len(vals(s)))
    for i, (d, o) in enumerate(zip(v, off)):
        a.barh(i, d, left=o)
    a.invert_yaxis()


def r_waterfall(a, s):
    v = vals(s); run = 0
    for i, x in enumerate(v):
        a.bar(i, x, bottom=run); run += x


def bxp_stats(spec):
    """
    matplotlib's precomputed-statistics shape, from our `quartiles`.

    **`series` is empty for this family and the data is in `quartiles`.** The
    first version of this file read `series` and produced an empty figure, which
    the blank check caught — without it the comparison would have run against
    nothing and reported the difference as ours.
    """
    out = []
    for q in spec.get("quartiles", []):
        out.append({
            "med": q["median"], "q1": q["q1"], "q3": q["q3"],
            "whislo": q["min"], "whishi": q["max"],
            "fliers": q.get("outliers", []),
            "mean": q.get("mean"),
        })
    return out


def r_boxplot(a, s):
    st = bxp_stats(s)
    if st:
        a.bxp(st, vert=False, widths=0.6, showfliers=True,
              showmeans=any(x["mean"] is not None for x in st))
        a.invert_yaxis()
        return
    a.boxplot(series(s) or [vals(s)], vert=False, widths=0.6)


def r_violin(a, s):
    ss = series(s)
    if ss:
        a.violinplot(ss, vert=False, showmedians=True)
        return
    # No samples — draw the box the quartiles describe, which is what a violin
    # degenerates to when the distribution is not in the fixture.
    a.bxp(bxp_stats(s), vert=False, widths=0.6)
    a.invert_yaxis()


def r_ridgeline(a, s):
    import seaborn as sns
    ss = series(s)
    for i, v in enumerate(ss):
        xs = np.linspace(min(v), max(v), 200)
        k = sns.kdeplot(v, ax=a, lw=1).get_lines()[-1].get_data()
        a.fill_between(k[0], i * 0.6, k[1] * 3 + i * 0.6, alpha=0.6)


def r_forest(a, s):
    qs = s.get("quartiles", [])
    if qs:
        for i, q in enumerate(qs):
            a.hlines(i, q["min"], q["max"], lw=1)
            a.plot([q["median"]], [i], "s", ms=4)
        a.axvline(0, ls="--", lw=1)
        a.invert_yaxis()
        return
    v = vals(s)
    for i, x in enumerate(v):
        a.plot([x], [i], "s", ms=4)
    a.invert_yaxis()


def r_dumbbell(a, s):
    ss = series(s)
    if len(ss) < 2:
        return r_dotplot(a, s)
    for i, (x, y) in enumerate(zip(ss[0], ss[1])):
        a.hlines(i, x, y, lw=1); a.plot([x, y], [i, i], "o", ms=3)
    a.invert_yaxis()


def r_matrix(a, s): a.imshow(grid(s), aspect="auto", interpolation="nearest")


def r_pie(a, s):
    seg = s.get("segments")
    v = [x["value"] for x in seg] if seg else vals(s)
    a.pie(v, radius=1.0, wedgeprops={"linewidth": 0.5, "edgecolor": "w"})
    a.set_aspect("equal")


def r_radar(a, s):
    ss = series(s)
    n = len(ss[0]) if ss else 0
    if n == 0:
        return
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    for v in ss:
        c = np.array(list(v) + [v[0]]); t = np.append(th, th[0])
        a.plot(c * np.cos(t), c * np.sin(t), lw=1)
    a.set_aspect("equal")


def r_waffle(a, s):
    seg = s.get("segments")
    v = [x["value"] for x in seg] if seg else vals(s)
    tot = sum(v) or 1
    cells = [i for i, x in enumerate(v) for _ in range(round(x / tot * 100))][:100]
    m = np.zeros((10, 10))
    for i, c in enumerate(cells):
        m[9 - i // 10, i % 10] = c + 1
    a.imshow(m, aspect="equal", interpolation="nearest")


def r_horizon(a, s):
    v = vals(s); a.fill_between(range(len(v)), v, lw=0)


def stack_series(spec):
    """Every series as an equal-length list, which `stackplot` requires."""
    ss = [v for v in series(spec) if v]
    if not ss:
        return []
    n = min(len(v) for v in ss)
    return [v[:n] for v in ss]


def r_stackedarea(a, s):
    ss = stack_series(s)
    if ss:
        a.stackplot(range(len(ss[0])), *ss, lw=0)


def r_streamgraph(a, s):
    # **matplotlib's own name for the centred origin.** `baseline="wiggle"` is
    # the stream graph, and it being one argument away from `stackplot` is the
    # same statement the renderer makes: one fold, two origins.
    ss = stack_series(s)
    if ss:
        a.stackplot(range(len(ss[0])), *ss, baseline="wiggle", lw=0)


def r_slope(a, s):
    for v in series(s):
        if v:
            a.plot([0, 1], [v[0], v[-1]], "-", lw=1)


def r_bubble(a, s):
    ss = series(s)
    if len(ss) < 2:
        return
    xs, sizes = ss[0], ss[1]
    n = min(len(xs), len(sizes))
    a.scatter(range(n), xs[:n], s=[max(1.0, v) * 4 for v in sizes[:n]])


def r_autocorrelation(a, s):
    v = vals(s)
    a.stem(range(len(v)), v, basefmt=" ")


def r_timeline(a, s):
    for i, track in enumerate(series(s)):
        a.plot(track, [i] * len(track), "|", ms=8)
    a.invert_yaxis()


def r_bullet(a, s):
    qs = s.get("quartiles", [])
    v = vals(s)
    for i, q in enumerate(qs):
        a.barh(i, q["max"], color="0.9")
        a.barh(i, q["q3"], color="0.75")
        a.barh(i, q["q1"], color="0.6")
        if i < len(v):
            a.barh(i, v[i], height=0.3, color="0.1")
        if q.get("centre") is not None:
            a.vlines(q["centre"], i - 0.35, i + 0.35, lw=2)
    a.invert_yaxis()


RENDERERS = {
    "line": r_line, "sparkline": r_line, "scatter": r_scatter, "step": r_step,
    "ecdf": r_ecdf, "density": r_density,
    "streamgraph": r_streamgraph, "stackedarea": r_stackedarea,
    "bar": r_bar, "histogram": r_hist, "lollipop": r_lollipop,
    "dotplot": r_dotplot, "funnel": r_funnel, "gantt": r_gantt,
    "waterfall": r_waterfall,
    "boxplot": r_boxplot, "violin": r_violin, "ridgeline": r_ridgeline,
    "forest": r_forest, "dumbbell": r_dumbbell,
    "heatmap": r_matrix, "calendar": r_matrix, "correlation": r_matrix,
    "confusion": r_matrix, "spectrogram": r_matrix, "latency": r_matrix,
    "density2d": r_matrix, "utilisation": r_matrix,
    "slope": r_slope, "bubble": r_bubble, "autocorrelation": r_autocorrelation,
    "timeline": r_timeline, "bullet": r_bullet,
    "pie": r_pie, "radar": r_radar, "waffle": r_waffle, "horizon": r_horizon,
}

# Stated, not silently dropped. A form absent from a comparison reads as one
# that passed it.
SKIPPED = {
    "smallmultiples": "a composition of other forms; matplotlib's subplot grid "
                      "shares no geometry with ours to diff",
    "pairplot": "same — seaborn's PairGrid is furniture-dominated at this size",
    # The containment family. matplotlib has no primitive for any of the three:
    # a treemap needs `squarify`, a flame graph needs `flameprof` or d3, and
    # neither is a dependency this comparison should acquire to render a figure
    # whose layout we would then be checking against our own implementation of
    # the same published algorithm. **The reference for these is the algorithm**
    # — Bruls/Huizing/van Wijk for the treemap, and containment itself for the
    # other two — and T1.64–T1.68 assert it directly rather than by diffing a
    # picture.
    "treemap": "no matplotlib primitive; the reference is the squarify algorithm "
               "and T1.66 asserts it directly",
    "flame": "no matplotlib primitive; containment is asserted structurally in T1.64",
    "icicle": "same as flame, inverted",
}


def capture(fn, spec, rows):
    fig, ax = figure(rows)
    try:
        fn(ax, spec)
    except Exception as e:  # a fixture the reference cannot express
        plt.close(fig)
        return None, f"{type(e).__name__}: {e}"
    fig.canvas.draw()
    text = to_braille(fig, rows)
    plt.close(fig)
    if text.strip() == "":
        return None, "rendered blank — nothing crossed the ink threshold"
    return text, None


def main():
    ok = fail = 0
    for form, variants in F.items():
        name, spec = next(iter(variants.items()))
        if form in SKIPPED:
            print(f"  skip {form}: {SKIPPED[form]}")
            continue
        rows = GRID.get(form)
        if rows is None:
            continue                      # excluded on our side, with a reason
        fn = RENDERERS.get(form)
        if fn is None:
            print(f"  MISS {form}: no reference renderer")
            fail += 1
            continue
        text, err = capture(fn, spec, rows)
        if text is None:
            print(f"  FAIL {form}/{name}: {err}")
            fail += 1
            continue
        with open(f"{OUT}/{form}.txt", "w") as fh:
            fh.write(text)
        ok += 1
    print(f"reference: {ok} rendered, {fail} failed, {len(SKIPPED)} skipped")
    return 1 if fail else 0


sys.exit(main())
