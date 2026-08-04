# The `/ps` adapter — the walk, before the parse

Written before a line of parse code, against **captured output** (`test/corpus/ps-real.ndjson`,
seven containers from a real daemon) rather than against S2's drawing. F4 is why: the
drawing showed `80→8080` and an eighteen-wide `IMAGE`, docker sends
`0.0.0.0:8080->80/tcp, [::]:8080->80/tcp` and image names of 85 characters, and a ruling
reasoned from the drawing came out backwards.

**A classification table, not a sequence trace.** An adapter has structure and no events:
one `RawResult` in, one `ViewDocument` out, nothing in between. Its rule interactions are
two rules that both hold *at rest* — the shape C18 §8a has, and the shape C19 needed and
did not have, which is how its `--flag=value` defect survived a trace indexed by events.

Every row is a cell where **two correct statements overlap**. A row governed by one rule
is a restatement of that rule and finds nothing.

Measured from the corpus:

| field | min | max | longest |
|---|---|---|---|
| `Names` | 10 | 22 | `reverent_proskuriakova` |
| `Image` | 12 | **85** | `vsc-tui-kit-07d4a92ac4a68f…-features` |
| `State` | 6 | 7 | `running` |
| `Status` | 10 | 22 | `Exited (0) 5 weeks ago` |
| `Ports` | 0 | 39 | `0.0.0.0:8080->80/tcp, [::]:8080->80/tcp` |

---

## A. The transport boundary

**A1. NDJSON meets a non-streaming `invoke`.**
`ps` is not `streams: true`, so C06 runs `invoke` and calls `JSON.parse` on the whole of
stdout. Seven concatenated objects are not a JSON document, so `stdout` is `undefined` and
`parseError` is set — while `stdoutRaw` is retained either way (C06 I6), explicitly so C07
can still work.
**Ruling:** the adapter reads `stdoutRaw`, splits on newlines, parses each line. It must
**not** treat `parseError` as a failure: for this far side a parse error on the whole is
the normal case, and the document is `ok`. To be confirmed against the real result rather
than assumed — A1 is the row most likely to be wrong about a mechanism.

**A2. One malformed line meets six good ones.**
R01 R3.5 wants the bad line to degrade and the rest to render. A single `JSON.parse` over
the batch cannot: one bad byte discards six containers.
**Ruling:** parse per line, `try`/`catch` per line. A line that fails becomes a counted
skip, surfaced in the summary; it does not throw and does not silently vanish. *Silently*
is the trap — a skipped line and no line are indistinguishable in the frame otherwise.

**A3. `exitCode ≠ 0` meets parseable output.**
Docker writes usage text to stderr and exits non-zero for an unknown flag, and stdout is
empty.
**Ruling:** the document is an `error` document carrying stderr; no empty table. R3.6's
"names the binary, not a stack trace" is the same row for a missing binary.

---

## B. The columns — where two layout rules meet

**B1. `STATUS` never truncates meets `STATUS` never drops.**
These are in tension and the spec states both. Never-truncating means `minWidth` ≥ 22, the
real maximum; a larger `minWidth` makes the column *more* likely to be refused admission.
So the two claims trade against each other and the width decides which gives.

**And Calcium has no "never drops".** `planColumns` admits by priority until the next
column will not fit, then stops (`src/presentation/table/plan.ts:126`); only the single
highest-priority column is forced, and that is the degenerate `overflowed` path. "Never
drops" is not a property the engine offers — it is an *outcome* of priority plus
arithmetic.
**Ruling:** state it as arithmetic, not as a guarantee. `NAME` 95, `STATUS` 85, `IMAGE` 60,
`PORTS` 40, with `minWidth` 16 / 22 / 20 / 20. At 120 all four fit; at 80, `PORTS` is
refused and the rest fit. Below roughly 66 the claim fails, and that is a fact about the
terminal, not a defect. **Recorded in FINDINGS as an open question rather than absorbed
silently** — a spec sentence the framework cannot express is exactly the kind of thing this
app exists to find.

**B2. `Ports` long meets `truncate`.**
Ruled in S2 and R01 R3.4, at the second attempt: **from the end**, keeping
`0.0.0.0:8080…`. The host port is on the left in the string docker sends. See F4.

