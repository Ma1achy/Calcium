// A03 §3 — MG1..MG19. Imports go down only; L0's halves never touch.
import { readFileSync } from "node:fs";
import { layerOf } from "./layers.mjs";

/**
 * The rules this module actually implements — A03 §3 inventories twenty, and
 * seventeen of them wait on the components they govern. Declared as a list so
 * the vacuity suite can assert every one of them has been shown to fire; a rule
 * added here without a fabricated violation fails A03 commitment 14.
 */
export const MODULE_GRAPH_RULES = ["MG1", "MG3", "MG6", "MG10", "MG11", "MG12", "MG13", "MG14", "MG15", "MG16", "MG17", "MG18", "MG19", "MG20", "MG21", "MG22", "MG23", "MG24", "MG25"];

/**
 * MG6 is a **third kind of rule**, and saying so is the point of this comment.
 *
 * MG1 catches upward edges. MG2 catches cycles within a layer. Neither catches a
 * specific forbidden edge *within* a layer, which is what C06 → C04 is: both are
 * L0 data, the edge goes sideways, and every existing rule reports it clean.
 * Written as a special case of MG1 it would never fire, so the next sideways
 * prohibition — C15 → C13 (MG13), C20 → C17 (MG18) — goes in this table rather
 * than into the layer walk.
 *
 * **Type-only imports count here**, unlike everywhere else. C04's own spec makes
 * the argument: a type-only import erases at build and so passes the layer walk,
 * "which is precisely the objection — a dependency that `make enforce` reports
 * as clean is worse than one it catches". C06 I1 says C06 never *references* a
 * C04 type, and a reference is what an `import type` is.
 */
