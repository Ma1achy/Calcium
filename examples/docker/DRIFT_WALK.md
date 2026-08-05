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
User    image = null      container = ""
```

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

### B3 · the ports row, and why no walk of `Config` reaches it — R5

```
image      Config.ExposedPorts     {"80/tcp": {}}
container  Config.ExposedPorts     {"80/tcp": {}}      ← inherited, identical
container  HostConfig.PortBindings {"80/tcp": [{"HostPort": "8080"}]}
```

The container inherits `ExposedPorts` unchanged, so a `Config`-only comparison reports **no
drift on the one row the drawing leads with**. The drift is a published binding, and it
lives in a different top-level object.

**Ruled: `ports` is a `derived` field** — the two sides come from different paths and each
is formatted by its own reader. That is the field kind the drawing was always implying and
never named, and it exists because of this row.

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
2. **`ports` is a distinct field kind**, not a scalar with a clever path (B3).
3. **The tally excludes fields neither side has** (B5), or the number the empty-drift frame
   rests on is wrong.
4. **A failed image lookup keeps the block** (A1), because the container's facts survive it.
5. **The daemon-filled twelve are out of the map by category**, not by exception (B6).
