# `/config <c> <path>` — the walk

Walked by hand against a real pair before any of it was written: `dtui-cfg`, an
`nginx:alpine` container with a 16-line `default.conf` bind-mounted over the 44-line one the
image ships. Every cost here is measured.

`/config` is **two calls and a diff**, so the sequence trace carries most of it — but the
structural half is where the verb's shape was decided, because three of the drawing's
premises are structural and two of them failed.

Every row is a cell where **two rules overlap**.

---

## §1 The rules in play

| | rule | source |
|---|---|---|
| R1 | The running side is `docker exec <c> cat <path>` | S8, and it works |
| R2 | The image side needs a throwaway container — `docker run --rm <img> cat <path>` | measured: **442ms** |
| R3 | `.Mounts` gives `Type: "bind"` for a file and for a directory, with **no distinguishing field** | measured, both fixtures |
| R4 | A `renderError`-shaped replacement takes the whole block with it | S3_WALK §5, DRIFT_WALK A1 |
| R5 | `status: "error"` requires `error` | C04 I3 |
| R6 | A `Patch` is hunks of `add`/`remove`/`context` lines | `types.ts:319` |
| R7 | A local handler makes its own calls; an adapter is handed one result | C23 §2 |
| R8 | A dependency needs a row in `DEPENDENCIES.md` | A04 §3 |

---

## §2 The classification table — what the verb is

### B1 · which file, and why discovery is not rulable in — R3

S8 writes `/config api-gateway` with no path, which implies the verb finds the file. **It
cannot, from what `inspect` returns.** Measured on both fixtures:

```
dtui-cfg                bind  …/default.conf      → /etc/nginx/conf.d/default.conf   (a file)
reverent_proskuriakova  bind  /Users/malachy/…    → /workspaces/tui-kit              (a directory)
```

Identical shapes. Distinguishing them costs a `docker exec test -f` per mount, and even then
a bind-mounted file is not necessarily a *config* file — a mounted socket or certificate
would answer `test -f` just as well.

**Ruled: `/config <c> <path>` takes the path.** Given the bare form, the verb lists the bind
destinations from the inspect it has already made, as **candidates rather than a guess** —
which costs nothing, tells the reader exactly what the verb could not decide, and is the
same shape as a completion menu: offer the set, do not pick from it.

### B2 · the pair does not exist by default — R1 × R2

`nginx:alpine` ships a 44-line `default.conf` and a plain container has it **byte-identical**.
The drawing assumes a container whose config differs from its image's and never says how one
comes to exist.

**Ruled: the fixture is part of the surface.** `dtui-cfg` bind-mounts a 16-line replacement,
which produces a real 44→16 diff with genuine hunks — and recorded here rather than in a
script comment, because a demo whose data is manufactured off-camera is a drawing again.

### B3 · identical files — R6 × B2

The reader asks for a diff and there is none. **Ruled: the block still renders, with the
path, the language and zero hunks, plus a line saying the files agree.**

This is `/drift`'s B4 arriving a second time in one app: **an empty block is
indistinguishable from a call that failed**, and it was found there by prediction and here
by having been burnt. That it recurs across two unrelated verbs is the argument for treating
it as a class — *any block computed from two sources needs a rendering for "they agree"* —
rather than as a fact about comparisons.

### B4 · the diff itself — R8

Nothing in the tree computes a unified diff, and `Patch` wants `add`/`remove`/`context`
lines with old and new numbers. A diff library is a dependency, and a dependency is a row in
`DEPENDENCIES.md` with all five justification parts.

**Ruled: the app computes it.** These are config files — tens of lines, not thousands — so a
plain LCS is a few dozen lines and exact. A dependency for that would be justified by
convenience, which is not one of the five parts. Recorded so the next reader knows it was
weighed rather than overlooked.

### B5 · `collapsedAfter` and `actions` are not on the builder — R6