const FORBIDDEN_EDGES = [
  {
    rule: "MG6",
    from: "src/data/transport/",
    to: "src/data/viewmodel/",
    spec: "C06 I1 · C06 T2.2",
    why:
      "C06 reports and C07 interprets — transport constructs no view model, so it " +
      "references no C04 type. Type-only counts: erasing at build is what would " +
      "make this pass while being the dependency the rule exists to prevent",
  },
  {
    // The second instance of MG6's third kind, and it belongs here for exactly
    // the reason recorded above: `terminal/` and `data/` are both L0, so the
    // edge goes sideways and the layer walk reports it clean.
    //
    // What it guards is C21 §1's constraint. C21 cannot verify the terminal was
    // released before a handoff, because it cannot see C01 — and the moment it
    // can, it will, and the two halves of L0 stop being independently buildable.
    // The temptation is concrete and it is I6: importing C01 to *ask* whether
    // the lifecycle is suspended reads as more correct than probing `isRaw`.
    rule: "MG19",
    from: "src/data/process/",
    to: "src/terminal/",
    spec: "C21 I12 · C21 T2.3",
    why:
      "L0's two halves do not know about each other — C21 probes `stdin.isRaw` " +
      "precisely because it cannot ask C01 whether the terminal was released. " +
      "Type-only counts: a type import is a reference, and the independence " +
      "claim is about knowledge, not about emitted code",
  },
  {
    // The third instance, and the first where the *forward* edge is required.
    //
    // C11 imports C12's `sparkline` because a `Cell.spark` is not a block and
    // cannot come through the registry (C12 §2). Both directories are L1, so the
    // layer walk sees nothing in either direction — which means the return edge
    // is legal to every rule in the suite and would close a cycle A02 §1 forbids.
    //
    // What makes it concrete rather than theoretical: a plot rendering inside a
    // table's expanded detail wants a width, and `planColumns` has one. Reaching
    // for it reads as reuse. MG2 would catch the cycle once closed; this catches
    // the edge that closes it, one commit earlier.
    rule: "MG22",
    from: "src/presentation/plot/",
    to: "src/presentation/table/",
    spec: "A02 §1 · C12 §2",
    why:
      "C11 imports C12's sparkline, so the L1 edge between them is one-directional " +
      "by construction — a plot reaching back into the table engine closes a cycle " +
      "the layer walk cannot see, because both are L1. Type-only counts",
  },
  {
    // **MG10 is MG6's third kind for a fourth reason, and the sharpest one yet:
    // both of these edges go *downward*.** C13 is L2; `terminal/` is L0 and
    // `presentation/` is L1, so MG1 reports an import of either as perfectly
    // legal, and MG2 sees no cycle because there is none. Every rule in the
    // suite passes an edge that C13 I18 forbids outright.
    //
    // What it guards is not layering but *knowledge*. C13 holds documents and
    // decides what to evict; the moment it can measure one, it will, because
    // "evict by height" reads as more correct than "evict by block count" — and
    // the store would then depend on a width, a theme and a capability set, none
    // of which it has any way to obtain honestly. The cap is on blocks (I17)
    // precisely so this component never needs to render to do its job.
    rule: "MG10",
    from: "src/viewport/transcript/",
    to: "src/presentation/",
    spec: "C13 I18 · C13 T2.4",
    why:
      "C13 holds view models and never renders them — measurement is C09's and " +
      "caching it is C14's. The edge is downward, so the layer walk permits it: " +
      "this is the rule that does not. Type-only counts",
  },
  {
    // MG11. Downward again, like MG10's pair, and legal to every other rule.
    //
    // The temptation here is sharper than C13's, because C14 genuinely needs a
    // width and a height — and `stdout.columns` is right there. C01 I13 and SS42
    // say the terminal's dimensions have exactly one reader; C14 §5 says they
    // arrive as data on `resize`. A viewport that reads them itself gets a second
    // width, at a second moment, and a frame composed against two widths wraps
    // inside the alternate screen, which scrolls content the application has no
    // record of.
    rule: "MG11",
    from: "src/viewport/viewport/",
    to: "src/terminal/",
    spec: "C14 I12 · C14 T2.5",
    why:
      "dimensions arrive as data and C14 never calls the frame scheduler — a scroll " +
      "reports a change and L4 commits, matching the C01 and C10 orchestration " +
      "pattern. The edge is downward, so the layer walk permits it. Type-only counts",
  },
  {
    // MG13. The rule this table's header has named as its example since C06,
    // finally armed — and it is a **sideways** prohibition where MG10 and MG11
    // are downward ones. C13 and C15 are both L2, so the layer walk permits the
    // edge and MG2 sees no cycle because there is none to see.
    //
    // What it guards is the finding that shaped C15's whole interface. The spec
    // gave C15 a duty it had no information for — dismiss an overlay whose
    // anchor row was evicted — and the one-line fix is to subscribe to the
    // transcript. That buys detection and pays with C15's statelessness,
    // `layout()`'s purity, and a second component reading a change stream,
    // which is the class C14 paid for in a blank screen. The reason is recorded
    // by the caller instead (C15 I10), and this is what stops the fix being
    // rediscovered.
    rule: "MG13",
    from: "src/viewport/overlay/",
    to: "src/viewport/transcript/",
    spec: "C15 I9 · C15 I12 · C15 T2.5",
    why:
      "C15 holds no entry ids and writes nothing to the transcript — an anchor " +
      "is a region row, and whoever raised the layer keeps it current through " +
      "`update`. Sideways, so the layer walk permits it. Type-only counts",
  },
  {
    // MG15 — C17 imports nothing from `terminal/`.
    //
    // A **downward** prohibition, so MG1's layer walk permits the edge and only
    // this sees it: L3 sits above L0, and importing `escapes.js` or
    // `lifecycle.js` from the editor would be a legal edge by every other rule
    // in this table. MG21 is the precedent running the other way — presentation
    // may import `escapes.js` for `sgr`, stated rather than assumed — and the
    // editor has no such exception because it emits nothing.
    //
    // The reachable version of the mistake is width. C17 takes `width` and
    // `gutter` as parameters (I10) and the shortcut is one import away: reading
    // `stdout.columns`, or asking C01, rather than being handed the number.
    // CLAUDE.md's Never list names that one specifically — width is the axis
    // that wraps, and a wrapped line scrolls the alternate screen — and an
    // editor holding geometry is also one nothing can measure at a width other
    // than the terminal's, which is what T2.1's corpus at widths 20 to 200
    // depends on.
    rule: "MG15",
    from: "src/interaction/editor/",
    to: "src/terminal/",
    spec: "C17 I10 · C17 I14 · C17 T2.6",
    why:
      "C17 holds no geometry and emits nothing: width and gutter are parameters, " +
      "and the prompt is drawn by L4. Downward, so the layer walk permits it. " +
      "Type-only counts",
  },
  {
    // MG14 — C16 imports nothing from `terminal/`.
    //
    // **Two components late, and that is the finding rather than the rule.** It
    // was listed pending on C16 from the day it was written, C16 landed, and
    // nothing looked: a pending entry whose blocker has arrived reports exactly
    // like a rule that is enforced. The check that now catches it is the same
    // shape as A03 §2's other vacuity checks and is a sibling of the fold —
    // one exit for a reason that was false at birth, one for a reason that has
    // since come true.
    //
    // The reachable form is the decoder. C16 reads bytes and names keys, and
    // both halves of that job have a `terminal/` module that looks relevant:
    // `capabilities` knows whether the terminal sends `modifyOtherKeys`, and
    // `escapes` holds the CSI vocabulary decode is matching against. The second
    // is the one that would be written — SS14 already allows `decode.ts` its
    // own `\x1b` literals, which is the exemption that exists precisely because
    // C16 must not reach for C01's.
    rule: "MG14",
    from: "src/interaction/router/",
    to: "src/terminal/",
    spec: "C16 T2.7",
    why:
      "C16 decodes bytes it is handed and names keys; capability answers arrive " +
      "as `DecodeCapabilities`, not by asking C02. Downward, so the layer walk " +
      "permits it. Type-only counts",
  },
  {
    // MG17 — C19 imports nothing from `terminal/`.
    //
    // Listed pending on C19 from the day it was written, and built on the
    // commit that makes the directory real rather than left to be noticed —
    // MG14 was two components late, and a pending entry whose blocker has
    // arrived reports exactly like an enforced rule.
    //
    // The reachable form is the menu. C19 decides how wide the menu wants to
    // be, and "how wide" is one short step from "how wide is the terminal" —
    // which is `lifecycle`'s, handed down, and the one axis whose misuse wraps
    // a line and scrolls the alternate screen. C15 I16 is the seam that keeps
    // it honest: C19 declares a width and C15 owns the region, and neither can
    // supply the other's half. A `terminal/` import here is what collapses that
    // pair back into one component guessing.
    rule: "MG17",
    from: "src/interaction/completion/",
    to: "src/terminal/",
    spec: "C19 I12 · C19 T2.5",
    why:
      "C19 supplies candidates, blocks and a requested width; the region, the " +
      "frame and the terminal's own dimensions are C15's and L4's. Downward, " +
      "so the layer walk permits it. Type-only counts",
  },
  {
    // MG16 — C18 imports nothing from `terminal/` *or* `presentation/`, which
    // is the only rule in this family with two forbidden targets. The second is
    // the live one: C18 produces errors, and an `ErrorLike` is C04's while the
    // rendering of one is C07's and C09's. A parser that reached for a block
    // builder to make its unknown-verb message pretty would put presentation
    // inside a pure function and give the same failure two renderings.
    rule: "MG16",
    from: "src/interaction/parser/",
    to: ["src/terminal/", "src/presentation/"],
    spec: "C18 I15 · C18 T2.4",
    why:
      "C18 is pure and total, and it classifies rather than renders: an " +
      "`ErrorLike` is C04's shape and what it looks like is C07's and C09's " +
      "question. Downward, so the layer walk permits it. Type-only counts",
  },
  {
    // MG12, and a separate rule in A03's inventory rather than MG13's second
    // row. C14 is the other component whose data would let C15 stop being
    // handed a region, and `layout(region)` taking one as a parameter is the
    // whole of I12 — a manager that can ask the viewport where it is has
    // acquired state nothing can assert it pure over.
    rule: "MG12",
    from: "src/viewport/overlay/",
    to: "src/viewport/viewport/",
    spec: "C15 I12 · C15 T2.6",
    why:
      "the region arrives as data at `layout()`. Sideways, so the layer walk " +
      "permits it. Type-only counts",
  },
  {
    rule: "MG12",
    from: "src/viewport/overlay/",
    to: "src/terminal/",
    spec: "C15 I12 · C15 T2.6",
    why:
      "no clock, no width, no escape sequence reaches a layer — C15 composes no " +
      "frame and reads no dimension it was not given. Downward, and forbidden",
  },
  {
    // MG18 — C20 imports nothing from `terminal/` and nothing from C17.
    //
    // Pending on C20 since it was inventoried, and built on the commit that
    // makes `src/interaction/history/` real. The second target is the live one
    // and it is the whole of I1: `previous()` returns a string because a store
    // that could call `setText` would have to decide where the cursor lands and
    // whether the replacement is one undo unit — both the prompt's business, and
    // both already answered by C17 for the editor's own callers. The import is
    // sideways within L3 and the layer walk would permit it, which is exactly
    // why the prohibition is written down rather than left to the walk.
    rule: "MG18",
    from: "src/interaction/history/",
    to: ["src/terminal/", "src/interaction/editor/"],
    spec: "C20 I1 · C20 I15 · C20 T2.5 · C20 T2.6",
    why:
      "C20 returns strings and L4 applies them; the clock, the width and the " +
      "frame are somebody else's, and the buffer is C17's. Type-only counts",
  },
  {
    rule: "MG10",
    from: "src/viewport/transcript/",
    to: "src/terminal/",
    spec: "C13 I18 · C13 I9 · C13 T2.4",
    why:
      "no clock, no width, no escape sequence reaches the transcript — `seq` is " +
      "logical and the terminal's dimensions arrive as data at C14 if at all. " +
      "Also downward, and also forbidden. Type-only counts",
  },
];

