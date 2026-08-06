# `/drift` and `/compare` — the walk

Walked by hand against a real pair before any of it was written: `dtui-web`, an
`nginx:alpine` container run with `-p 8080:80 -e LOG_LEVEL=info -v /tmp:/data`.

`/drift` is **structure far more than state** — a field map, two sources, four field kinds —
so the classification table carries most of it. But the fifth recorded blind spot is a
sequence question and it is live here, so both artefacts, as always.

Every row is a cell where **two rules overlap**. A row governed by one rule restates it.

---

## §1 The rules in play

| | rule | source |
|---|---|---|
| R1 | A container's `Config` is the image's inherited, then filled with runtime fields | measured, both pairs |
| R2 | `Comparison`'s verdict union is `same \| better \| worse \| changed` | `viewmodel/types.ts:315` |
| R3 | A comparison row is `{ field, a, b, comparison? }` — three flat strings | same |
| R4 | A keyed field yields one row per differing key, plus one `N identical` row | S02, ruled |
| R5 | Port drift lives in `HostConfig`, not `Config` | measured |
| R6 | A local handler makes its own calls; an adapter is handed one result | C23 §2 |
| R7 | `renderError`-shaped replacement takes the whole block with it | S3_WALK §5 |
| R8 | Absent and empty are different, and both are different from a value | C23, and this walk |

---

## §2 The sequence trace

### A1 · the image lookup fails after the container lookup succeeded — R6 × R7

`/drift` makes two calls and the second depends on the first. If `docker image inspect`
fails — the image force-removed, or the container built from an id no longer resolvable —
the container's own facts are **still perfectly good**.

**Ruled: the block renders with the image column absent and a notice above it, never an
error instead of the block.** This is S3's `renderError` lesson pointed at a two-source
block: the thing that reports the absence must not replace the thing that would have
explained it. Every row's `a` becomes `—`, every verdict `changed`, and a reader still sees
what the container is — which is half of what they asked for and all of what is knowable.

### A2 · the container stops between the two calls — R6

`docker inspect` still answers for a stopped container, so the pair is intact and `/drift`
is unaffected. **Checked, and it is the reason `/drift` reads `inspect` rather than `stats`
for everything except S6's two live rows.** Recorded because the S3 walk's equivalent row
(A8) was a real hazard and this one is not — the difference is that `inspect` describes
configuration and `stats` describes a running process.

### A3 · `/compare` where one container exists and the other does not — R6 × R7

The same shape as A1 with the columns swapped, and the ruling has to be the same or the two
verbs disagree about what a missing side means. One notice, one column of `—`.

---

## §3 The classification table

### B1 · two representations of nothing — R8

**Found by measuring, not by reasoning.** On the nginx pair:

```
User    image = absent (no key)      container = ""
```

**And the first write-up of this row said `image = null`, which is the row's own
mistake made while recording it.** `dict.get("User")` returns `None` for a key that is
absent and for a key that is `null`, so the evidence was read through an accessor that
collapses exactly the distinction being documented. Corrected from the key set rather
than from a lookup. Three representations of nothing, not two.

Both mean *no user set*. A comparison that comes from `JSON.stringify` or `!==` marks the
row `changed`, and the surface reports drift on a container that has drifted in no way.

**Ruled: each field normalises before comparing, and the normaliser is part of the map.**
`null`, `undefined` and `""` collapse to absent for a scalar; `null` and `[]` collapse for a
list; `null` and `{}` for a keyed field. The rendered cell then shows `—` on both sides and
the verdict is `same`.

**The trap is that this row is invisible on a well-chosen fixture.** Both sides being
non-empty is the case everyone tests. It took a real image whose `User` is unset — which is
most images.

### B2 · a key present on one side only — R2 × R3

`Comparison` has no `added` or `removed`. So absence is expressed in the **data**: the row
renders `changed` with the absent side as `—`.

**Checked against the alternative and rejected:** encoding it in the `field` label
(`env LOG_LEVEL (added)`) puts a verdict in a column that is supposed to name the field, and
it sorts and truncates as part of the name. The em dash is already how every other block in
this app says *nothing here*.