**B3. `Image` at 85 meets a 20-wide column — and *both* ends carry identity.**
`ghcr.io/org/app:v4` identifies by its tail (`app:v4`); the registry prefix repeats down
every row. `vsc-tui-kit-07d4a92…-features` identifies by its head, and its tail is a build
hash plus a constant suffix.
**Ruling: `truncate: "start"`, keeping the tail.** An image reference is hierarchical with
the leaf last, which is precisely the case C04 I30 names for `"start"` ("a path's
filename, a hierarchical key's leaf"). **Its blind spot, stated:** a flat generated name
degrades to `…f94199f1-features`, and a screen of devcontainers all show the same suffix.
That is the wrong answer for that corpus and the right one for image references generally,
and an unrecorded limit reads as strength.

**B4. `Ports: ""` meets the `PORTS` column's admission.**
Two different mechanisms could produce an absent-looking column: an empty *cell*, and a
*dropped* column. They must not be confused — dropping is about the terminal's width and
tells the reader nothing about the container.
**Ruling:** `—` in the cell (R1.4), tone `muted`. Emptiness never influences admission;
`planColumns` reads `minWidth`, not content.

**B5. Docker's own `…` meets `truncate` — F3, and the row to assert hardest.**
`"Mounts": "/host_mnt/User…"` arrives already shortened, and `cells()` measures U+2026 as
**one** cell. A column narrower than the arrived value truncates it a second time and the
result carries two ellipses for one value.
**Ruling:** nothing is done to the value — but the *test* is the point. A field docker has
already elided, rendered into a column narrower than it, must show **one** ellipsis and the
correct display width. This is the class where a value belongs to the far side and the code
assumes it owns it, and no fixture the framework's author wrote could contain it. `ps` does
not emit `Mounts`, so the assertion is written against a synthetic row carrying a
docker-shaped pre-elided value, which is honest about being synthetic and still exercises
`cells()` against the real hazard.

---

## C. The cells — where a value's two readings meet

**C1. `State` meets `Status`, and they can disagree.**
`Status` is prose and `State` is machine-readable. A restarting container reads
`{"State":"restarting","Status":"Up 2 minutes"}` — the prose says up.
**Ruling:** the glyph and the tone come from `State`, always; `Status` supplies text and is
never read for meaning. R01 commitment 4, R5.1. This is the row where using the wrong field
produces a table that looks right.

`running` ● ok · `restarting` ▲ warn · `paused` ▪ warn · `exited` ✗ error · `created` ○ muted
· anything else ○ muted, because docker may add a state and an unknown one must not throw.

**C2. The glyph's home: S2 puts it in `STATUS`, R01 §5 gives it a column.**
Both are consistent with "the glyph comes from `State`" and they are different tables.
**Ruling:** S2's. `Cell` carries `glyph` and `tone` beside `text` (C04), so one cell says
`{ text: "Up 6 days", glyph: "ok", tone: "ok" }` — the glyph is derived from `State` while
the text is `Status` verbatim, and no separate column is needed. R01 §5's `expand · glyph`
column belongs with row expansion, which step 1 does not have.

**C3. `Names` comma-joined meets a single-value column.**
Docker joins aliases with commas. The corpus has none, which is exactly why the row is
here: the case that never appears locally is the one that ships broken.
**Ruling:** first name in the cell; the whole list in the row's `detail`. R1.3.

**C4. `Platform` (an object) meets "coerce every value explicitly".**
R01 §4 said everything is a string and docker 29 disagrees.
**Ruling:** step 1 reads no field that is not a string, so nothing coerces `Platform` —
but the *reader* must be written so an unexpected shape yields a missing value rather than
`[object Object]` or a throw. A field read is `typeof v === "string" ? v : ""`, at the
boundary, once.

**C5. Zero containers meets a table with columns.**
**Ruling:** `emptyMessage` naming the flag that would widen the result —
`no containers running · try /ps --all` (R1.6). The table still renders its header: the
columns are what the reader learns from, and an empty frame teaches nothing.

---

## What this table does not cover, and why

The rejection paths. Both artefact shapes index the **accepted** paths, and a decision
that throws leaves state behind — C13's `settle(id, doc)` is the measured case. Here the
adapter constructs and returns; it mutates nothing and holds nothing across calls, so
there is no half-applied state for a throw to abandon. Stated rather than assumed, because
"there was nothing to leave behind" is a finding about this component and not a general
licence.