const IMPORT = /^\s*(?:import|export)\b([^'"]*?)from\s*['"]([^'"]+)['"]/gm;
const BARE   = /^\s*import\s*['"]([^'"]+)['"]/gm;

/**
 * A statement-level `import type` / `export type` erases at build and creates no
 * runtime edge, so it is not an import for the layer rule's purposes — C01 needs
 * C02's `TerminalCapabilities` type while genuinely not importing C02.
 *
 * An inline `import { type X, y }` is NOT skipped: the statement still emits,
 * and `y` is a real edge.
 */
function isTypeOnly(clause) {
  return /^type\b/.test(clause.trim());
}

function importsOf(file, readFile, includeTypeOnly = false) {
  const src = readFile(file);
  const out = [];

  IMPORT.lastIndex = 0;
  let m;
  while ((m = IMPORT.exec(src))) {
    if (!includeTypeOnly && isTypeOnly(m[1])) continue;
    out.push(m[2]);
  }

  BARE.lastIndex = 0;
  while ((m = BARE.exec(src))) out.push(m[1]);

  return out;
}

function resolve(file, spec) {
  if (!spec.startsWith(".")) return null;          // external, not our concern
  const dir = file.split("/").slice(0, -1).join("/");
  const parts = (dir + "/" + spec).split("/");
  const stack = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}

/**
 * MG20 — each mode export of `escapes.ts` belongs to exactly one component.
 *
 * SS15 says where the digits may live; this says who may mean them. Asserted per
 * sequence rather than per file, so C03's transactional exception for `2026`
 * stays exactly one sequence wide rather than becoming "C03 may use escapes".
 *
 * An export with no importer is fine: `SCROLL_REGION` has no consumer until
 * M-T6, and requiring one would force a dead export CLAUDE.md forbids.
 *
 * An export that does not *exist* is not fine, and is the third way a rule
 * comes to have nothing to be wrong about (A03 §2). These rows named
 * `SYNC_UPDATE` and `SCROLL_REGION` while `escapes.ts` exported neither: the
 * lookup could never hit, so the rows reported compliance whatever the tree
 * contained. `modeOwnersAreReal` is the assertion that they name something.
 */
const MODE_OWNERS = {
  ALT_SCREEN:     "src/terminal/lifecycle.ts",
  CURSOR:         "src/terminal/lifecycle.ts",
  BRACKET_PASTE:  "src/terminal/lifecycle.ts",
  MOUSE:          "src/terminal/lifecycle.ts",
  SCROLL_REGION:  "src/terminal/frame-scheduler.ts",
  SYNC_UPDATE:    "src/terminal/frame-scheduler.ts",
};

const ESCAPES = "src/terminal/escapes";
const NAMED = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm;

/**
 * NodeNext import specifiers end `.js` while the file on disk is `.ts`, so a
 * resolved specifier never equals a path. Comparing without the extension is
 * what makes MG20 fire at all — with it, the rule silently matched nothing.
 */
const bare = (p) => p.replace(/\.(m|c)?[jt]sx?$/, "");

function checkModeOwnership(files, readFile) {
  const violations = [];
  for (const file of files) {
    const f = file.replaceAll("\\", "/");
    if (bare(f) === ESCAPES) continue;
    const src = readFile(file);

    NAMED.lastIndex = 0;
    let m;
    while ((m = NAMED.exec(src))) {
      const target = resolve(f, m[2]);
      if (target === null || bare(target) !== ESCAPES) continue;
      for (const raw of m[1].split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
        const owner = MODE_OWNERS[name];
        if (owner === undefined || owner === f) continue;
        violations.push({
          rule: "MG20", file: f,
          message: `imports ${name} from escapes.ts, but ${owner} owns that mode`,
          spec: "C01 I1 · C01 T2.8",
        });
      }
    }
  }
  return violations;
}

/**
 * Which `MODE_OWNERS` rows name an export `escapes.ts` actually has.
 *
 * A row for an absent name is a row that cannot fire — it is not a wrong rule,
 * it is a rule with nothing to be wrong about, which is the failure mode A03 §2
 * names. Returned rather than thrown so the caller can list the pending ones
 * (`SCROLL_REGION` waits on M-T6) and fail on the rest.
 */
export function modeOwnersAreReal(readFile = (f) => readFileSync(f, "utf8")) {
  const src = readFile(`${ESCAPES}.ts`);
  const exported = new Set([...src.matchAll(/^\s*export\s+const\s+(\w+)/gm)].map((m) => m[1]));
  const missing = Object.keys(MODE_OWNERS).filter((name) => !exported.has(name));
  return { exported: [...exported], missing, owned: Object.keys(MODE_OWNERS) };
}

/**
 * MG21 — `presentation/` reaches into `terminal/` for `escapes.js` and nothing
 * else.
 *
 * C09 §3's `sgr` is the first runtime edge from L1 to L0-terminal. It is legal
 * — MG1 forbids upward imports and this is downward — and it is *required*: an
 * SGR sequence is an escape literal, and C01 I1 puts those in one module. What
 * makes it safe is that it stays one narrow import rather than becoming the
 * beginning of a habit.
 *
 * Two edits this exists to catch, and both look reasonable in review: tidying
 * the import away (which would put an escape literal in `presentation/`, where
 * SS14 forbids it), and adding one more like it.
 *
 * Type-only imports are not edges — `importsOf` already drops them, which is
 * how `presentation/` keeps naming `TerminalCapabilities` without importing C02.
 */
function checkPresentationEdges(files, readFile) {
  const violations = [];
  for (const file of files) {
    const f = file.replaceAll("\\", "/");
    if (!f.startsWith("src/presentation/")) continue;

    for (const spec of importsOf(file, readFile)) {
      const target = resolve(f, spec);
      if (target === null || !target.startsWith("src/terminal/")) continue;
      if (bare(target) === ESCAPES) continue;

      violations.push({
        rule: "MG21", file: f,
        message:
          `imports ${spec} from terminal/ at run time — presentation/ may import ` +
          `escapes.js and nothing else (C09 §3); a capability type is an ` +
          `\`import type\`, which is not an edge`,
        spec: "C09 §3 · C09 T2.17",
      });
    }
  }
  return violations;
}

/**
 * `readFile` is injected so the rule can be tested against fabricated modules at
 * layer paths that do not exist on disk — the same reason C02 takes its `env`.
 */
/** MG6 and the sideways prohibitions that follow it — see `FORBIDDEN_EDGES`. */
function checkForbiddenEdges(files, readFile) {
  const violations = [];
  for (const file of files) {
    const f = file.replaceAll("\\", "/");
    for (const edge of FORBIDDEN_EDGES) {
      if (!f.startsWith(edge.from)) continue;
      // `to` is a list because MG16 forbids two targets, and SS24's history is
      // the argument for a list over a second row: two rows with one id are one
      // member of every set comparison, so the second is invisible to the
      // fabrication check and can be vacuous without anything saying so.
      const targets = Array.isArray(edge.to) ? edge.to : [edge.to];
      for (const spec of importsOf(file, readFile, true)) {
        const target = resolve(file, spec);
        if (target === null || !targets.some((t) => target.startsWith(t))) continue;
        violations.push({
          rule: edge.rule, file,
          message: `imports ${spec} — ${edge.why}`,
          spec: edge.spec,
        });
      }
    }
  }
  return violations;
}

export function checkModuleGraph(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [
    ...checkModeOwnership(files, readFile),
    ...checkPresentationEdges(files, readFile),
    ...checkForbiddenEdges(files, readFile),
  ];
  for (const file of files) {
    const from = layerOf(file);
    if (!from) continue;
    for (const spec of importsOf(file, readFile)) {
      const target = resolve(file, spec);
      if (!target) continue;
      const to = layerOf(target);
      if (!to) continue;

      if (to.rank > from.rank) {
        violations.push({
          rule: "MG1", file,
          message: `imports UPWARD: ${from.label} → ${to.label} (${spec})`,
          spec: "A02 §1",
        });
      }
      if (from.rank === 0 && to.rank === 0 && from.half !== to.half) {
        violations.push({
          rule: "MG3", file,
          message: `crosses L0's halves: ${from.half} → ${to.half} (${spec})`,
          spec: "A02 §1 · C01 T2.4 · C03 T2.6",
        });
      }
    }
  }
  return violations;
}


// --- MG23 — one store per component, above L0 -------------------------------
//
// **SS29 folded, and it is the SS7/SS8/SS12 pattern a fourth time**: a rule
// whose scope was covered by a broader mechanism at birth. It was inventoried as
// a source scan for "multi-store access outside local handlers", and neither
// half survived reading.
//
// Scoped to `src/shell/` it fires on the component it exists to permit — C23
// reaches the transcript, the scheduler, the runner and the manifest by design,
// and Seam 4 is the reason. A rule whose only in-scope file is its own exception
// is not a rule.
//
// Scoped to L1–L3, which is the sentence C23 §2 actually argues — *a local
// handler is the only place a component above L0 may reach several stores at
// once* — "reaching a store" means **importing** one, which is a module-graph
// question. MG already answers it per component: MG10 forbids C13 from
// `terminal/` and `presentation/`, MG18 covers C20, and each L2/L3 component has
// a row. Those rows are prohibitions between named pairs; this is the property
// they are instances of, so the twenty-sixth component cannot reach two stores
// merely because nobody has written its row yet. SS40 covering a directory
// rather than naming files, one family across.
//
// **The stores are enumerated, not pattern-matched** (`MODE_OWNERS`'s
// precedent). A rule governing named entities whose names are never checked is
// A03 §2's third clause, so `storeNamesAreReal` asserts every symbol below is one
// the tree actually exports.
//
// **"Above L0" qualifies the component, not the store.** C05's manifest and
// C07's adapter registry are L0 and are still stores; what the sentence forbids
// is an L1–L3 component holding two of anything stateful at once. So they are in
// the list and `src/data/` is not in scope — C06 reaching C05 is L0 business and
// no component above it is involved.
//
// It is *imports of the store itself* that count, not any symbol from a module
// that happens to hold one. C11 and C12 import C09's paint helpers and C10's
// tones (CLAUDE.md), which is required rather than tolerated; neither imports a
// registry or a theme store, and neither should fire.

/** Symbol → the component whose store it is. Enumerated for A03 §2's third clause. */
export const STORE_SYMBOLS = Object.freeze({
  createTranscriptStore: "C13",
  TranscriptStore: "C13",
  TranscriptView: "C13",
  createViewport: "C14",
  Viewport: "C14",
  createOverlayManager: "C15",
  OverlayManager: "C15",
  openHistory: "C20",
  HistoryStore: "C20",
  loadTheme: "C10",
  ThemeStore: "C10",
  createBlockRegistry: "C09",
  BlockRegistry: "C09",
  createManifestStore: "C05",
  ManifestStore: "C05",
  createAdapterRegistry: "C07",
  AdapterRegistry: "C07",
});

const MG23_SCOPES = ["src/presentation/", "src/viewport/", "src/interaction/"];

/**
 * Which component owns a directory, so a file is not charged with reaching its
 * own store.
 *
 * `viewport.ts` naming `Viewport` was the first run's only finding, and it is a
 * false positive of exactly the kind that gets a rule deleted: C14 declaring its
 * own handle is not C14 reaching for someone else's. The map is written out
 * rather than derived from the path, because "the directory two levels down" is
 * a guess that holds until a component implements into a different shape.
 */
const STORE_HOME = Object.freeze({
  "src/viewport/transcript/": "C13",
  "src/viewport/viewport/": "C14",
  "src/viewport/overlay/": "C15",
  "src/presentation/blocks/": "C09",
  "src/presentation/theme/": "C10",
  "src/interaction/history/": "C20",
});

function selfStore(file) {
  for (const [dir, id] of Object.entries(STORE_HOME)) {
    if (file.startsWith(dir)) return id;
  }
  return null;
}

/** Named import members, type-only included: a `type ThemeStore` is still a reach. */
const IMPORT_MEMBERS = /import\s+(?:type\s+)?\{([^}]*)\}\s*from/gs;