`Patch` carries `collapsedAfter` (unchanged lines elided below the last hunk) and `actions`.
`b.patch` passes `path`, `language`, `hunks` and `layout`, and **neither of the other two**.

It matters here rather than abstractly: a 44-line file with one hunk near the top elides
about thirty lines below it, and without `collapsedAfter` the reader is shown a patch that
simply stops with no statement that anything followed. `Hunk.collapsedBefore` *is* reachable,
so the patch can say what it skipped above and not what it skipped below.

**This is F27's shape exactly** — a complete mechanism on one side, unreachable from the
builder — and it is the third instance. Filed with a consumer behind it; whether it lands in
this step is a scoping call, not a design one.

---

## §3 The sequence trace

### A1 · the image side fails after the running side succeeded — R2 × R4 × R7

The image was pulled since the container started, or the daemon cannot reach the registry,
or the `run --rm` is refused. **The running file is still perfectly good** — and it is the
half the reader is more likely to have wanted.

**Ruled: the same as `/drift`'s A1 — the block renders and a notice sits beside it, never
instead of it.** With no image side there are no hunks to compute, so what renders is the
running file as all-context lines: the file, unannotated, with a notice saying the image's
copy could not be fetched.

**The two verbs must agree and this is why the row is here.** `/drift` ruled it for a
comparison block and `/config` renders a patch; if the answer differed, the app would mean
two things by *a missing side* and the reader would have to learn which verb they were in.
The fifth blind spot's whole point is that this ruling is invisible to both artefacts
afterwards — it is a fact about what a frame **contains**, and nothing renders it wrong, it
just renders less.

### A2 · the container stops between the two calls — R1 × R7

`docker exec` fails on a stopped container, unlike `docker inspect`, which answers for one.
So `/config` is exposed where `/drift` was not, and the ordering decides what the reader
gets: exec first, and a stopped container fails before the 442ms is spent.

**Ruled: the running side is fetched first, and its failure is the whole verb's failure** —
there is no useful patch of *the image's file against nothing*, since that is just the image
file, which the reader did not ask for. `status: "error"` with `error` set (R5), which is
the class `documents.test.ts` exists to close.

Note this is the **opposite** ruling to A1, on what looks like the same shape. The
asymmetry is the point: the running file is the subject and the image file is the baseline,
so losing the baseline degrades the answer and losing the subject removes it.

### A3 · the path does not exist — R1

`cat` exits non-zero with `No such file or directory`. **Ruled: an error document naming the
path and offering the mount candidates from B1** — the same list the bare form shows, for
the same reason, because a typo and a missing argument are the same reader in the same
moment.

### A4 · what the throwaway container leaves — R2

`--rm` removes it, but the walk asks what a ruling leaves behind rather than assuming.
Measured: `docker run --rm` leaves no container and no image change, and 442ms includes
create, start, read and remove. **Ruled: acceptable, and the cost is named in the surfaces
doc** so the next reader does not rediscover that this verb is an order of magnitude slower
than `/drift`.

---

## §4 What this walk settled before any code

1. **`/config <c> <path>` takes the path** (B1) — discovery is unrulable from `inspect`, and
   the bare form offers mount candidates instead of guessing.
2. **The image side costs 442ms and a throwaway container** (R2, A4) — affordable, and named
   rather than hidden.
3. **The fixture is part of the surface** (B2) — `nginx:alpine` has no drift by default.
4. **Files that agree still render a block** (B3) — `/drift`'s lesson, recurring across an
   unrelated verb, which makes it a class.
5. **A missing image side keeps the block; a missing running side is the verb's failure**
   (A1, A2) — the same shape ruled two ways, because subject and baseline are not
   interchangeable. A1 must match `/drift`'s A1 or the app means two things by absence.
6. **The app computes the diff** (B4) — a dependency for tens of lines fails the five parts.
7. **`b.patch` cannot reach `collapsedAfter`** (B5) — F27's third instance, with a consumer.
