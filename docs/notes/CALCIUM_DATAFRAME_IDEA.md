# Tabular data — a previewer, and the plot system as its second half

**Not scheduled. A note**, because the idea composes two things that already exist and the
composition is the interesting part.

**The reference is Data Wrangler**, and what makes it good is not the table — it is the
**column summary above every column**, which turns *look at rows* into *understand the
shape*.

---

## What it is

```
run-metrics.parquet · 48,291 rows · 12 columns · 3.2 MB

  epoch          lr             loss          split       converged
  ▁▂▃▄▅▆▇█       ⣿⣶⣤⣄⡀         ▇▆▅▄▃▂▁▁      ▓▓▓░        ██▁
  int32          float32        float32       category    bool
  0 – 199        1e-5 – 1e-2    0.02 – 4.81   3 unique    72% true
  0 null         0 null         12 null       0 null      0 null
 ─────────────────────────────────────────────────────────────────
  0              0.001          4.81          train       false
  1              0.001          3.92          train       false
  2              0.001          3.14          train       false
  …
```

**The header is the feature.** Every column carries a **distribution sparkline**, its dtype,
its range or cardinality, and its null count — **so you learn the shape of the data without
reading a single row.**

**And the sparkline is per-dtype**, which is where the plot system does the work:

```
numeric        a histogram sparkline — the distribution
categorical    a stacked bar — the class balance, and IMBALANCE IS VISIBLE INSTANTLY
boolean        a two-segment bar — the true/false split
datetime       a density over time — gaps and clustering
string         cardinality, and a bar for the top-k
null-heavy     the null fraction as its own mark, because 40% null is the
               most important fact about a column and a summary that buries it is useless
```

---

## Why it fits here specifically

**The table block exists** — C11, with virtualisation, per-cell styling, `Cell.spark` and
`Cell.bar` already shipping.

**The plot system exists** — 35 forms, and the column summaries are `sparkline`, `histogram`,
`bar` and `density` at cell scale, which is exactly what `Cell.spark` was built for.

**The scroll container exists** — 48,000 rows in a bounded region with the residue marker
saying how many are hidden.

**So the previewer is composition rather than a new component**, and the genuinely new parts
are the **file reader** and the **column profiler**.

---

## The combination that makes it more than a viewer

**A column header is a control.** Click it — or focus it and press a key — and the plot system
opens the full version of what the sparkline was hinting at.

```
click a numeric column's sparkline    → a full histogram, with binning controls
click a categorical column            → a bar chart of the class balance
select two numeric columns            → a scatter, or a 2D density if n is large
select all numeric columns            → a PAIR PLOT, which already ships
click a datetime column               → the density over time, full width
```

**And with the widget system, the controls come with it** — bin count, log scale, which
series, filtering by a category. **A previewer where every column opens into an interactive
plot is a data-exploration tool**, and every piece of it is built.

**Filtering closes the loop.** Set a filter on one column and every other column's summary
recomputes — **which is what makes Data Wrangler feel like a tool rather than a table**, and
it is a widget binding plus a recompute.

---

## The parts that do not exist

```
a file reader          parquet · arrow · csv · jsonl. Parquet is the one that matters
                       for ML and it is a real format with a real spec
a column profiler      dtype inference, min/max, cardinality, null count, a histogram —
                       one pass, and it must be STREAMING or a 3GB file loads into memory
lazy row access        48,000 rows must not be 48,000 objects. Read the page you are
                       showing
the filter model       a predicate per column, composed — and the recompute it triggers
```

**The profiler is the interesting one.** It has to be **one streaming pass** producing every
summary at once — and the histogram needs either a reservoir sample or a two-pass approach,
because you cannot bin without knowing the range.

**Reservoir sampling is probably right**: profile 10,000 sampled rows, say so in the header,
and offer an exact pass on request. **A summary that says *sampled* is honest; one that
silently samples is not.**

---

## Where it runs, and it is Prism's question

**A parquet file on the platform is not a file on your laptop.** So either:

```
LOCAL      the CLI reads the file. Works for a downloaded artefact, and not for
           a 200GB training set in object storage
REMOTE     a verb — /preview s3://bucket/run-metrics.parquet — and the platform
           profiles it and returns BLOCKS. The summary is computed where the data is
```

**Remote is right for Prism and it is free**, because the far side already returns blocks and
the profiler runs where the data lives. **The TUI renders a summary; it never reads a
parquet file.**

**Which also means the local case is a different consumer** — a general-purpose Calcium data
viewer that reads files directly — and it is a fine thing to want and a separate one.

---

## What it competes with, honestly

```
pandas .describe()      a wall of numbers, no shapes
DuckDB CLI              excellent SQL, a plain table for output
Data Wrangler           the reference, and it needs VS Code
visidata                the closest existing TUI, and it is genuinely good
```

**`visidata` is the one to measure against rather than dismiss.** It is mature, keyboard-first
and already does column summaries. **What this would add is the plot system** — a sparkline
per column, a full chart on demand, and the widget bindings — which visidata does not have
because it has no plot layer.

**So the honest positioning: visidata with charts, inside a transcript, next to the agent
that is explaining the data.** That last part is the differentiator and it is the one nothing
else has.

---

## Order, if it is ever picked up

```
1  the column profiler and its summary block — against an in-memory array first,
   no file reading at all. Proves the SUMMARY is worth having
2  the sparkline-per-dtype table header — C11 plus Cell.spark, mostly composition
3  a reader: csv and jsonl first, because they are trivial and prove the shape
4  parquet — the one that matters, and the one with a real spec to implement
5  column → full plot, which is the widget system's binding
6  filtering, and the recompute it triggers across every other column
```

**Step 1 is the test of the whole idea.** A summary block over an array of objects, rendered
with per-column sparklines — **if that is not immediately useful, nothing downstream will be.**