function storeReaches(file, readFile) {
  const src = readFile(file);
  const found = new Map();

  IMPORT_MEMBERS.lastIndex = 0;
  let m;
  while ((m = IMPORT_MEMBERS.exec(src))) {
    for (const raw of (m[1] ?? "").split(",")) {
      // `type X as Y` and `X as Y` both name X as the thing being reached.
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim();
      if (name === undefined || name === "") continue;
      const owner = STORE_SYMBOLS[name];
      if (owner === undefined) continue;
      if (!found.has(owner)) found.set(owner, name);
    }
  }
  return found;
}

/**
 * The rule's own vacuity, closed the way `modeOwnersAreReal` closes MG20's.
 *
 * A symbol nobody exports can never be imported, so a typo in the list above is
 * a row that reports compliance because it cannot find what it was asked about.
 */
export function storeNamesAreReal(files, readFile = (f) => readFileSync(f, "utf8")) {
  const exported = new Set();
  for (const file of files) {
    const src = readFile(file);
    for (const m of src.matchAll(/^\s*export\s+(?:type\s+|interface\s+|function\s+|const\s+|class\s+)?(\w+)/gm)) {
      if (m[1] !== undefined) exported.add(m[1]);
    }
    for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gms)) {
      for (const raw of (m[1] ?? "").split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
        if (name !== undefined && name !== "") exported.add(name);
      }
    }
  }
  return Object.keys(STORE_SYMBOLS).filter((n) => !exported.has(n));
}

