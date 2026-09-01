# ML blocks — beyond plots and tensors

**Not scheduled. A note for entry 3's ML package**, alongside the tensor half. Every item
here is either a composition of what exists or one mechanism away from it, and the note says
which.

---

## 1 · Token-level visualisation — the one that needs a NEW mechanism

**Nothing in the block vocabulary carries a per-token channel over flowing text.**

```
The   cat   sat   on   the   mat   .
 ▁     ▃     ▂     ▁    ▂     █    ▁      per-token probability
```

**The unit is a token in wrapped prose**, not a row and not a cell — so `table` cannot hold
it, `raw` has no per-span channel, and the plot forms are all axis-based.

**What it would need:**

```
a text block with a per-token VALUE      the value drives colour, or a mark beneath
tokens that survive wrapping             a token near a line end wraps as a unit
selection by token                       ⇧← ⇧→ extends by token, not by grapheme
```

**And it is the same mechanism spans need** — entry 50's inline emphasis wants a
`{text, style}[]` and this wants a `{text, value}[]`. **One change to the view model serves
both**, which is worth knowing before either is designed.

**Consumers, and they are all real:**

```
logprobs per token          confidence, and where the model hedged
per-token loss              which tokens the model got wrong during training
attention FROM a token      select a token, the others colour by attention weight —
                            and that is the interactive version, needing the widget system
tokenizer boundaries        how a string actually splits, with byte marks. The thing
                            everyone gets wrong about their own data
```

**The attention case is the strongest**: click a token, every other token colours by how much
this one attended to it. **That is a heatmap unrolled into prose**, and it reads far better
than the square matrix for a single query.

---

## 2 · Diff as a first-class object

**A patch viewer exists for code (C25). The same shape serves three ML cases and there is no
block for any of them.**

```
config diff        two YAMLs, two argparse namespaces, two hydra configs
run diff           hyperparameters, environment, git SHA, dataset version
output diff        two models' generations on the same prompt — token-level, so it
                   composes with §1
```

**`what changed between the promoted model and this candidate` was one of the agent-analyst's
own examples**, and it currently has no answer.

**The mechanism mostly exists** — C25 renders hunks with add/remove/context. **What is missing
is a structured diff rather than a textual one**: two objects, not two files, so the output is
*field · before · after* rather than line-oriented hunks.

```
lr             0.001      →  0.0003
batch_size     32         →  64
warmup         500        →  500        (unchanged, foldable)
augment        false      →  true
```

**And the fold matters.** Two configs share ninety fields and differ in four; **a diff that
shows all ninety is a diff nobody reads.** The unchanged ones collapse behind a count, which
is I8's *the ones that fit plus a count of the rest*, already ruled.

---

## 3 · Progress with throughput and ETA

**`progress` is completion-only** — a fraction of a bar. **A training run needs the other two
numbers and they are what a reader actually watches.**

```
epoch 12/100  ▓▓▓▓▓▓░░░░░░░░░░░░░░  12%   4.2 it/s   ETA 2h 14m
```

```
throughput    it/s, samples/s, tokens/s — and a SPARKLINE of it, because a
              throughput that is degrading is the first sign of a problem
ETA           derived, and it must say when it is unreliable — an ETA computed
              from 3 samples is a guess and should look like one
elapsed       plain, and it is the number people screenshot
```

**Not a new block — a widening of `progress`**, and the throughput sparkline is `Cell.spark`
in a field. **The ETA's honesty rule is the design question**: a confidence band on an ETA is
better than a number that lurches.

---

## 4 · The compositions — each is existing parts

### A metrics table with per-cell trends

```
run        final loss   best acc   epochs   loss trend
run-a      0.041        94.2%      100      ▇▆▅▄▃▂▁▁
run-b      0.038        94.8%      100      ▇▆▄▃▂▁▁▁
run-c      0.067        91.1%       43      ▇▆▅▅▆▇█▇     ← diverged, and it is VISIBLE
```

**C11 plus `Cell.spark`, both shipping.** The trend column is what turns a comparison table
into a diagnosis — **run-c's shape says *diverged* faster than its number says *worse*.**

### Gradient and weight distributions

**A ridgeline over layers, or a histogram per layer.** Vanishing and exploding gradients are
both *shape* facts — a distribution collapsing toward zero, or one with fat tails — and the
ridgeline form already stacks them.

**Both forms exist.** The work is the data path, not the renderer.

### Learning-rate schedule preview

**A line plot of a schedule before the run starts.** Warmup, cosine decay, restarts — **and
the number of people who have launched a 12-hour run with a broken schedule is everyone.**

`line`, and it costs a verb.

### Resource utilisation over time

**GPU memory, utilisation, throughput per device.** This is `sys-tui`'s design pointed at a
job rather than a host — **the monitor example already covers the shape**, and the heatmap's
container ring is the multi-device version.

---

## 5 · The two nobody builds, and both are asked for constantly

### Experiment lineage

**A DAG: this model came from that checkpoint, from that dataset version, from that config.**

**It is graph layout, so it is the Mermaid question** — and unlike Sankey, a lineage graph is
usually a *tree* or close to one, which is the tractable case. **Worth measuring whether
`beautiful-mermaid` can be handed a generated graph** rather than authored source, because
that would make this free.

**And it is the thing nobody can answer at 3am** — *which dataset produced the checkpoint
this model was fine-tuned from* — which is why it is worth more than its complexity suggests.

### Cost

**GPU-hours and money, per run, per sweep, per person, over time.**

**Trivially a bar chart and a line, and nobody builds it.** It is the number management asks
about, the number that kills projects, and the one metric an ML platform has all the data for
and never surfaces.

---

## 6 · Where these sit

**All of §4 is composition** — existing forms, existing blocks, a data path. **They belong
with entry 3's ML package and cost a verb each.**

**§1 needs the span mechanism**, which entry 50 also needs. **One view-model change serves
both** and that is the thing to notice before either is scheduled.

**§2 needs a structured diff block**, which is C25's shape with objects instead of files.

**§3 is a widening of `progress`.**

**§5's lineage is blocked on graph layout**, and cost is blocked on nothing at all — **which
makes it the cheapest useful thing on this entire list.**
