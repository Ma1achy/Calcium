// The corpus's third axis — one entry per **design fixture** (M16).
//
// `ONE_PER_KIND` is one per kind and `STATES` is one per state; both are indexed
// by the repo's own vocabulary. This one is indexed by the **design's**, which is
// the only axis that can answer *does the repo draw what the design specifies*.
// A surface can be built, have a kind, have a state, and still not look like its
// fixture — and nothing indexed by kind or state can see that.
//
// **A probe cannot answer it either, which is why these exist.** `test/golden/
// DESIGN_FIXTURES.md` carries a `built` column and it is a presence check: it
// says a subject with that name is in the tree, not that the subject matches the
// design. `granularity` resolving somewhere does not make §035's three axes
// independent. The frame is what closes that gap, and raising `framed` is the
// whole of M16's remaining work.
//
// **An entry is a §, a reason and a function returning rows** — the shape
// `STATES` chose, for its reason: adding one is three lines and the frame comes
// free, so the cost of covering a surface never argues against covering it.
import { block } from "../../src/data/viewmodel/index.js";
import { measurable } from "./render.js";
import type { ResolvedTheme } from "../../src/presentation/theme/index.js";
import type { TerminalCapabilities } from "../../src/terminal/index.js";
import type { Block } from "../../src/data/viewmodel/types.js";

export type Surface = Readonly<{
  /** The fixture this is the target appearance for — `DESIGN_FIXTURES.md`'s key. */
  section: number;
  /** What the fixture specifies, in the design's own words where it has them. */
  name: string;
  rows: (width: number, caps: TerminalCapabilities, theme: ResolvedTheme) => readonly string[];
}>;

// **The theme and the capabilities go to `measurable`, not to `renderToLines`.**
// The first draft passed them as a third argument and handed it an *array* where
// it takes one block, so every surface fell through to the raw fallback and the
// snapshot recorded the JSON of the block rather than its rendering. Four frames
// passed, and not one of them drew anything — `render.ts` warns about exactly
// this shape: *an unregistered kind still renders, as `raw`, and still produces
// rows*, so counting lines cannot see it. Reading the frame can.
const draw =
  (b: Block) =>
  (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] =>
    measurable({ theme, capabilities }).renderToLines(b, width);

/** §095's tape: five members, the window on the third, details all-or-nothing. */
const TAPE = block({
  kind: "tape",
  id: "tape",
  members: [
    { id: "a", label: "scout", detail: "4s", state: "ok" as const },
    { id: "b", label: "planner", detail: "1m12s", state: "ok" as const },
    { id: "c", label: "builder", detail: "8s", state: "running" as const },
    { id: "d", label: "critic", detail: "2s", state: "queued" as const },
    { id: "e", label: "scribe", detail: "0s", state: "queued" as const },
  ],
  current: "c",
});

/** §033/§034: a bar per alphabet is `barStyleNames`'; this is the default's shape. */
const BAR = block({ kind: "progress", id: "bar", label: "download", current: 7, total: 10 });

/** §096: the three parts — message wraps, detail truncates with a residue. */
const STATUS = block({
  kind: "status",
  id: "status",
  state: "error" as const,
  message:
    "the manifest declares a tool the registry has no handler for, so it would classify as local and reach the pipeline with nothing to run",
  detail: "at seal(): `prune` is marked local in the manifest and has no handler",
  height: 8,
});

// **§069 is NOT here, and the first draft put it here.** Its subject is the
// *prompt's upper rule* — `──────… Calcium ─`, inline-end, carrying identity —
// which `paint.ts` draws from `frame.label`, and the application supplies that
// through `chrome.label?.(ctx)`. The `rule` **block kind** is a different
// surface that happens to share the word, and rendering it here produced a
// convincing frame of the wrong thing. §069 wants a variant of the *frame*
// corpus with a label set, which the session goldens do not have: every rule in
// them is bare. That is `built` and not `framed`, exactly.

/** §097: a transient panel, between two rules. */
const PANEL = block({
  kind: "panel",
  id: "panel",
  title: "Confirm",
  children: [block({ kind: "raw", id: "p1", text: "apply this change?" })],
});

/** §048: block states, one row per state of the same kind. */
const STEPS = block({
  kind: "steps",
  id: "steps",
  steps: [
    { label: "resolve", detail: "12 packages", state: "done" as const },
    { label: "fetch", detail: "3 remaining", state: "active" as const },
    { label: "link", state: "pending" as const },
    { label: "verify", detail: "checksum", state: "failed" as const },
  ],
});

/** §042: the pills row — peers you do not navigate, so it sheds (§095's rule). */
const PILLS = block({
  kind: "pills",
  id: "pills",
  chips: [
    { label: "auto", active: true },
    { label: "plan" },
    { label: "manual" },
    { label: "accept edits" },
  ],
});

export const SURFACES: readonly Surface[] = Object.freeze([
  { section: 95, name: "a tape, where a row of peers would shed", rows: draw(TAPE) },
  { section: 42, name: "widgets — a row of peers that sheds", rows: draw(PILLS) },
  { section: 34, name: "active progress bars", rows: draw(BAR) },
  { section: 96, name: "a status has three parts, and a frame is separate", rows: draw(STATUS) },
  { section: 97, name: "a transient panel floats, between two rules", rows: draw(PANEL) },
  { section: 48, name: "block states", rows: draw(STEPS) },
]);