export function checkOneStorePerComponent(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];

  for (const file of files) {
    const f = file.replaceAll("\\", "/");
    if (!MG23_SCOPES.some((s) => f.startsWith(s))) continue;

    const found = storeReaches(f, readFile);
    // A component's own store is not a reach.
    const own = selfStore(f);
    if (own !== null) found.delete(own);
    if (found.size < 2) continue;

    const named = [...found.entries()].map(([owner, sym]) => `${owner} (${sym})`).sort();
    violations.push({
      rule: "MG23",
      file: f,
      message:
        `reaches ${String(found.size)} stores — ${named.join(", ")}. ` +
        `A component above L0 may hold one; several at once is L4's, through C23 ` +
        `and its local handlers, never laterally`,
      spec: "C23 §2 · C23 I14 · A02 Seam 4",
    });
  }

  return violations;
}


// --- MG24 — a published interface member with no consumer -------------------
//
// **The interior half of "add no export nothing consumes".** CLAUDE.md carries
// that rule for the public API's edge; this is the same rule one layer in, and
// either alone reads as arbitrary. The edge rule stops the façade growing
// surface nobody asked for. This one catches the opposite shape, which is not
// an excess but a *gap*:
//
//   **a component complete on its own side of a seam, with nothing on the
//   other.**
//
// It is invisible from both suites by construction. The producer has its tests
// — C19 asserts `spinning` at four tiers — and the consumer never mentions the
// thing it fails to consume, so there is no assertion to fail and no file to
// read that looks wrong. Structurally different from the defects the by-hand
// walks catch, which live where two correct statements overlap; this one lives
// where a statement has no counterpart at all.
//
// Four instances landed in one stretch and none was found by review:
//
//   the TTY gate     C22 §4 step 1 specified, no code
//   C22 I38          C19 answered `spinning`, `src/shell` never read it
//   C22 I39          C19 exposed `cancel()`, nothing called it
//   C16 I23          C14 exposed `scrollToTop`/`scrollToBottom`, no key reached
//
// **Why interface members rather than exports.** The obvious rule — an export
// no other module imports — was measured first and cannot work: 55 runtime
// exports in `src/` have no importer, and they are dominated by constants
// deliberately exported so a test asserts against the constant rather than a
// literal (`ESC_DISAMBIGUATION_MS`, `UNDO_LIMIT`, `TAB_STOP`). Those are
// indistinguishable from a real gap by any import-graph test, because both are
// imported by `test/` and not by `src/`.
//
// A member of a published interface is the discriminator, and it is not a
// convenience: the interface **is** the seam. 248 members, five unconsumed —
// small enough to read, and it named three real gaps on its first run.
//
// Scoped to `export interface`, which is where a component states what it
// offers. A type alias is structural and can be satisfied without being named.