> **Superseded — the first sentence was the premise, and it expired.** C04 I35/I36 split
> `Comparison`'s union into a change axis and a judgement axis, and `added`/`removed` are
> members of the neutral half (FINDINGS F30, closed). This walk is one of the four surfaces
> that produced that ruling, so it is the first to collect on it: a one-sided key now renders
> `added` or `removed`, marked `+` or `-` in the block's own column.
>
> **The second half of the ruling stands unchanged and is why the remedy is a marker rather
> than a label.** No verdict rides in a `field` label; the test still asserts it over every
> row. The em dash also stays — absence is still in the data, and the marker now says which
> side is absent instead of leaving the reader to infer it from which cell is empty.
>
> **`env LOG_LEVEL` moves with it**: the container sets it and the image does not, which is
> an addition and was called a change because nothing else was available to call it.

### B3 · the ports row, and why no walk of `Config` reaches it — R5

```
image      Config.ExposedPorts     {"80/tcp": {}}
container  Config.ExposedPorts     {"80/tcp": {}}      ← inherited, identical
container  HostConfig.PortBindings {"80/tcp": [{"HostPort": "8080"}]}
```

The container inherits `ExposedPorts` unchanged, so a `Config`-only comparison reports **no
drift on the one row the drawing leads with**. The drift is a published binding, and it
lives in a different top-level object.

**Ruled: `ports` reads through a different path per side** — and the first version of this
ruling called that a fourth field *kind*, `derived`, which did not survive contact with the
code. Once every field reads through a per-side function the distinction costs nothing to
express, so `ports` is an ordinary keyed field whose two readers happen to disagree. The
walk was right that the row is different and wrong that the difference is a kind; a fourth
arm would have been carried in every `switch` for one field.

**And a second thing this row hides, found by writing the identical-container test.** A
declaration and a binding are *different vocabularies*: comparing `exposed` against
`→ 8080` means the row can never read `same`, so a container that has drifted in no way
still reports drift on its leading row — B4's hazard arriving through B3's fix. The
container's reader falls back to its own `ExposedPorts` when nothing is published, so an
exposed-but-unpublished port renders in the image's own words. Measured against an
undrifted `nginx:alpine` container: **7 rows, 0 changed.**

### B4 · a keyed field where both sides are large and nearly equal — R4

Measured: image `Env` has 7 variables, the container 8, and **exactly one differs**.

| what renders | rows |
|---|---|
| every key | 8 |
| differing keys only | 1 |
| differing keys plus the tally | 2 |

**The tally is load-bearing and not decoration.** Without it, a container identical to its
image renders as an *empty block* — indistinguishable from a drift that failed. Same class
as S3's *"no details — the container has gone"*, predicted here rather than found in a
frame, and frame-read 2 exists to check that the prediction holds in the picture.

### B5 · a field absent from both sides — R8

`StopSignal` on a base image is on neither side. **Ruled: the row is omitted entirely, not
rendered as `— — same`.** A map is a list of fields worth asking about, and a field neither
side has is a question with no subject; rendering it is padding that reads as coverage.

**And the tally must not count it.** `7 identical` has to mean seven things that agree, or
the one number the empty-drift frame depends on is inflated by fields nobody has.

### B6 · the twelve daemon-filled keys — R1

`Hostname`, `Domainname`, `AttachStdin/out/err`, `Image`, `StopTimeout`, `Tty`, `OpenStdin`,
`StdinOnce`, `Volumes`, `User` — present on every container, absent from every image, on
both pairs measured.

**They are not in the map.** Not because they are always different, but because they are not
*drift*: they are what running a container means. A surface that reported them would be
correct on every row and useful on none.

---

## §4 What this walk settled before any code

1. **Each field normalises before comparing** (B1) — `null` and `""` both mean absent, and a
   real image made the row appear immediately.
2. **`ports` reads a different path per side** (B3) — and that is *not* a fourth field kind,
   which is what the walk first called it and what the code declined.
6. **A declaration and a binding must be spoken in one vocabulary** (B3), or the leading row
   reports drift on every container that has none.
7. **B1's own evidence was misread while being recorded** — `dict.get()` collapses absent and
   `null`, which is the distinction the row exists to document. Three representations of
   nothing, not two.
3. **The tally excludes fields neither side has** (B5), or the number the empty-drift frame
   rests on is wrong.
4. **A failed image lookup keeps the block** (A1), because the container's facts survive it.
5. **The daemon-filled twelve are out of the map by category**, not by exception (B6).