/** Members whose absence from the rest of `src/` is deliberate, each with why. */
export const UNCONSUMED_MEMBERS = Object.freeze({
  // --- diagnostics: published to be read by a test, never by a component ----
  "LineEditor.killBuffer":
    "diagnostics, and already an explicit exception in C16 T2.14's non-editing list",
  "IdentityLoop.warned": "diagnostics; its own declaration says so and C22 T3.12 reads it",

  // --- specified and unbuilt: the class this rule exists for ----------------
  //
  // **Three, on the rule's first run, and every one of them a commitment with
  // no code on the consuming side.** They are listed rather than deleted
  // because deleting them would remove a capability the specs commit to, and
  // listed rather than left failing because a red suite is one nobody reads.
  // Each names its owner, so the day it is wired the entry has to go.
  //
  // This is the same disposal `ACKNOWLEDGED_BACKLOG` uses and it costs a
  // sentence apiece for the same reason.
  "Keymap.mergeBlock":
    "C16 §6, I10 — a surface's `BlockKeymap` merges into `liveBlock` while the block " +
    "is live, so `s` sorts a `/ps` table. Nothing commits a block keymap, so `s` does " +
    "not sort a `/ps` table. The producer is complete: `mergeBlock` refuses collisions " +
    "and withdraws on freeze, all of it tested",
  "ThemeStore.applyOverrides":
    "C10 §4 — theme overrides. C10 validates and applies them and `TuiConfig` has no " +
    "field to carry any, so nothing can reach it. Unspecified at the shell rather than " +
    "unbuilt: a ruling is missing, not code, which is where theme *persistence* was " +
    "before C22 I40",
  "ExecutionWrites.setRetained":
    "C22 I19 — expiry warns and offers inline re-login with the failed command retained. " +
    "`retained` has no writer *and* no reader: `SessionSnapshot` carries the field, two " +
    "files initialise it to null, and nothing else in `src/` names it. The whole feature " +
    "is a field",
});

/** Every `export interface` member under `src/`, with its owner. */
function interfaceMembers(files, readFile) {
  const out = [];
  for (const file of files) {
    const src = readFile(file);
    const head = /export\s+interface\s+([A-Za-z_$][\w$]*)\s*(?:extends[^{]*)?\{/g;
    let m;
    while ((m = head.exec(src))) {
      let depth = 1;
      let i = head.lastIndex;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}") depth -= 1;
        i += 1;
      }
      const body = src.slice(head.lastIndex, i - 1);
      const member = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*(?:\??\s*[:(]|\()/gm;
      let n;
      while ((n = member.exec(body))) out.push({ owner: m[1], name: n[1], file });
    }
  }
  return out;
}

/**
 * MG24, as a pure function over its inputs so it can be run against fabricated
 * files and shown to fire (A03 commitment 14).
 */
export function checkSeamConsumers(
  files,
  readFile = (f) => readFileSync(f, "utf8"),
  allowed = UNCONSUMED_MEMBERS,
) {
  const violations = [];
  const sources = new Map(files.map((f) => [f, readFile(f)]));

  for (const { owner, name, file } of interfaceMembers(files, (f) => sources.get(f) ?? "")) {
    const key = `${owner}.${name}`;
    if (allowed[key] !== undefined) continue;

    let consumed = false;
    for (const [other, src] of sources) {
      if (other === file) continue;
      if (new RegExp(`\\b${name}\\b`).test(src)) {
        consumed = true;
        break;
      }
    }
    if (consumed) continue;

    violations.push({
      rule: "MG24",
      file,
      message:
        `${key} is published and named nowhere else in src/ — a component complete on ` +
        `its own side of a seam with nothing on the other. Both suites pass: the ` +
        `producer tests it and the consumer never mentions what it fails to consume. ` +
        `Wire it, remove it, or name it in UNCONSUMED_MEMBERS with a reason`,
      spec: "A03 §3, MG24",
    });
  }

  return violations;
}

// --- MG25 — a free function with no consumer --------------------------------
//
// **MG24's blind spot, and MG24's own header is where it was written down.**
//
// That header records the obvious rule being measured and rejected: "an export
// no other module imports ... cannot work: 55 runtime exports in `src/` have no
// importer, and they are dominated by constants deliberately exported so a test
// asserts against the constant rather than a literal". The rejection was right
// about the form it measured and wrong about the rule, and two corrections make
// it work:
//
//   1. **Functions and classes only.** A constant exported for a test to assert
//      against is *the* noise MG24 named. A function is behaviour offered across
//      a seam, and that is the thing that can have no consumer. 281 candidates
//      rather than 376, and the 17 constants leave with the distinction rather
//      than with an exception apiece.
//   2. **Occurrences, not files, and comments stripped.** A function used inside
//      its own module is consumed; `validateConfig` and `isFrozen` both look
//      unconsumed to a file-counting scan and are called one screen below their
//      declaration. Prose mentions run the other way: `assignOffsets` is named
//      in four comments and called nowhere, and a scan that counts them agrees
//      the seam is wired.
//
// **7 of 281 on the first run**, which is the number that made it a rule. What
// it found that MG24 could not:
//
//   assignOffsets · backoffOf   C23 §3b's part refresh — a complete producer,
//                               no driver. `b.live` (C24 §5) rests on it, and
//                               this is why §5 says specified and not shipped.
//   gutterMatchesPrompt         an assertion whose own comment said "asserted
//                               here rather than only in a test", evaluated
//                               nowhere. Now called from `paint`.
//   promptPrefix                dead, and not even a test read it. Deleted.
//   isUsable · plotAreaWidth    a rule expressed twice — C01 asks `!altScreen`
//                               inline, C12 computes `areaWidth` inline, and
//                               each has a helper stating the same rule that
//                               nothing calls.
//
// Note the last pair is a *different* class from MG24's: not a seam with no
// consumer but a rule with two expressions, one of which is unreachable. The
// rule finds it because an unreachable expression and an unconsumed producer
// look identical from the import graph, and both want disposal.
//
// **The allow-list is compared by equality, not by membership.** Every
// too-permissive list in this repo got that way by membership — SS40's
// directory scope, CP6's hand-written surfaces, MG24's constant-dominated first
// form. A membership check makes each entry a judgement taken once and
// inherited by everything that arrives after it; equality makes the eighth
// candidate fail until someone rules on it. That is the whole difference
// between a rule and a list of things that were true once.

/** Functions whose absence from the rest of `src/` is deliberate, each with why. */
export const UNCONSUMED_FUNCTIONS = Object.freeze({
  // `renderToLines` was here and the equality arm removed it on the commit that
  // moved the conformance suites into `src/testing/` — which is the arm working,
  // and also **the rule's known false negative, shared with MG24.**
  //
  // It is not consumed. What happened is that `measurement-conformance.ts`
  // declares `renderToLines(block, width)` as a member of the registry shape it
  // needs — a different function of a different arity that happens to share a
  // name — and a rule counting occurrences of a name cannot tell a coincidence
  // from a call. Both rules match on names, so both have this hole, and neither
  // can close it without resolving imports.
  //
  // The entry goes rather than being restored, because `expectDocument` consumes
  // it for real one commit later. Recorded here rather than silently deleted:
  // an allow-list maintained by acting on signals without reading them is the
  // membership failure arriving through the other door.

  // --- specified and unbuilt: the class this rule exists for ----------------
  assignOffsets:
    "C23 §3b, I20 — part refresh. `createRefreshDriver` implements stall detection and " +
    "the identity notice and not this; a declared part is staggered by nothing because " +
    "no part can be declared. Ships with `b.live` (C24 §5), which is deferred for the " +
    "same reason",
  backoffOf:
    "C23 §3b, I21 — the same gap, and the same landing. A02 §7's one backoff rule, " +
    "correct and tested in a table, driving nothing",

  // --- a rule expressed twice, the second expression unreachable ------------
  isUsable:
    "C02, D28 — alternate screen is the sole hard requirement. `lifecycle.ts` asks " +
    "`!capabilities.altScreen` inline instead, so the rule holds and its statement is " +
    "unreachable. Wiring C01 to it is C01's call, not C24's: the two would then agree " +
    "by construction rather than by a reader noticing",
  plotAreaWidth:
    "C12 — `definition.ts` computes `areaWidth` inline across a three-rung ladder with " +
    "`MIN_AREA`, and this helper states the simple case. Two expressions of one width, " +
    "and the helper is the one no renderer calls. C12's to reconcile",
});

/**
 * MG25, as a pure function over its inputs so it can be run against fabricated
 * files and shown to fire (A03 commitment 14).
 *
 * `strict` compares the allow-list against the candidates by equality: an entry
 * naming a function that is now consumed, or was deleted, is itself a violation.
 * Otherwise the list outlives what it excuses, which is how a list stops being
 * read.
 */
export function checkFunctionConsumers(
  files,
  readFile = (f) => readFileSync(f, "utf8"),
  allowed = UNCONSUMED_FUNCTIONS,
) {
  const violations = [];
  const raw = new Map(files.map((f) => [f, readFile(f)]));

  // Comments carry the name of the thing they describe, and a producer with no
  // consumer is described more often than most. Stripped before counting, or
  // the rule reads its own documentation as evidence the seam is wired.
  const stripped = new Map(
    [...raw].map(([f, s]) => [f, s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")]),
  );

  const declared = [];
  for (const [file, src] of raw) {
    const re = /^export (?:function\*? |async function |class )([A-Za-z_$][\w$]*)/gm;
    let m;
    while ((m = re.exec(src))) declared.push({ name: m[1], file });
  }

  const unconsumed = new Set();
  for (const { name, file } of declared) {
    const re = new RegExp(`\\b${name}\\b`, "g");
    let uses = 0;
    for (const src of stripped.values()) uses += (src.match(re) ?? []).length;
    // One occurrence is the declaration itself.
    if (uses > 1) continue;
    unconsumed.add(name);

    if (allowed[name] !== undefined) continue;
    violations.push({
      rule: "MG25",
      file,
      message:
        `${name} is exported and named nowhere else in src/ — a producer with no ` +
        `consumer, or a rule whose second expression is unreachable. Both suites ` +
        `pass: its own tests exercise it and no caller exists to be wrong. Wire it, ` +
        `delete it, or name it in UNCONSUMED_FUNCTIONS with a reason`,
      spec: "A03 §3, MG25",
    });
  }

  // The equality half. A named function that has since been consumed or deleted
  // leaves an entry excusing nothing, and an allow-list whose entries are not
  // all live is one nobody has read recently.
  for (const name of Object.keys(allowed)) {
    if (unconsumed.has(name)) continue;
    violations.push({
      rule: "MG25",
      file: "tools/enforce/module-graph.mjs",
      message:
        `UNCONSUMED_FUNCTIONS names ${name}, which is no longer an unconsumed export ` +
        `— it is consumed, renamed or gone. The list is compared by equality on ` +
        `purpose: an entry that excuses nothing is how the next one gets in unread`,
      spec: "A03 §3, MG25",
    });
  }

  return violations;
}
