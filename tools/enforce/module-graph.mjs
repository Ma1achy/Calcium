// A03 §3 — MG1..MG19. Imports go down only; L0's halves never touch.
import { readFileSync } from "node:fs";
import { OWNERS } from "./commitments.mjs";
import { layerOf } from "./layers.mjs";

/**
 * Which component owns a file, by longest matching prefix.
 *
 * **`OWNERS` is reused rather than restated.** It is already the allow-list over
 * directories that SP-class rules resolve an invariant's owner with, including
 * the two exceptions a second map would have had to rediscover — `src/shell` is
 * C22 except `src/shell/execution`, and `src/shell/builders` is C24's because
 * `b` is L4's surface.
 *
 * **An unowned file is its own component**, returned as its own path rather than
 * as `null`. Two files with no owner are then *different* components, which
 * makes MG24 fire on them; collapsing them to one `null` component would make
 * every unowned file a consumer of every other, which is this rule's defect one
 * level up. `src/index.ts` and `src/data/*.ts` are the live cases.
 */
export function componentOf(file) {
  let best = null;
  for (const { path, spec } of OWNERS) {
    if ((file === path || file.startsWith(`${path}/`) || file.startsWith(path)) &&
        (best === null || path.length > best.path.length)) {
      best = { path, spec };
    }
  }
  return best === null ? file : best.spec;
}

/**
 * The rules this module actually implements — A03 §3 inventories twenty, and
 * seventeen of them wait on the components they govern. Declared as a list so
 * the vacuity suite can assert every one of them has been shown to fire; a rule
 * added here without a fabricated violation fails A03 commitment 14.
 */
export const MODULE_GRAPH_RULES = ["MG1", "MG2", "MG3", "MG6", "MG10", "MG11", "MG12", "MG13", "MG14", "MG15", "MG16", "MG17", "MG18", "MG19", "MG20", "MG21", "MG22", "MG23", "MG24", "MG25", "MG26", "MG27", "MG28", "MG29"];

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
 *
 * **That ruling was made for a pair inside one half and MG3 inherited it without
 * a decision** (FINDINGS F127). C01 → C02 is `terminal/` → `terminal/`: no layer
 * question arises and erasure settles it. L0's *halves* are a different claim —
 * A02 §1 protects each half type-checking with the other absent — so a type-only
 * edge is exactly what removes the property, and `checkCrossHalfTypes` walks
 * them. Measured: a fabricated type-only edge from `data/` into `terminal/` left
 * `make enforce` green at 6927 references; the same edge as a value import fired
 * MG3 at once. MG21 and MG22 already record the two answers, and both are right
 * for what they protect.
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
  MOUSE_ANY:      "src/terminal/lifecycle.ts",
  KITTY_KEYBOARD: "src/terminal/lifecycle.ts",
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

// --- MG27: a block field no builder can set -------------------------------

/**
 * **Every builder exposes what its block can express, or the reason is written
 * down where this rule can find it** (C24 I18, FINDINGS F114).
 *
 * **The rule is not new here. Only the mechanism is.** C24 I18 already ends
 * *"a builder narrower than its block is either a ruling with a reason written
 * down or a defect; there is no third state"*, and commitment 16 restates it.
 * Both were correct and nothing read them: `patch.collapsedAfter`,
 * `patch.actions` and `table.sort` were unreachable underneath. That is C09
 * §4a's lesson about prose, arriving in the document that states the lesson.
 *
 * The model was already in the tree twice before it was a rule. `b.plot` gained
 * `yMin`/`yMax` and left `yFormat`, `xLabels` and `emptyMessage` out **with the
 * reason recorded for each** — `percent` multiplies by 100 and a CLI's numbers
 * are already percentages, `xLabels` is a fixed three-tuple that cannot hold a
 * caption, no surface has an empty plot. That is a decision. The same omission
 * with no reason is a gap the next consumer rediscovers, which is how
 * `collapsedAfter` (F41) and `Hunk.collapsedBefore` were both found *after* the
 * same builder had been audited by hand.
 *
 * **Prose is what no rule reads** — C09 §4a's lesson — so the reasons live in
 * `BUILDER_OMISSIONS` below, keyed by `Kind.field`, and the bidirectional arm
 * applies here exactly as it does to `UNCONSUMED_MEMBERS`: an entry naming a
 * field the builder now sets is itself a violation.
 *
 * **The blind spot, stated because an unrecorded limit reads as strength.** This
 * matches a field *name* in the builder's text, so a builder that mentions a
 * field without setting it counts as covering it — the check is that the name
 * is reachable, never that it is wired correctly. It also cannot see a field
 * exposed with the wrong shape. Both are the frame-read's job, and neither is
 * why a field goes missing: the measured cases are all a field nobody typed.
 *
 * **And it reads one of the two builder files** (FINDINGS F181) — this one, not
 * `figure.ts`. Which is why ten of the entries below say *shorthand lands in
 * step 11* and are true about `b.plot` while `b.figure(…).setQuartiles([…])`
 * has been setting the field all along: the sentence is accurate and it is not
 * the claim this rule enforces, which is *buildable by nothing public*. F180's
 * shape one door along, and the reason `setOhlc` is absent from the chain
 * rather than present and inert.
 *
 * **`plot.yFormat` came off by being built, and the rule took it off** (C04 I41,
 * F31). Its entry read *"`percent` multiplies by 100 and every far side that
 * emits a percentage emits 84, not 0.84"* — accurate about the trap, and it
 * recorded the trap as grounds for withholding rather than as the thing to fix.
 * Renaming the multiplying arm to `fraction` left nothing to withhold. The list
 * is compared by equality, so this could not be forgotten: `make enforce`
 * refused the commit the moment the builder set the field.
 *
 * That is the second entry in one session to be disposed of by its subject being
 * wired rather than by anyone remembering — MG25's `isUsable` was the first. An
 * exemption whose reason has expired is indistinguishable from a live one to a
 * reader, and equality comparison is what makes the difference mechanical.
 */
/**
 * Fields no builder sets for a reason about the **field**, not about a kind.
 *
 * **One entry rather than nineteen.** `BUILDER_OMISSIONS` is keyed `Kind.field`
 * because its reasons are per kind — *`percent` multiplies by 100 and a CLI's
 * numbers already are* is a sentence about `plot`. A field carried by an
 * intersected base type is on every kind at once, so the same reason would be
 * copied nineteen times, and nobody re-reads nineteen copies of one sentence.
 * That is the failure mode `UNCONSUMED_MEMBERS` and this list's own
 * bidirectional arm exist to prevent, arriving through the shape of the key.
 *
 * The bidirectional arm applies here too, and harder: if any builder starts
 * setting one of these, the entry is a violation, because the whole claim is
 * that no builder *can*.
 */
export const BUILDER_NEVER = Object.freeze({
  capped:
    "written only by C09's registry when a block exceeds `maxBlockRows` (C14 I24, C09 §2b) — " +
    "the marker it drives says what the framework cut, and a builder that set it would let a " +
    "producer claim a cut that never happened",
  minHeight:
    "written only by `op: \"reserve\"` (C04 I67, §3d) — it is view state the shell sets " +
    "after a renderer gave way, and nothing on the far side or in an author's hands knows " +
    "that happened. A builder for it would be a second writer for a field whose whole " +
    "argument is that it has one",
});

export const BUILDER_OMISSIONS = Object.freeze({
  // **`plot.xLabels` is gone from this list, and a surface is what removed it.**
  // Its reason had two clauses — *no surface has wanted one* and *a caption
  // sentence does not fit it* — and the history heatmap wants exactly the fixed
  // three-tuple: `-N ticks`, nothing, `now`. The second clause is still true and
  // is why `axisCaption` sits beside the plot rather than in it. **A reason with
  // two clauses expires one at a time**, and equality comparison cannot see that
  // — it notices an entry that became unnecessary, never one whose argument did
  // (FINDINGS F180).
  // --- `status`: seven fields, and none of them a consumer's to hold ---------
  //
  // **The kind exists because its three states are the framework's facts.** A
  // thrown renderer is the registry's, a first fetch in flight is the builder's,
  // a backoff counting down is the refresh driver's — and a consumer holds none
  // of the three. A `b.status()` would let one be claimed rather than observed,
  // which is the opposite of what the kind is for: a box asserting *retrying* on
  // a document nothing is retrying is a lie the framework wrote the type for.
  //
  // **This is not a deferral and there is no condition to watch.** A consumer
  // who wants a bordered box with a message has `panel` and `notice`; one who
  // wants a live part's failure to look different overrides `renderError` or
  // `renderLoading` and returns any block at all, which is C24 §5's *behaviour
  // is fixed, rendering is overridable* already working. Both routes exist
  // today, so nothing here is owed a later step (C09 §3a, C04 I66).
  // **This reason expired halfway and the half that survives is the one that matters.** It
  // read *the box is bound by what `measure` committed and cannot be given its own*, which is
  // true of the containment path and false since C23 I51: the two framework defaults pick 2
  // and 1, chosen from a frame. What has not changed is that no **consumer** picks one — the
  // pickers are the registry and the refresh driver, both inside the framework, and a builder
  // would hand the number to someone with no way to know what will be drawn in it.
  "status.elapsedMs": "C09 I32, C23 I52 — supplied by whoever holds the clock, which is the refresh driver and never a builder",
  "status.spinner": "C09 I32 — the frame set is the renderer's, chosen per capability set; a consumer owning a `status` (C24 I30) is handed no frames to name",

  "keyValue.keyWidth":
    "C09 I25a — the same argument as `patch.numberWidth`, and it had no entry because MG27 " +
    "could not see the field (F430). It is what a *window* carries so its key column describes " +
    "the block it came from rather than the slice it shows; a hand-built keyValue setting it " +
    "would assert a column its own labels do not justify. `window` is the one writer",

  // **`plot.camera` was here and is gone**, on the commit that built
  // `plot3d`. Its reason was sharper than *not yet built* — a plot declaring
  // a camera becomes focusable (C12 I85), so exposing it earlier handed callers
  // a focus stop and no way to draw anything — and the form is what made it
  // safe. `points3` and `colourBy` landed on `b.plot` beside it rather than
  // arriving here, because a carrier with a renderer needs no excuse.

  "table.actionBar":
    "C11 I18 — a presence rather than a width, and not the producer's either. The bar is " +
    "derived from `rows.some(r => r.actions)`, so a window moves it in both directions and " +
    "pins what the *parent* derived; a hand-built table setting it would assert two rows its " +
    "own rows do not justify. `window` is the one writer and it recomputes rather than " +
    "remembers, so the pin cannot describe the previous document",
  "table.presorted":
    "C11 I19 — the same argument one field over, about an order rather than a presence. " +
    "`sortedRows` is not idempotent under a slice because `kindOf` reads the values present, " +
    "so a window hands its rows over already ordered; a producer setting it would assert an " +
    "order nothing can check the block against (FINDINGS F429)",

  "code.lineRange":
    "C04 I82, C09 I25a — the pin a *window* carries so a slice of a code block is the whole " +
    "block's parse rather than its own: the text travels whole and the range says which lines " +
    "are drawn. A hand-built code block setting it would name which of its own lines a reader " +
    "is looking at, which is view state; `codeDefinition.window` is the one writer and " +
    "`validateDocument` refuses it from the far side (C04 I67's set, third member)",

  "patch.numberWidth":
    "C25 I21a — not the producer's to set. It is what a *window* carries so its gutter " +
    "describes the block it came from rather than the slice it shows, and a hand-built patch " +
    "that set it would be asserting a gutter its own lines do not justify. `windowPatch` is " +
    "the one writer, and a builder exposing it would offer a consumer the drift (F134)",

  // --- plot forms: the eight that are gone, and why the reason outlived itself
  //
  // **Seven entries carried one sentence — *no plan owes one* — and a plan had
  // owed it since F335.** The reason was reworded once, when the step it named
  // arrived and took `startDate` and `calendarUnit`: the schedule was struck and
  // the clause replacing it asserted, of the rest, that nothing was owed. That is
  // a deferral naming a condition with nothing watching it, and the thing that
  // satisfied the condition was written somewhere else — F335 measured the gap,
  // the roadmap cited it, and four forms were unconstructible for as long as both
  // were true (C24 I30, §4b).
  //
  // **`emptyMessage`'s was the sharper one**, because it was not a schedule at
  // all: *no surface has an empty plot*. That is a claim about the surfaces that
  // existed when it was written, offered as a reason a member cannot be set — and
  // it makes every app that meets an empty plot hand-compose the state instead,
  // which is §8d's defect one kind along.
  //
  // All eight are set now. The list is shorter rather than reworded, which is
  // what MG27's bidirectional arm is for.
});

/** `Kind.field` for every block field, and whether a builder mentions it. */
/**
 * MG28 — a closed union field whose builders reach one arm (F180).
 *
 * **MG27's subject is narrower than what it reads as covering**, which is F84's
 * shape one rule along. It asks whether a builder's constructed literal
 * *mentions* each field, and `form: "line"` mentions `form` — so a closed union
 * with a hardcoded arm satisfies a check about names while the other arms are
 * buildable by nothing public. `PlotForm` has three members; `b.plot` wrote
 * `line` and `b.spark` writes `sparkline`, and `heatmap` shipped with a walk, a
 * validator arm, a renderer, three golden frames and a mutation pass, reachable
 * only by reaching past the builder into `block()`.
 *
 * **A field is covered if *any* builder for that kind threads a parameter into
 * it.** The rule is about the kind's public surface as a whole, not per builder:
 * `b.spark` writing `form: "sparkline"` is a specialised door and correct, and
 * it is `b.plot` taking the form that opens the others.
 *
 * ## What it cannot see, stated because an unrecorded limit reads as strength
 *
 * - **Top-level fields only**, as MG27 is. `Steps.steps[].state` and
 *   `Table.sort.direction` are unions inside a nested shape, and reaching them
 *   needs a parser rather than a line walk.
 * - **A union of named types**, rather than of string literals, is skipped. The
 *   subject is a *vocabulary* a consumer picks from — `"line" | "sparkline"` —
 *   and `Foo | Bar` is a shape choice the type system already makes.
 * - **A parameter is trusted.** A builder threading `form` through a variable
 *   that can only hold one value would pass; nothing in the tree does that, and
 *   distinguishing it needs flow analysis. **A shorthand property counts as
 *   one** — `{ state, height }` is a variable by construction — and it did not
 *   until `b.status` wrote one: the walk read `field:` only, so a field assigned
 *   by shorthand looked like a field no builder writes, which is the same
 *   verdict as one arm reached and the opposite of the truth.
 */
function checkUnionReach(types, typeNames, fieldsOf, byKind, shared) {
  const violations = [];

  // A field's declared type text, top-level only — the same walk `fieldsOf`
  // does, kept separate so MG27's output does not move.
  const typeOf = (typeName, field) => {
    const m = new RegExp(`export type ${typeName} = Readonly<\\{([\\s\\S]*?)\\n?\\}>`, "u").exec(types);
    if (m === null) return null;
    let depth = 0;
    for (const line of m[1].split("\n")) {
      const atTop = depth === 0;
      for (const ch of line) {
        if (ch === "(" || ch === "[" || ch === "{") depth += 1;
        else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
      }
      const f = new RegExp(`^\\s*${field}\\??\\s*:\\s*(.+?);\\s*$`, "u").exec(line);
      if (f !== null && atTop) return f[1];
    }
    return null;
  };

  // A closed set of string literals, following one level of alias. Anything
  // else — a named shape, a generic, a template literal — is not this rule's.
  const membersOf = (text) => {
    if (text === null) return null;
    const direct = text.trim();
    if (/^"[^"]+"(\s*\|\s*"[^"]+")+$/u.test(direct)) {
      return [...direct.matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
    }
    if (!/^\w+$/u.test(direct)) return null;
    const alias = new RegExp(`export type ${direct} =\\s*([^;]+);`, "u").exec(types);
    if (alias === null) return null;
    const body = alias[1].replaceAll("\n", " ").trim();
    if (!/^\|?\s*"[^"]+"(\s*\|\s*"[^"]+")+$/u.test(body)) return null;
    return [...body.matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
  };

  for (const typeName of typeNames) {
    const kindMatch = new RegExp(
      `export type ${typeName} = Readonly<\\{[\\s\\S]*?kind: "(\\w+)"`, "u",
    ).exec(types);
    if (kindMatch === null) continue;
    const kind = kindMatch[1];
    const body = shared + (byKind.get(kind) ?? "");
    if (body === shared) continue;

    for (const field of fieldsOf(typeName)) {
      const members = membersOf(typeOf(typeName, field));
      if (members === null || members.length < 2) continue;

      // Every value this kind's builders write into the field. A bare string
      // literal is one arm; anything else is a parameter path and opens them
      // all — which is the state the fix for F180 put `form` into.
      let parameterised = false;
      const written = new Set();
      // **A shorthand property is an assignment and the walk could not see one.**
      // `{ state, height }` names a variable, which the third limit below already
      // says is trusted — but `field:` never matches it, so the field read as
      // written by *nothing*, and that is the same verdict as one arm reached.
      // Found by `b.status`, which hoists its decision so a tone literal is not
      // an object-literal value (SS45): the fix for one rule made the field
      // invisible to another. Anchored to an object-literal position — after `{`
      // or `,` — so a destructure or a type member is not read as a write.
      if (new RegExp(`[{,]\\s*${field}\\s*[,}]`, "u").test(body)) parameterised = true;
      for (const m of body.matchAll(new RegExp(`\\b${field}:\\s*([^,\\n]+)`, "gu"))) {
        const value = m[1].trim();
        const literal = /^"([^"]+)"/u.exec(value);
        if (literal === null) parameterised = true;
        else written.add(literal[1]);
      }
      if (parameterised || written.size === 0) continue;
      const missing = members.filter((v) => !written.has(v));
      if (missing.length === 0) continue;

      violations.push({
        rule: "MG28",
        file: "src/shell/builders/index.ts",
        message:
          `\`${kind}.${field}\` is a closed union of ${String(members.length)} and the ` +
          `builders write only ${[...written].map((v) => `"${v}"`).join(", ")} — ` +
          `${missing.map((v) => `"${v}"`).join(", ")} ${missing.length === 1 ? "is" : "are"} ` +
          `buildable by nothing public. MG27 passes this because the literal *mentions* the ` +
          `field; a value being reachable is a different question (F180)`,
        spec: "A03 §3, MG28",
      });
    }
  }
  return violations;
}

export function checkBuilderCoverage(
  files,
  readFile = (f) => readFileSync(f, "utf8"),
  omissions = BUILDER_OMISSIONS,
  never = BUILDER_NEVER,
) {
  const typesFile = files.find((f) => f.endsWith("src/data/viewmodel/types.ts"));
  const buildersFile = files.find((f) => f.endsWith("src/shell/builders/index.ts"));
  if (typesFile === undefined || buildersFile === undefined) return [];

  const types = readFile(typesFile);
  const builders = readFile(buildersFile);

  // **The `Block` union is the authority, never a `kind: "x"` literal.** The
  // first run of this scanned for the literal and invented three kinds:
  // `Hunk.lines[].kind` is `"add" | "remove" | "context"`, which is a line's
  // kind and not a block's (C04 I35's neighbour).
  const union = /export type Block =\n([\s\S]*?);\n/u.exec(types);
  if (union === null) return [];
  const typeNames = [...union[1].matchAll(/\|\s*(\w+)/gu)].map((m) => m[1]);

  const fieldsOf = (name) => {
    // **Brace-matched, and it was a non-greedy regex** (F430). `export type Rule
    // = Readonly<{ … }> & Gap;` is one line, so the body cannot be taken to the
    // first `}>` at column 0 — but taking it to the first `}>` *anywhere* ends
    // the body at the first nested `Readonly<{ … }>` on a line of its own, and
    // every field declared after one is invisible. Measured: 3 types, 6 fields —
    // `Table.showHeader`, `.emptyMessage`, `.actionBar`, `.presorted`,
    // `KeyValue.keyWidth` and `Hunk.collapsedBefore`.
    //
    // **The failure read as the inverse.** An invisible field never reaches
    // `unreached`, so the bidirectional arm below reports its `BUILDER_OMISSIONS`
    // entry as *stale* — "the builder now sets it" — about a field no builder
    // mentions at all. And `KeyValue.keyWidth`, the pin `keyValue`'s whole window
    // rests on, had no entry and was never asked for one.
    //
    // Counting braces handles both forms and has no first-closer to pick.
    const head = new RegExp(`export type ${name} = Readonly<\\{`, "u").exec(types);
    if (head === null) return [];
    let end = head.index + head[0].length;
    let braces = 1;
    while (end < types.length && braces > 0) {
      const ch = types[end];
      if (ch === "{") braces += 1;
      else if (ch === "}") braces -= 1;
      end += 1;
    }
    const m = [null, types.slice(head.index + head[0].length, end - 1)];
    let depth = 0;
    const out = [];
    for (const line of m[1].split("\n")) {
      const atTop = depth === 0;
      for (const ch of line) {
        if (ch === "(" || ch === "[" || ch === "{") depth += 1;
        else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
      }
      const f = /^\s*(\w+)\??\s*:/u.exec(line);
      if (f !== null && atTop && f[1] !== "kind" && f[1] !== "id") out.push(f[1]);
    }
    return out;
  };

  // Every builder returns through `finish`, which is where `gapBefore` is set,
  // so its body is part of each builder's reachable surface.
  //
  // **`export function` and `const … =` are collected too, and were not** (F406).
  // The walk matched `^function` alone, so an exported helper's body was sliced
  // into the function *above* it and its writes were attributed there. That is
  // silent in both directions — a field the helper sets reads as set by its
  // neighbour, and a neighbour that stopped setting one reads as still setting it.
  const bodies = new Map();
  const starts = [...builders.matchAll(/^(?:export )?(?:function|const) (\w+)/gmu)]
    .map((m) => [m.index, m[1]]);
  for (const [i, [pos, name]] of starts.entries()) {
    const end = i + 1 < starts.length ? starts[i + 1][0] : builders.length;
    bodies.set(name, builders.slice(pos, end));
  }
  const shared = (bodies.get("finish") ?? "") + (bodies.get("idOf") ?? "");

  // **From `finish<` onward, never the whole body** — the correction the
  // mutation pass forced, and without it this rule reports a gap once and then
  // goes blind to its own findings regressing.
  //
  // A builder's text mentions a field three times: in the spec parameter's type
  // annotation, in the destructure, and in the constructed literal. Only the
  // third sets anything. Deleting `...(sort === undefined ? {} : { sort })`
  // leaves the first two in place, so a whole-body search still saw the name and
  // MG27 stayed green on exactly the defect it was written for.
  //
  // The construction begins at `finish<`, and the annotation and destructure are
  // both above it, so the split needs no parser.
  const byKind = new Map();
  for (const [name, body] of bodies) {
    if (name === "finish" || name === "idOf") continue;
    const at = body.indexOf("finish<");
    const constructed = at === -1 ? body : body.slice(at);
    for (const m of constructed.matchAll(/kind: "(\w+)"/gu)) {
      byKind.set(m[1], (byKind.get(m[1]) ?? "") + constructed);
    }
  }

  const violations = [];
  /**
   * The fields a block gets from its intersected bases — `}> & Gap & Floor;`.
   *
   * **This was the literal string `"gapBefore"` spelled into the loop below**,
   * so the rule was exhaustive over the fields declared in a block's own braces
   * and knew about exactly one of the shared ones by name. `minHeight` arrived
   * on `Floor` and MG27 had no opinion about nineteen kinds carrying a field no
   * builder sets — the rule passing for the reason it exists to catch.
   *
   * F228's class in an enforcement rule: a hand-maintained list beside a
   * generated one, where the hand-maintained one reads as authoritative. Derived
   * now, so a third base type is covered on the day it is written.
   */
  const baseFieldsOf = (typeName) => {
    const m = new RegExp(`export type ${typeName} = Readonly<\\{[\\s\\S]*?\\n?\\}>([^;]*);`, "u").exec(types);
    if (m === null) return [];
    return [...m[1].matchAll(/&\s*(\w+)/gu)].flatMap((x) => fieldsOf(x[1]));
  };

  const unreached = new Set();
  const neverSeen = new Set();
  for (const typeName of typeNames) {
    const kindMatch = new RegExp(
      `export type ${typeName} = Readonly<\\{[\\s\\S]*?kind: "(\\w+)"`, "u",
    ).exec(types);
    if (kindMatch === null) continue;
    const kind = kindMatch[1];
    const body = shared + (byKind.get(kind) ?? "");
    for (const field of [...fieldsOf(typeName), ...baseFieldsOf(typeName)]) {
      // A field the *field* exempts, rather than a kind. Checked before the
      // per-kind list so one reason covers every kind carrying it.
      if (never[field] !== undefined) {
        neverSeen.add(field);
        if (new RegExp(`\\b${field}\\b`, "u").test(body)) {
          violations.push({
            rule: "MG27",
            file: "tools/enforce/module-graph.mjs",
            message:
              `BUILDER_NEVER names \`${field}\`, and the builder mentions it. The entry claims no ` +
              `builder *can* set it, so a builder that does makes the reason false rather than stale`,
            spec: "A03 §3, MG27",
          });
        }
        continue;
      }
      if (new RegExp(`\\b${field}\\b`, "u").test(body)) continue;
      const key = `${kind}.${field}`;
      unreached.add(key);
      if (omissions[key] !== undefined) continue;
      violations.push({
        rule: "MG27",
        file: "src/shell/builders/index.ts",
        message:
          `\`${kind}\` carries \`${field}\` and no builder sets it — a block field a consumer ` +
          `cannot reach is a surface the spec describes and the API does not. Expose it, or ` +
          `name it in BUILDER_OMISSIONS with the reason`,
        spec: "A03 §3, MG27",
      });
    }
  }

  // The same arm for the field-level list: an entry naming a field no block
  // carries is a reason with nothing to be about.
  for (const field of Object.keys(never)) {
    if (neverSeen.has(field)) continue;
    violations.push({
      rule: "MG27",
      file: "tools/enforce/module-graph.mjs",
      message:
        `BUILDER_NEVER names \`${field}\`, which no block kind carries. An exemption for a ` +
        `field that does not exist is vacuous, and reads as coverage`,
      spec: "A03 §3, MG27",
    });
  }

  // The bidirectional arm, as `UNCONSUMED_MEMBERS` has: an entry that is no
  // longer an omission is itself a violation, or the list stops being read.
  for (const key of Object.keys(omissions)) {
    if (unreached.has(key)) continue;
    violations.push({
      rule: "MG27",
      file: "tools/enforce/module-graph.mjs",
      message:
        `BUILDER_OMISSIONS names ${key}, which the builder now sets. Remove the entry: an ` +
        `exemption that outlives its reason is how the list stops being read`,
      spec: "A03 §3, MG27",
    });
  }
  return [
    ...violations,
    ...checkUnionReach(types, typeNames, fieldsOf, byKind, shared),
  ];
}

// --- MG3's type-only arm — the edge the rule could not see ------------------
//
// **The arm sees twenty-two type-only edges into `terminal/` and forbids none of
// them, which is the answer rather than a gap.** Measured when the arm was
// written, so the next person to widen it does not re-derive it — or worse, read
// legal edges as tolerated ones:
//
//     type-only imports into terminal/ from above L0     22
//       src/presentation  11 · src/shell  9 · src/index.ts  1 · src/testing  1
//     files above L0 type-importing BOTH halves          13
//       src/presentation   8 · src/shell  4 · src/index.ts  1
//     MG3's actual subject: an L0 half → the other half
//       runtime  0 · type-only  1   ← the entry below
//
// **None of the twenty-two is MG3's business and the rule's own name is why they
// look like they are.** MG3 forbids `data/` ↔ `terminal/`. L1 and L4 importing
// L0 is *downward* — MG1 permits it and `presentation/` could not do its job
// otherwise, since rendering C04's blocks onto a terminal means seeing both
// halves at once. A rule named for the class it forbids, read as forbidding a
// broader one. Third instance this pass of a rule whose **name** did work its
// **body** did not: MG24's "unconsumed member", this, and MG27's "coverage".
//
// **Zero violations from an arm that can see is a different result from zero
// from an arm that cannot** (F83, F127), and the count is what tells them apart.
// The one entry below is the only sideways edge in the tree; the fabricated pair
// in `enforce-rules.test.ts` is what makes its silence mean anything.
//
// The runtime edge stays forbidden in both directions. What crosses is a *name*,
// not a module: `data/` still builds without `terminal/` present as JavaScript,
// and the coupling is `tsc`'s alone.
const CROSS_HALF_TYPES = [
  {
    file: "src/data/adapters/types.ts",
    name: "TerminalCapabilities",
    reason:
      "C07 §3's ProducerContext grants a producer the *resolved* capability record (C07 I19). " +
      "The alternative is a second declaration of it inside data/, pinned by a test that " +
      "agrees with itself — two records of one fact, which is F124's defect one layer in. " +
      "The runtime edge stays forbidden, so data/ still builds with terminal/ absent",
  },
];

/** Every `import type` / `export type` in a file, as `{ names, spec }`. */
function typeOnlyImportsOf(file, readFile) {
  const src = readFile(file);
  const out = [];
  IMPORT.lastIndex = 0;
  let m;
  while ((m = IMPORT.exec(src))) {
    if (!isTypeOnly(m[1])) continue;
    const names = [...m[1].matchAll(/[A-Za-z_$][\w$]*/g)]
      .map((n) => n[0])
      .filter((n) => n !== "type" && n !== "as");
    out.push({ names, spec: m[2] });
  }
  return out;
}

/**
 * MG3, type-only. Bidirectional, on MG27's precedent: an allow-list entry whose
 * edge no longer exists is itself a violation, because an exemption that
 * outlives its reason is how the list stops being read.
 */
function checkCrossHalfTypes(files, readFile) {
  const violations = [];
  const seen = new Set();

  for (const file of files) {
    const from = layerOf(file);
    if (!from || from.rank !== 0) continue;
    for (const { names, spec } of typeOnlyImportsOf(file, readFile)) {
      const target = resolve(file, spec);
      if (!target) continue;
      const to = layerOf(target);
      if (!to || to.rank !== 0 || to.half === from.half) continue;

      for (const name of names) {
        const excused = CROSS_HALF_TYPES.find((e) => e.file === file && e.name === name);
        if (excused) {
          seen.add(`${excused.file}::${excused.name}`);
          continue;
        }
        violations.push({
          rule: "MG3", file,
          message:
            `crosses L0's halves type-only: ${from.half} → ${to.half} (${name} from ${spec}). ` +
            `A type-only edge erases at build and still makes this half un-type-checkable ` +
            `without the other, which is the property A02 §1 protects. Add a CROSS_HALF_TYPES ` +
            `entry with its reason, or declare the shape on this side`,
          spec: "A02 §1 · C07 I10 · A03 §3, MG3",
        });
      }
    }
  }

  // **Only over files this run actually walked.** MG27's arm can compare against
  // a constant; this one cannot, because the fabricated-violation harness passes
  // a single file and a stale-entry report would then fire on every check that
  // is not about this rule. The staleness question is only answerable when the
  // exempted file is in scope.
  const inScope = new Set(files);
  for (const entry of CROSS_HALF_TYPES) {
    if (!inScope.has(entry.file)) continue;
    if (seen.has(`${entry.file}::${entry.name}`)) continue;
    violations.push({
      rule: "MG3",
      file: "tools/enforce/module-graph.mjs",
      message:
        `CROSS_HALF_TYPES names ${entry.name} in ${entry.file}, which no longer imports it ` +
        `type-only. Remove the entry: an exemption that excuses nothing is how the next one ` +
        `gets in unread`,
      spec: "A03 §3, MG3",
    });
  }

  return violations;
}

// --- MG2 — no cycle within a layer ------------------------------------------
//
// **Inventoried since A03 was written and implemented by nothing until now.**
// A02 §1's sentence is *never upward, never cyclically within a layer*; MG1 is
// the first half and this is the second, and for the whole life of the project
// the second was carried by three named pairs — MG13, MG18, MG22 — each written
// on the day someone noticed one edge that would close a cycle. Those rows stay:
// they fire on the edge, one commit before the cycle exists, and this fires on
// the cycle. CLAUDE.md's *acyclicity is MG1 + MG22* was the honest description of
// the tree and not of the rule.
//
// **Module granularity, value imports only** — the same edges MG1 walks, so the
// two halves of the sentence read one graph. A type-only edge erases at build
// and closes no runtime cycle; MG3 counts them and says why it differs.
//
// **One real cycle on the first run, in L4**: `shell/paint.ts` imports
// `composite` from `composite.ts`, which imports `FrameError` and `exact` back
// from `paint.ts`. Both files are C22's and it works because ESM hoists — which
// is the shape A02 §1 forbids because it works until the day an initialiser is
// read before it runs. Acknowledged below rather than exempted: the list is
// compared by **equality**, so breaking the cycle fails here until the entry is
// removed, and a second cycle fails on the commit that closes it.
//
// **Stated blind spot: a cycle through a barrel is one edge short of visible.**
// `resolve` follows `./x.js` to `x.ts` and `./dir/index.js` to the barrel; a
// file importing its own component's barrel, which re-exports it, is a cycle
// this reports — and correctly, because ESM sees it too. What it cannot see is a
// cycle closed by a dynamic `import()`, which neither `IMPORT` nor `BARE`
// matches; none exist in `src/` today and one arriving is a decision worth a
// row of its own.

/**
 * Cycles known and not yet broken, keyed by their sorted members joined with ` <-> `.
 *
 * **`src/shell/composite.ts <-> src/shell/paint.ts` was here and is gone** —
 * the one cycle MG2 found on the day it was implemented, broken the same day by
 * `src/shell/frame-error.ts`, the leaf module its entry named as the fix. The
 * equality arm is what removed it.
 */
export const ACKNOWLEDGED_CYCLES = Object.freeze({});

/** Strongly connected components of the intra-layer value-import graph, Tarjan's walk. */
export function layerCycles(files, readFile = (f) => readFileSync(f, "utf8")) {
  const normalised = files.map((f) => f.replaceAll("\\", "/"));
  const byBare = new Map(normalised.map((f) => [bare(f), f]));
  const edges = new Map();
  for (const file of normalised) {
    const from = layerOf(file);
    if (!from) continue;
    const targets = new Set();
    for (const spec of importsOf(file, readFile)) {
      const resolved = resolve(file, spec);
      if (!resolved) continue;
      const target = byBare.get(bare(resolved)) ?? byBare.get(`${bare(resolved)}/index`);
      if (target === undefined || target === file) continue;
      const to = layerOf(target);
      if (!to || to.prefix !== from.prefix) continue;
      targets.add(target);
    }
    edges.set(file, [...targets]);
  }

  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const cycles = [];
  let counter = 0;
  const connect = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!index.has(w)) {
        connect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), index.get(w)));
      }
    }
    if (low.get(v) === index.get(v)) {
      const members = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        members.push(w);
      } while (w !== v);
      if (members.length > 1) cycles.push(members.sort());
    }
  };
  for (const v of edges.keys()) if (!index.has(v)) connect(v);
  return cycles.map((members) => members.join(" <-> ")).sort();
}

export function checkLayerCycles(
  files,
  readFile = (f) => readFileSync(f, "utf8"),
  acknowledged = ACKNOWLEDGED_CYCLES,
) {
  const violations = [];
  const found = new Set(layerCycles(files, readFile));
  for (const cycle of found) {
    if (acknowledged[cycle] !== undefined) continue;
    violations.push({
      rule: "MG2",
      file: cycle.split(" <-> ")[0],
      message:
        `imports CYCLICALLY within ${layerOf(cycle.split(" <-> ")[0])?.label ?? "a layer"}: ` +
        `${cycle}. A02 §1 — never cyclically within a layer. Break it with a leaf module, ` +
        `or acknowledge it in ACKNOWLEDGED_CYCLES with a reason`,
      spec: "A02 §1",
    });
  }
  // The equality arm. A cycle that has been broken leaves an entry excusing
  // nothing, and a list nobody prunes is one nobody reads.
  for (const cycle of Object.keys(acknowledged)) {
    if (found.has(cycle)) continue;
    violations.push({
      rule: "MG2",
      file: "tools/enforce/module-graph.mjs",
      message:
        `ACKNOWLEDGED_CYCLES names \`${cycle}\`, which is no longer a cycle — broken, renamed ` +
        `or gone. Remove the entry; the list is compared by equality on purpose`,
      spec: "A02 §1",
    });
  }
  return violations;
}

export function checkModuleGraph(files, readFile = (f) => readFileSync(f, "utf8")) {
  // MG2 is **not** folded in here, and the reason is its equality arm: run on a
  // fabricated two-file tree — which is what every MG1 and MG3 fire-test hands
  // this function — the arm would report the real acknowledged cycle as gone.
  // `checkOneStorePerComponent` and `checkFunctionConsumers` are separate calls
  // from `index.mjs` for the same reason, and MG2 joins them.
  const violations = [
    ...checkModeOwnership(files, readFile),
    ...checkCrossHalfTypes(files, readFile),
    ...checkPresentationEdges(files, readFile),
    ...checkForbiddenEdges(files, readFile),
     ...checkDevEntryIsolation(files, readFile),
    ...checkBuilderCoverage(files, readFile),
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
//
// --- THE GAP THIS RULE KNOWINGLY LEAVES, and it is deliberate ---------------
//
// **A consumer is a call in another FILE, not in another COMPONENT** — and the
// seam A02 Seam 4 describes is the component one. That is a real gap, chosen
// rather than overlooked, and it is here rather than only in FINDINGS because a
// deliberate gap recorded only in a finding goes quiet.
//
// Measured over 280 members, three definitions of *consumed*:
//
//   a bare name in another file      15 unconsumed   ← before F83; counted the
//                                                      implementing file as a
//                                                      consumer, so most of the
//                                                      tree passed vacuously
//   a CALL in another file           39 unconsumed   ← what this rule now does
//   a CALL in another component      76 unconsumed   ← A02 Seam 4 read literally
//
// **76 of 280 is 27% of the published surface** — 73 of 276 once F95 removed the
// phantom members, which changes nothing. A rule whose violation
// describes a quarter of the tree describes the architecture, not a defect, and
// the reason is F94: `export interface` marks three different things. Of the 38
// the component-scoped form produced, 24 were internal contracts called inside
// their own component, 11 were diagnostics called only by a test, 1 had an
// out-of-tree consumer, and **2 were the class this rule exists for**. An
// interface shared between two files of one component *must* be exported for
// TypeScript to permit it, so exporting is not evidence of anything.
//
// A component barrel was tried as the discriminator and fails on L4: 21
// components have an `index.ts` and `src/shell` has none, because nothing
// imports from the top — so every C22 and C23 interface would be exempted for
// the wrong reason.
//
// **So: gate on the narrow half, and this comment is the wide half.** The same
// line C24 I11 draws for the unused-export scan — *a reported signal rather than
// a build gate*. What it costs: a member consumed only inside its own component
// satisfies this rule. **Re-read it when a component's public surface becomes
// expressible**, because at that point the wide reading becomes checkable and
// this paragraph is the record of why it was not.
//
// **What it bought, stated so the trade can be judged:** 22 violations, and two
// of them were real user-visible defects that no test in either suite could
// reach — F96 (history never creates its directory, so it never persists on a
// fresh machine) and F97 (reverse search opens and cannot be typed into).

/** Members whose absence from the rest of `src/` is deliberate, each with why. */
export const UNCONSUMED_MEMBERS = Object.freeze({
  "EntryPiece.localFrom":
    "C22 §6l.4 D — the run-local row a window opens at, carried from `windowEntry` to " +
    "`renderEntryPieces` in the same file so the hook lands on the body's first row only. " +
    "The seam is between two functions of one module; `session.ts` holds the pieces without " +
    "reading this member, and T1.42 reads it through a window that opens inside the body",
  // **Three \`Basis\` members and five \`project3\` functions left here at once**,
  // on the commit that built \`plot3d\` — one loan, one symbol, one release,
  // which is what the equality arm makes possible and a membership check would
  // not. The entries said *until plot3d* and \`plot3d\` arrived.
  //
  // **Two of the eight did not leave, and their reason is a different one.**
  // \`Basis.forward\` and \`Basis.orthographic\` are read by \`project\` in the same
  // module, so they are consumed — MG24 asks whether a member is named
  // *elsewhere in \`src/\`*, and a record whose fields exist for one function is
  // exactly the shape that answers no. The type is exported because \`basisOf\`
  // returns it, not because a consumer is expected to read into it: a renderer
  // branching on \`basis.orthographic\` would be re-deciding what \`project\`
  // already decided. \`right\`, \`up\`, \`f\` and \`aspect\` are not here because
  // their names are shared with other owners, which is MG24's own stated blind
  // spot — so the rule reaches three of the seven fields and the record is one
  // thing either way.
  // **Two of the three left on the axis commit, and the third's reason held.**
  // \`axes3.ts\` reads \`basis.eye\` — the three signs the whole reference frame is
  // derived from — and \`basis.forward\`, to find where a segment crosses the near
  // plane. \`orthographic\` stayed: \`project\` picks the arm and a second reader of
  // that field would be a second place the projection is chosen, which is the
  // reason the entry was written with rather than a date.
  "Basis.orthographic": "project() picks the arm, and a second reader of this field would be a second place the projection is chosen",
  // The tool-call card's streamed body (`AGENT_TUI_DESIGN.md` §9c). `toolCallDoc` reads
  // it into a follow scroll. **Its producer landed and does not fill it** (C23 I54,
  // 2026-09-05, Lane P): the shell's pending entry is a `toolCallDoc`, and its body is
  // the entry's own appended blocks — a `ViewPatch` addresses the top level, and
  // `scroll.children` is not a patch target — so the follow-scroll body's consumer is
  // still `examples/agent`, at step 0. `toolCallDoc` and `RefreshDriver.readout` left
  // this list on the same ruling; this one stayed because the measurement said so.
  "ToolCallSpec.output": "read by toolCallDoc into a follow scroll (C04 I97); the shell's card body is the entry's appended blocks (C23 I54) and the caller that fills a scroll is the agent example, not yet built",

  // **`Skin` is `Basis`'s shape one carrier along**, and the same reading
  // applies: a record whose fields exist for one function, exported because
  // `trianglesOf` returns it on every `Tri3`. `skin.wire` *is* read outside —
  // `scatter3.ts` owns the paint policy, because it owns `ink`, `mark` and
  // `glyph` — and `skin.cull` is not, because the only question it answers is
  // asked inside `drawTri`.
  //
  // **A second reader would be a second cull**, which is the failure the sign
  // exists to prevent: the whole point of orienting from the signed volume is
  // that one place decides which side is out. And §6i row 14 rules that the
  // cull changes neither the extent nor the depth span, so the composition
  // layer has no question this field answers.
  "Skin.cull":
    "C12 I95, §6i rows 3 and 14 — `drawTri` asks the only question this answers, " +
    "and a second reader would be a second place the mesh's orientation is " +
    "decided, which is what the signed volume exists to make single. The " +
    "composition layer reads `skin.wire` because it owns the paint policy, and " +
    "has no use for this: the cull moves neither the extent nor the depth span.",

  // --- published ahead of the value that makes it readable ------------------
  //
  // **A single-value union has nothing for a consumer to branch on**, which is
  // A03 §2's vacuity class arriving in a field rather than in a rule. Reading
  // `block.graphLayout ?? "layered"` in the renderer would satisfy this gate
  // exactly and decide nothing — a check that cannot fire, dressed as one that
  // passes — so the exemption is taken instead of the fake read.
  "Plot.graphLayout":
    "C04 I70, C12 §3ai.2 — one value and one default, so nothing can branch on " +
    "it. The half that is NOT vacuous is the refusal, which `b.plot` enforces on " +
    "every other form and `validate.ts` on every document, and the compile error " +
    "it makes of `graphLayout: \"force\"`. It is published ahead of its second " +
    "value because adding it WITH `force` widens a union that did not exist, and " +
    "every exhaustive consumer becomes a compile error saying nothing about what " +
    "moved. **The expiry is a symbol**: `shiftInward` and the label taxonomy, " +
    "which is what `force` is refused on (F242). Grep it when picking this up.",

  // --- consumed, and not from `src/` ----------------------------------------
  //
  // **The first entry of a category the header already counted and had no
  // instance of** — *1 had an out-of-tree consumer*, measured over 280 members
  // and then not written down anywhere a reader would meet it.
  "ArtSpec.variants":
    "roadmap 22 — `art` is a builder an APP calls, on `mermaidCode`'s precedent, " +
    "so its only consumer is out of tree by construction: `examples/docker/src/" +
    "banner.ts` declares both variants and reads the chosen one. Wiring it inside " +
    "`src/` would mean the framework declaring somebody's art, which is the one " +
    "thing roadmap 22 rules the framework does not do. **This is roadmap 48's " +
    "subject from the other side**: the rule is scoped to `src/`, and a member " +
    "whose whole purpose is to be called from outside it cannot satisfy that scope " +
    "however many consumers it has",

  // **The second entry of that category, and it arrived by a satisfier going
  // away rather than by anything new being published** — which is the shape
  // worth reading twice.
  "NavigableRegistry.elementsOf":
    "C26 §5 — **an inverted seam**: `NavigableRegistry` is the structural shape " +
    "the conformance suite *takes*, so its implementers are a consumer's own " +
    "registries and are out of tree by construction. The suite calls the member " +
    "twice, at lines 116 and 168 of the file that declares it, and MG24 counts " +
    "names elsewhere in `src/` — the right direction for a published member and " +
    "the wrong one for a shape somebody else fills in. " +
    "**It was satisfied until F223 by a name collision.** C09's `BlockRegistry` " +
    "has an `elementsOf` too, and `registry.ts` called its own — " +
    "`this.elementsOf(block, atWidth)` inside `elementsIn` — so the walk counted " +
    "a mention of a different owner's member as a consumer of this one. Folding " +
    "the two element questions into a single resolution (C09 I30) removed that " +
    "call, and the exemption that had always been owed became visible in the same " +
    "commit. **This is F105/F160's recorded blind spot arriving as an instance**: " +
    "MG24 is exact for 490 of 1418 members and this member is one of the rest, so " +
    "the rule was reporting *consumed* about a name rather than about a member",

  // --- a field whose consumer is one commit away ----------------------------
  //
  // **The blocker is stated as a symbol, so picking this up begins by grepping
  // it** — a deferral whose condition is prose is one nobody watches. And
  // MG24's bidirectional arm is what makes this self-expiring rather than a
  // deferral at all: the day `rainColumns` names `grows`, this entry becomes a
  // violation in its own right.
  "Extent.grows":
    "C12 I34, I21 — **the deferral was discharged and the answer did not move, " +
    "which is the entry worth keeping.** This said the consumer was " +
    "`rainColumns`, two commits along; `rainColumns` landed, draws the vertical " +
    "raincloud's density with it, and MG24 still reports the member — because " +
    "it calls `extentFor(caps, \"leftward\")` and never touches `.grows`. The " +
    "condition was named as a symbol, the symbol arrived, and it was not the " +
    "condition the rule tests. " +
    "**So this is permanent and it is the rule's documented blind spot rather " +
    "than a wait**: a member read only inside its declaring file. `extentRun` " +
    "reads it, and a *renderer* reading it would be branching on direction, " +
    "which is the exact move the field exists to make unnecessary — the " +
    "vocabulary carries the direction so that a leftward run cannot be handed " +
    "rightward glyphs. A consumer outside `ramp.ts` would be evidence the design " +
    "had failed. T1.88 asserts the five mirrored levels it produces",


  // --- diagnostics: published to be read by a test, never by a component ----
  "LineEditor.killBuffer":
    "diagnostics, and already an explicit exception in C16 T2.14's non-editing list",
  "IdentityLoop.warned": "diagnostics; its own declaration says so and C22 T3.12 reads it",

  // **`LineEditor.selection` was here and is gone**, taken out by the equality
  // arm the moment roadmap entry 23's wash read it from `shell/session.ts`.
  // Recorded because the entry's own predictions were wrong twice: it first
  // named entry 15 step 3 as the consumer, and step 3 landed with MG24 silent,
  // because `copy()` reads the member *inside the declaring file*. The rule is
  // right; the predictions were not, and only the arm settled it.
  //
  // **And it sat here as a duplicate key for one commit.** Step 3's edit
  // inserted a corrected block without removing the original, so the object
  // literal carried two `"LineEditor.selection"` entries and `Object.freeze`
  // silently kept the last. `make enforce` was green throughout — a duplicate
  // key violates nothing this file checks — and it surfaced only when the arm
  // went to remove *the* entry and found two. **An edit script that asserts its
  // anchor matched still has to assert the old text is gone.**

  // **Four more, and comments were the only thing hiding them.** MG24 counted a
  // name inside a comment as a consumer until the day it stopped; these four
  // fired on the first run that stripped prose, in shipped code, alongside the
  // instance that found the trap. Each is observable state a test asserts and
  // no component reads — the same category as the two above, and each is used
  // only inside its own declaring file.
  // **A fifth of that category, and the seam it crosses is inside one file.**
  // MG24 asks whether a component is complete on its own side of a seam with
  // nothing on the other; `HorizonCell` is the output of `horizonGrid` and the
  // input of `horizonGlyph`/`horizonSpans`, which are the two halves of
  // `horizon.ts` — deliberately split so the band and the glyph are resolved by
  // different things, because computing them together is what let one alphabet
  // carry both (C12 I52, §3z). `band` and `sign` are named across the file's own
  // seam by `horizonBandT`; `eighths` is read only by the glyph half, so it is
  // the one member the rule can see.
  //
  // **The bidirectional arm makes this self-expiring**: the day anything outside
  // `horizon.ts` names `eighths`, this entry becomes a violation of its own.
  "HorizonCell.eighths":
    "C12 I52, §3z — sub-cell height, written by `horizonGrid` and read by " +
    "`horizonGlyph` in the same file, which is the internal seam the two-channel " +
    "split creates rather than a component boundary. `test/unit/plot-mutations.test.ts` " +
    "asserts it in HZ5 and T1.52, which is where the claim *a finite reading always " +
    "draws ink* is actually checkable",

  "FrameScheduler.contaminated":
    "C03 diagnostics — whether a frame was composed against a stale width. " +
    "`frame-scheduler.ts` sets and reads it; `test/revert/frame-scheduler.test.ts` " +
    "is the only outside reader, which is what a revert test is for",
  "InputRouter.lastStages":
    "C16 diagnostics — the dispatch trace for the last event, published so " +
    "`test/unit/router-dispatch.test.ts` can assert the ladder was walked in order. " +
    "A component reading it would be a second priority list, which C16 §8a rules out",
  "Rng.fork":
    "C08 — a child stream for a nested generator. The fixture recorder is the " +
    "specified consumer and records linearly today, so `fork` is a capability the " +
    "spec commits to with no caller; deleting it would remove the commitment",
  "TerminalLifecycle.suspended":
    "C01 diagnostics — whether the alternate screen is currently released for a " +
    "handoff. `lifecycle.ts` drives it and C21's integration test asserts it across " +
    "a real suspend, which is the only place the state is observable at all",

  // **The one violation the F159 widening produced, and it is this category
  // again.** 46 members entered the population when the walk stopped reading one
  // member per line; 45 were already consumed and this fired. Its declaration
  // said what it was before the rule could see it — `redact.ts:20`, *"which rule
  // fired, for T2.12 — a right answer through the wrong rule is a redactor about
  // to give a wrong one"* — so the exemption is the disposition rather than a
  // concession. `test/contract/history.test.ts:17` is the only reader.
  "Redaction.fired":
    "C20 diagnostics — which redaction rule matched, published so T2.12 can assert " +
    "the rule and not only the redacted string. A component reading it would be " +
    "acting on *why* text was redacted, which C20 §4 gives no meaning to",

  // --- published for a consumer outside this tree ---------------------------
  //
  // **C24 §7's document assertions, and this is the one category MG24 cannot
  // reason about.** Their consumer is an application repository, so "named
  // nowhere else in `src/`" is not evidence of an unwired seam — it is what a
  // published surface looks like from inside the package that publishes it.
  // C24 I11 already settles how that surface is measured: the unused-export
  // scan runs against `prism-tui` plus the reference app's declared import
  // manifest, and it is a reported signal rather than a build gate.
  //
  // The entries stay one-per-member rather than becoming a wildcard, because
  // the judgement is per member and the equality arm below is what stops it
  // being made once and inherited.
  "DocumentAssertions.isValid": "C24 §7, I13 — published for a consumer's suite (I11)",
  "DocumentAssertions.measuresCorrectly": "C24 §7, I13 — published for a consumer's suite (I11)",
  "DocumentAssertions.rendersAt": "C24 §7, I13 — published for a consumer's suite (I11)",
  "DocumentAssertions.degradesToAscii": "C24 §7, I13 — published for a consumer's suite (I11)",
  "DocumentAssertions.degradesTo1Bit":
    "C24 §7, I13 — B04's compliance sweep, and the method that earns the module. " +
    "Published for a consumer's suite (I11)",
  "DocumentAssertions.hasNoColourOnlyDistinction":
    "C24 §7, D29 — published for a consumer's suite (I11)",

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

  // --- diagnostics, second cohort: found when a CALL replaced a bare name ---
  //
  // **F83's fix is what surfaced these**, and the shape is worth stating once
  // for the group: the rule used to accept the file that *implements* the
  // interface as a consumer, so `types.ts` declaring `pending` and the
  // implementation writing `pending` closed the loop with nothing calling
  // anything. A property access is the discriminator.
  //
  // Every entry below is observable state or a probe that a test asserts and no
  // component calls — the same category as the cohort above, arrived at by a
  // rule that can now see it.
  "Rng.int":
    "C08 — the integer draw beneath the fixture generators. `rng.ts` uses it internally " +
    "and `test/unit/corpus.test.ts` asserts the stream is reproducible, which is the only " +
    "place a deterministic RNG is observable at all",
  "TransportRouter.busy":
    "C06 diagnostics — whether a route is in flight. **F83's own evidence, and it survived " +
    "its own removal**: `router.ts` records that a guard replaced it and `construct.ts` " +
    "counts seventeen call sites until it, so the tree documents the deletion twice and " +
    "the member is still declared. Kept listed rather than deleted until C06 rules, because " +
    "removing a member two comments describe as removed wants the spec edit first",
  "CompletionEngine.pending":
    "C19 diagnostics — whether a dynamic source is in flight, published so the spinner's " +
    "sequence-as-token-of-validity is assertable. `src/shell` reads the spinner state C19 " +
    "derives, not this",
  "FrameScheduler.pending":
    "C03 diagnostics — whether a commit is scheduled. Sibling of `contaminated` above and " +
    "listed for the same reason: `frame-scheduler.ts` drives it and a revert test is the " +
    "only outside reader",
  "LineEditor.displayRows":
    "C17 diagnostics — the wrapped row count, asserted by the prompt-window tests. The " +
    "shell measures the prompt through C09 rather than asking the editor, which is C17 §1's " +
    "rule that rendering stays outside the editor",
  "LineEditor.undoDepth":
    "C17 diagnostics — the undo stack's depth, so T2.x can assert `UNDO_LIMIT` without " +
    "reaching into the buffer. Sibling of `killBuffer` above",
  "LineEditor.redoDepth": "C17 diagnostics — the redo half of `undoDepth`, same disposal",
  "OverlayManager.hasView":
    "C15 diagnostics — whether a pushed view is on the stack. `src/shell` asks the overlay " +
    "for its `Placed` and never for this; the tests use it to assert push/pop pairing",
  "TranscriptStore.payloadOf":
    "C13 — an entry's payload by id, for tests asserting what a patch actually wrote. The " +
    "viewport reads entries through the view, not the store",
  "MeasurableRegistry.renderToLines":
    "C09 §7's conformance harness — its consumer is a *suite*, not a component. 34 test " +
    "files call it and no component may, because a second render path is C09 I1's " +
    "divergence. Same category as `DocumentAssertions.*` above",

  // --- published for a consumer outside this tree ---------------------------
  "Viewport.stats":
    "C14 — offset, total height and region, published for a scrollbar that does not exist " +
    "yet and **already consumed by the reference app**, which draws its own position " +
    "indicator from it. C24 I11's category: named nowhere else in `src/` is what a " +
    "published surface looks like from inside the package that publishes it",

  // --- used only inside its own declaring file ------------------------------
  "LocalRegistry.verbs":
    "C22 — `registry.ts:128` reads it in the reconciliation walk, in the same file that " +
    "declares it, and this rule skips the declaring file by design. Not a gap: a member " +
    "used where it is declared has no seam to be unwired across, and widening the rule to " +
    "see it would report every private helper on an exported interface",

  // --- specified and unbuilt, second cohort: each names its finding ----------
  //
  // **These are gaps, not exemptions**, and the difference is that each cites a
  // finding rather than a reason. They are listed so the suite is readable
  // rather than red, and the citation is what stops the entry outliving the
  // gap: when F96 and F97 close, the equality arm below fires on these the day
  // a caller appears.

  // --- C20 publishes a wider surface than the shell wires -------------------
  //
  // The same shape as F97 and less sharp, because each of these has a working
  // sibling the shell does call — `searchOlder` for `search`, `entries` for
  // `list`. Listed separately from the pair above rather than folded in: F97 is
  // a feature that cannot work, and these are alternatives to a path that does.
  // **Not investigated one by one**, and saying so is the entry's honest form —
  // a reason that overstates what was checked is how a list stops being read.
  "HistoryStore.search":
    "C20 — the query-setting entry point; the shell drives search through `searchOpen` and " +
    "`searchOlder` instead. Unverified whether both are intended to remain. F97's group",
  "HistoryStore.list":
    "C20 — filtered listing; the shell reads `entries`. Unverified. F97's group",
  "HistoryStore.listBlocks":
    "C20 — listing grouped into blocks, for a `/history` rendering nothing builds. F97's group",
  "HistoryStore.rerun":
    "C20 — re-execute a numbered entry. **No caller in `src/`; one test calls it.** F83 " +
    "reported this as *no caller at all*, which dropped the qualifier that makes the claim " +
    "true — the class F86, F89 and F92 already are, in a finding about the rule that would " +
    "have caught it. Needs the action dispatch route (F21) before anything can reach it",
  "HistoryStore.resetNavigation":
    "C20 — clears navigation state; the shell resets by submitting. Unverified. F97's group",
  "HistoryStore.clearConfirmLayer":
    "C20 — dismisses the clear-confirmation overlay; the shell dismisses via the router's " +
    "`dismiss` action. Unverified. F97's group",

  // === F84: the `export type` cohort ======================================
  //
  // The walk covers `export type X = Readonly<{ … }>` from F84, so 276 members
  // became 1055. Everything below was outside every rule in the suite until
  // then, and the group divides cleanly in two.

  // --- a reporting record whose consumer is a suite -------------------------
  //
  // **The `DocumentAssertions` category, arriving in the shape that produces
  // most of it.** A conformance report or a fixture diff exists to be asserted
  // against; a component reading one would be a second implementation of the
  // check. Each is consumed by `test/` or `tools/` and by no component, which is
  // what a reporting type looks like from inside the package that publishes it.
  "Delta.after": "C08 — a fixture diff's new value; `test/unit/fixtures.test.ts` asserts pairs",
  "FixtureDiff.deltas": "C08 — the diff's payload, read by the corpus tests",
  "CorpusDiff.matched": "C08 — corpus comparison tally, asserted by the corpus tests",
  // `CorpusDiff.changed` and `.removed` were here and are gone: `CHANGE_MARKERS`
  // in C09 has keys of both names, so this rule now reads them as consumed
  // (F105 — a name collision, not wiring). They remain genuinely unconsumed.
  // If the collision goes, MG24 fires again and they come back, which is the
  // entry re-earning its place rather than outliving its reason.
  "CorpusDiff.deltaCount": "C08 — as `matched`",
  "FixtureHandlerOptions.world": "C08 — the world a fixture handler runs against; `tools/` supplies it",
  "ProvenanceProblem.fixtureId": "C08 — which fixture a provenance problem names, asserted in test",
  "VerbRatio.recorded": "C08 — provenance tally, asserted in test. **Three siblings are dead: F99**",
  "VerbRatio.flagged": "C08 — as `recorded`",
  "CompletionResult.superseded": "C19 — the token-of-validity outcome; asserted at three tiers and never branched on by a component, which is C19 I13's whole point",
  // **`EngineOptions.onSourceError` and `SourceErrorSink.onSourceError` were
  // here and are gone** — both halves of one seam, unwired in the product until
  // `construct.ts` passed `createSourceErrorSink().onSourceError` (2026-09-03);
  // the equality arm removed them the day it did.
  // **`Graph.log` was here and is gone** — the equality arm removed it the day
  // it stopped being unconsumed.
  "Identity.user": "C22 — the identity record's fields, asserted by the identity tests. `SessionSnapshot` carries it and no component destructures it",
  "Identity.email": "C22 — as `user`",
  "Identity.groups": "C22 — as `user`",
  // `SgrStyle.inverse` was beside this one until entry 23 wired it: the
  // selection wash falls back to reverse video where there is no colour, so
  // `shell/paint.ts` names it and the equality arm took the entry out. **Two
  // exemptions expired by one change and only one was predicted** — which is
  // the arm doing the job the prediction could not.
  "FrameSchedulerOptions.windows": "C03 — per-reason coalescing windows, injected by six test files to drive the scheduler deterministically",
  "Finding.subject": "C09 §7 — boundary-conformance report field, asserted by the suite it exists for",
  "Finding.assertion": "C09 §7 — as `subject`",
  "Finding.means": "C09 §7 — as `subject`",
  "ConformanceReport.findings": "C09 §7 — as `subject`",
  "ConformanceReport.skipped": "C09 §7 — as `subject`, and the reference app reads it in five places",
  "ConformanceReport.kindsCovered": "C09 §7 — measurement-conformance coverage, asserted by the harness's own row",
  "ConformanceReport.exactness": "C09 §2a — how many windows were compared row for row and how many the EXACT_ROWS bound left out. A report, so its consumer is the row that reads it: `block-window.test.ts` asserts `read`, because a bound nobody can see reads as coverage",
  "Failure.check": "C09 §7 — measurement failure record, asserted by the harness",
  "ElementFailure.predicate":
    "C26 §5 — element-conformance failure record, asserted by the harness's own row. " +
    "Same disposal as `Failure.check` above and for the same reason: a conformance " +
    "report is read by the suite that runs it, not by `src/`",
  "ElementReport.agreements":
    "C26 I7 — the count of kinds declaring BOTH `window` and `elements`, which is " +
    "zero today and is asserted to be zero by T2.17. It exists so the vacuity is " +
    "reported rather than implied: the day a kind declares both, that row fails and " +
    "the agreement becomes live with nothing new to write",
  "ToolDef.oneShot":
    "C05 — **already documented at length as having no subject** (C22 §4). Correct " +
    "disposal, independently confirmed: the coverage audit reached it from the " +
    "`export type` side and C22 had ruled on it from the spec side",

  // --- dead everywhere, and each names its finding --------------------------
  //
  // **Ten members named nowhere in `src/`, `test/`, `tools/` or the reference
  // app.** `GlyphSet.warning` was the eleventh and `status` consumed it — the
  // equality arm fired on the commit that wired it, which is the expiry this
  // list was designed for rather than a maintenance chore. **The count in this
  // sentence is the fourth hand-maintained number to go stale today** (F228),
  // and it is here rather than derived because the entries are prose. Gaps, not exemptions — listed so the suite is readable rather than
  // red, and the citation is what makes the entry expire: the equality arm fires
  // the day any of them gains a consumer. FINDINGS F99.
  "GlyphSet.blocked":
    "**F99** — and this one is *semantic* rather than box-drawing, so a theme declaring " +
    "it gets nothing and the absence reads as a theme error rather than a missing renderer",
  // **`GlyphSet.bar` was here and MG24 can no longer see it.** It is still
  // unconsumed — nothing reads `g.bar`, the `▌`/`|` pair F99 recorded — but
  // `Cell.bar` landed and MG24 matches published members **by name**, so a read
  // of `cell.bar` clears an unrelated `GlyphSet.bar`. The rule reported itself
  // as *no longer unconsumed* and asked for the entry to be deleted, which is
  // correct about the entry and wrong about the member.
  //
  // This is F105/F160's blind spot arriving as a concrete loss rather than a
  // statistic: the exactness figure says 391 of 1231 members are uniquely named,
  // and `bar` left that set the day a second one appeared. Recorded here because
  // deleting the row is how the fact would otherwise disappear — the rule's own
  // sentence, *an exemption that outlives its reason is how the list stops being
  // read*, applied to the thing the exemption was about.
  //
  // **`VerbRatio.ratio` is the second instance and it widens the surface.** The
  // first was a member cleared by another *member* — one real name colliding
  // with another. This one was cleared by a **function parameter**: adding
  // `columnsForAspect(rows, ratio)` to `plot/aspect.ts`, a file that publishes
  // no member called `ratio` and consumes nothing, made this arm demand the
  // exemption's deletion. So the surface is not *other published members*, it is
  // *any identifier in `src/`* — and the gated arm asks for a **deletion**,
  // which is the direction that costs something: a false positive here does not
  // annoy, it instructs you to remove a guard that is working.
  //
  // `construct.ts:403` had already measured the same member matching a `ratio`
  // in `theme/index.ts` and refused the widened arm because of it. **The
  // mechanism was known and its effect on the reverse arm was not**, which is
  // the shape worth naming: a limit recorded about one direction of a rule says
  // nothing about the other until someone points it there.
  // **`Colormap.kind` is deliberately not here**, and the staleness arm is what
  // said so: MG24 matches member names across `src/` without regard to owner
  // (F136), and `kind` is on nearly every block type, so a `Colormap.kind` entry
  // is an exemption for something the rule never fires on. The member is real
  // and has no runtime branch yet — `sequential`, `diverging` and `cyclic` are
  // three different claims about the data and a diverging map used for
  // sequential data hides the sign — but that is a fact about the field, not a
  // reason for a row the list would have to keep forever.
  // **`Axis.ticks` was here and its exemption named its own expiry**: *it would
  // gain a consumer the day an x-axis picks its own ticks*. An x-axis now does —
  // `xAxis()` returns `tickColumns` and `frameBottom` marks the rule with them —
  // so MG24 reported the entry as outliving its reason, on the commit that met
  // the condition rather than whenever someone next read the list. That is the
  // deferral-expiry pattern working for once, and it worked because the entry
  // stated the blocker as something checkable instead of as "for now".
  "Ladder.serves":
    "**consumed by the type checker rather than by a statement.** `LADDERS` is a mapped type " +
    "over the axis and `LadderOf<E>` reads `Record<E, true>`, so a ladder under the wrong key " +
    "does not compile — the guarantee is the whole point and MG24 counts names in `src/`, which " +
    "a type position is not. Verified by trying it: putting the height ladder under `density` " +
    "is TS2322 (C12 I21, §3c)",
  "Ladder.substitutes":
    "**a record with no runtime reader, and that is the state rather than an oversight.** " +
    "`RAMP_ASCII` *is* density and *stands in for* height, and the distinction cost two defects " +
    "when it lived in a comment. As a field it is asserted by T1.28 and readable by a person; " +
    "no renderer branches on it, because none should — a substitution changes what a reader " +
    "infers, not what the code draws. It gains a consumer the day a legend says *ink weight " +
    "stands in for position here*, and until then MG24 is correct and this row is the answer",
  "Extent.encodes":
    "**`Pair.encodes`' row, for the fourth vocabulary** — the tag that makes an `Extent` " +
    "self-describing beside a `Pair` and a `Ladder`. Nothing branches on it because nothing " +
    "should: a renderer names an axis (I21) and the axis picks the vocabulary, so a branch here " +
    "would be the encoding rule inverted. It earns a consumer the day a second extent vocabulary " +
    "exists",
  "Extent.partials":
    "**as `solid`** — and the one whose direct use would be worst, because the wide arm has one " +
    "partial where the narrow arm has seven. A caller indexing this itself would be correct on a " +
    "narrow terminal and off by six steps on a wide one, which is F176's shape",
  "Pair.encodes":
    "**the tag that makes a `Pair` self-describing beside a `Ladder`**, and nothing branches on " +
    "it because there is one pair. Asserted by T1.29 and read by a person; it earns a runtime " +
    "consumer the day a second fill vocabulary exists, and MG24 is correct until then",
  "VerbRatio.derived":
    "**F99** — three of a five-field record are dead while `recorded` and `flagged` are " +
    "read, so the arithmetic producing them runs on every call and is discarded. A " +
    "partially-consumed record is invisible to every rule that asks about a *type*",
  "VerbRatio.authored": "**F99** — as `derived`",
  "VerbRatio.ratio": "**F99** — as `derived`, and it is the computed one",
  "EngineOptions.cache": "**F99** — an injectable cache nothing injects; C19 constructs its own",
  "Failure.actual":
    "**F99** — the measured value beside `expected`, which *is* read. A failure report " +
    "naming what was expected and not what happened is the half that makes it actionable",

});

/**
 * Every published object-type member under `src/`, with its owner.
 *
 * **Both keywords, since F84.** This walked `export interface` only, and the
 * codebase publishes object types both ways: 280 members behind `interface` and
 * **798 behind `export type X = Readonly<{ … }>`**, nearly three times as many,
 * outside the reach of every rule in the suite.
 *
 * Its own header used to justify the narrow scope — *a type alias is structural
 * and can be satisfied without being named* — which is true about **satisfying**
 * a type and irrelevant to **consuming a member of one**. The distinction the
 * sentence drew was real and it was not the one the rule needed, so the scope
 * excluded three-quarters of its subject while reading as deliberate. That is
 * this rule's scope failing the same way SP5's did three times: naming the form
 * thought to matter instead of covering the subject and excusing what does not
 * belong.
 *
 * Filed for the scope rather than the contents — the day it landed the widened
 * walk found no dead members at all, and **a rule whose clean result covers a
 * quarter of its subject means much less than it reads**, whatever it happens to
 * contain today.
 */
function interfaceMembers(files, readFile) {
  const out = [];
  for (const file of files) {
    // **Prose stripped before structure is read, not only before consumers are
    // counted.** `checkSeamConsumers` has stripped its *consumer* side since
    // MG25's trap was carried over, and the declaration side was never stripped
    // because a comment line begins `*` or `//` and could not match a member
    // pattern anchored at the start of a line. Segmenting at separators removes
    // that accident: a `,` inside a sentence starts a segment mid-prose, and
    // `CompletionEngine.synchronously`, `Pipeline.appended` and `TuiConfig.wired`
    // were the three phantoms the probe produced before this line existed. F159.
    const src = readFile(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const head =
      /export\s+(?:interface\s+([A-Za-z_$][\w$]*)\s*(?:extends[^{]*)?|type\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Readonly<)?)\{/g;
    let m;
    while ((m = head.exec(src))) {
      const owner = m[1] ?? m[2];
      // Which keyword published it — the two are consumed differently (F94).
      const record = m[1] === undefined;
      let depth = 1;
      let i = head.lastIndex;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}") depth -= 1;
        i += 1;
      }
      const body = src.slice(head.lastIndex, i - 1);
      // **Depth 0 only — a member sits directly in the interface body.**
      //
      // The line pattern alone also matches a *parameter* inside a multi-line
      // method signature, so `take(sourceId, key, ttlMs, run)` contributed four
      // phantom members to `CompletionCache` — and two of them reached the
      // violation list, where they read exactly like an unwired seam because no
      // such member exists to be consumed. Four of 280 in this tree, and every
      // one of them a name that can never be wired. FINDINGS F95.
      const member = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*(?:\??\s*[:(]|\()/;
      // **A member is a segment, not a line — F159.**
      //
      // The walk read one member per line, so `Readonly<{ a: string; b: string }>`
      // presented exactly one: `a`. Every later member of a single-line
      // declaration was outside the rule, and **40 published object types under
      // `src/` are declared on one line**, so what the rule watched was decided by
      // formatting. A fabricated unconsumed member passed `make enforce` clean
      // under both keywords and was caught only when the same alias was broken
      // across lines, which is how the blind spot was found at all.
      //
      // Segmenting at depth 0 on a newline **or a separator** subsumes the line
      // walk and keeps F95's guard for free: a parameter list sits inside `(`, so
      // depth never returns to 0 and `take(sourceId, key, ttlMs, run)` still
      // yields `take` alone. Every segment begins at depth 0 by construction,
      // which is what `atTop` used to assert.
      //
      // **Angle brackets are not tracked, and that is the stated limit.** `<` and
      // `>` cannot be depth-counted without `=>` and comparisons breaking it, so a
      // top-level comma inside `Map<string, number>` does split — into ` number>`,
      // which needs a `:` or `(` after the identifier and matches nothing. The
      // failure mode is a member *missed*, never one invented, and the comma arm
      // adds **0 members over the semicolon arm on this tree**: it is here because
      // `Readonly<{ a: X, b: Y }>` is legal, not because anything writes it today.
      let depth2 = 0;
      let seg = "";
      const flush = () => {
        const n = member.exec(seg);
        if (n !== null) out.push({ owner, name: n[1], file, record });
        seg = "";
      };
      for (const ch of body) {
        if (ch === "(" || ch === "[" || ch === "{") depth2 += 1;
        else if (ch === ")" || ch === "]" || ch === "}") depth2 -= 1;
        if (depth2 === 0 && (ch === "\n" || ch === ";" || ch === ",")) {
          flush();
          continue;
        }
        seg += ch;
      }
      flush();
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
  const unconsumed = new Set();
  const sources = new Map(files.map((f) => [f, readFile(f)]));

  // **Comments stripped before counting a consumer, as MG25 does.**
  //
  // MG25 was corrected for this and MG24 was not, and the instance that found
  // it is exact: `DocumentAssertions.measuresCorrectly` was reported consumed
  // on the strength of one sentence in `measurement-conformance.ts` explaining
  // that `expectDocument().measuresCorrectly(widths)` wraps it. Five sibling
  // members of the same interface fired and that one did not, which is the only
  // reason anybody looked.
  //
  // The trap is the same one MG25 records and it is worth restating here rather
  // than cross-referencing, because it is counter-intuitive in the direction
  // that matters: **a seam with no consumer is documented more than one that
  // works.** It accumulates prose in exactly the proportion that it lacks
  // calls, so a naive count reports the unwired member as consumed with the
  // highest confidence in the tree.
  const stripped = new Map(
    [...sources].map(([f, src]) => [
      f,
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"),
    ]),
  );

  for (const { owner, name, file, record } of interfaceMembers(files, (f) => sources.get(f) ?? "")) {
    const key = `${owner}.${name}`;

    // **A consumer CALLS the member; it does not merely name it.** F83.
    //
    // This matched a bare name until F83, so the file that *implements* the
    // interface counted as consuming it: `types.ts` declares `rerun()`,
    // `store.ts` writes `rerun() { … }`, and the rule read the implementation as
    // a consumer. Every member of every interface split across those two files
    // was consumed by construction — which is most of `src/`, and it is why the
    // rule sat green over `HistoryStore.rerun`, a method nothing in `src/` calls
    // at all.
    //
    // A property access is the discriminator, and it is the *narrow* half of
    // F83's fix. The wide half — a consumer outside the **component** rather
    // than the file — is A02 Seam 4 read literally and is reported by
    // `componentSeamSignal` below rather than gated on, because measuring it put
    // **76 of 280 members** outside a component boundary. A rule whose violation
    // describes 27% of the published surface is describing the architecture, not
    // a defect. C24 I11 already draws that line for the unused-export scan: a
    // signal too broad to gate on is reported, not enforced. FINDINGS F94.
    // **Two shapes of use, because F84 widened the walk to `export type`.**
    //
    // A property access is how an *interface* member is consumed — the producer
    // hands over an object and the consumer calls into it. A published **record**
    // is consumed the other way round: the consumer *builds* one, and
    // `{ placed: …, popLayer: … }` names the member without a dot in front of
    // it. Dot-access alone reported 82 violations over the widened walk, and
    // the great majority were deps records supplied by object literal — the same
    // false positive that a skip rule carried from interfaces produced during
    // the coverage audit, arriving again from the other end.
    //
    // So a construction counts. It is the looser of the two and it is the right
    // looseness: a member nobody accesses *and* nobody supplies is dead by both
    // routes, which is what the rule is asking.
    // **The test differs with the keyword, and that is F94's finding applied.**
    // An `interface` is implemented and *called into*: a property access is the
    // consumer. A `Readonly<{ … }>` record is *built*: `{ placed: …, popLayer: … }`
    // names the member with no dot in front of it, and dot-access alone reported
    // 82 over the widened walk, mostly deps records supplied by object literal.
    //
    // **Using both tests everywhere was measured and is worse.** The construction
    // pattern is loose — a bare `pending:` anywhere counts — and applying it to
    // interface members made four allow-listed entries read as consumed, which
    // the equality arm caught immediately. One test each, matched to how the
    // keyword is actually used.
    // **The looseness above has a measured instance and no cheap remedy
    // (F105).** A frozen marker table gained the keys `changed` and `removed`,
    // and two unrelated `CorpusDiff` members read as consumed — a name
    // collision, since this test matches names and not owners. The equality arm
    // caught it, which is the arm working.
    //
    // **Scoping the shorthand half to files that name the owner was tried and
    // is worse**: 19 new violations, and the pattern they share is the one this
    // arm exists for — a `*Deps` record built inline at a call site whose type
    // comes from the callee's signature and is never written down.
    // `ConstructDeps.repaint`, `KeyDeps.anchor`, `RefreshDeps.viewBlock`. The
    // obvious fix trades one false consumer for nineteen false violations.
    const consumer = record
      ? new RegExp(`[.?]\\s*${name}\\b|(?:^|[{,(\\s])${name}\\s*:`, "m")
      : new RegExp(`[.?]\\s*${name}\\b`);
    let consumed = false;
    for (const [other, src] of stripped) {
      if (other === file) continue;
      if (consumer.test(src)) {
        consumed = true;
        break;
      }
    }
    // Recorded before the allow-list is consulted, so the equality arm below can
    // see that a listed member is *still* unconsumed. Skipping early would make
    // every entry permanently justified by its own presence.
    if (!consumed) unconsumed.add(key);

    if (allowed[key] !== undefined) continue;
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

  // **The equality arm — MG25 had one and MG24 did not.**
  //
  // An allow-list checked by membership alone is one where an entry outlives
  // its reason: the member gets wired, the exemption stays, and the list grows
  // one incident at a time while reading as deliberate. Every list this project
  // has found too permissive failed this way — SS40's directory scope, CP6's
  // hand-written surfaces, MG25's constant-dominated first form. The entry that
  // keeps it honest is the reverse direction: a name here that is no longer
  // unconsumed is itself a violation.
  //
  // It only means anything because the loop above records `unconsumed` before
  // consulting the list.
  for (const key of Object.keys(allowed)) {
    if (unconsumed.has(key)) continue;
    violations.push({
      rule: "MG24",
      file: "tools/enforce/module-graph.mjs",
      message:
        `UNCONSUMED_MEMBERS names ${key}, which is no longer an unconsumed published ` +
        `member — it is either wired now or gone. Remove the entry: an exemption that ` +
        `outlives its reason is how the list stops being read`,
      spec: "A03 §3, MG24",
    });
  }

  return violations;
}

/**
 * **The wide reading of MG24, reported and not gated.** F94.
 *
 * A02 Seam 4 describes a *component* complete on its own side, and `checkSeamConsumers`
 * gates on a *file* — the narrow half, because the wide one puts 76 of 280 members
 * outside a component boundary and a rule that flags 27% of the published surface is
 * describing the architecture. This returns that measurement so the number stays visible
 * instead of living only in a finding, which is the disposal C24 I11 already uses for the
 * unused-export scan.
 *
 * **It is a count, not a verdict.** Most of what it counts is legitimate: an interface
 * shared between two files of one component must be exported for TypeScript to permit it.
 * What the number is good for is movement — a jump means a component grew a surface
 * nothing outside it reaches, and that is worth a look rather than a failure.
 */
export function componentSeamSignal(files, readFile = (f) => readFileSync(f, "utf8")) {
  const sources = new Map(files.map((f) => [f, readFile(f)]));
  const stripped = new Map(
    [...sources].map(([f, src]) => [
      f,
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"),
    ]),
  );
  const members = interfaceMembers(files, (f) => sources.get(f) ?? "");
  const withinComponent = [];
  for (const { owner, name, file } of members) {
    const home = componentOf(file);
    let crosses = false;
    for (const [other, src] of stripped) {
      if (componentOf(other) === home) continue;
      if (new RegExp(`[.?]\\s*${name}\\b`).test(src)) {
        crosses = true;
        break;
      }
    }
    if (!crosses) withinComponent.push(`${owner}.${name}`);
  }
  return { members: members.length, withinComponent };
}

/**
 * **How much of MG24's subject the rule is exact about — F105 and F160 as one class.**
 *
 * MG24 matches a member by **name**, not by `owner.name`, and that looseness runs
 * both ways. F105 measured the false-positive direction: a frozen marker table
 * gained the keys `changed` and `removed`, two unrelated `CorpusDiff` members read
 * as consumed, and the equality arm caught it. F160 is the same matching producing
 * the direction that does **not** announce itself:
 *
 *   a genuinely unconsumed member is satisfied the moment any unrelated type,
 *   anywhere in `src/`, declares a field with the same name and something reads it.
 *
 * **Two measured instances of one mechanism, so this closes the class rather than
 * the second instance.** What closes it is not a tightening — three were measured
 * and all three are rejected, with the figures, so nobody re-derives them:
 *
 *   scope the shorthand arm to files naming the owner   19 false violations (F105)
 *   key by (owner, name) exactly                        needs a receiver's TYPE;
 *                                                       no regex over source has it
 *                                                       — **and it would not key
 *                                                       uniquely if it did.** Three
 *                                                       owner names are declared
 *                                                       twice in `src/`: `Placed`
 *                                                       (`viewport/overlay/types.ts`
 *                                                       and `interaction/router/
 *                                                       router.ts`), `Token`, and
 *                                                       `ConformanceReport`. Seven
 *                                                       `owner.name` pairs collide,
 *                                                       which is exactly the gap
 *                                                       between the seam signal's
 *                                                       1157 and this function's
 *                                                       1150 — the two numbers print
 *                                                       on adjacent lines and this is
 *                                                       why they differ. F160 named
 *                                                       the looseness correctly and
 *                                                       its remedy assumed a
 *                                                       uniqueness the tree does not
 *                                                       have (C23 §8a A4's shape)
 *   restrict a consumer to import-reachable files       93 flagged, dominated by
 *                                                       the deps-injection pattern
 *                                                       that IS this architecture —
 *                                                       `keys.ts:658` calls
 *                                                       `deps.viewport.scrollToTop()`
 *                                                       and imports no viewport at
 *                                                       all. That member is C16 I23,
 *                                                       one of MG24's four founding
 *                                                       instances, so the arm's first
 *                                                       false positive is the rule's
 *                                                       own reason for existing
 *
 * So the closure is a **measurement, reported every run** — the treatment C24 I11
 * gives a signal too broad to gate on, and the treatment the seam signal above
 * already gets. This is exact and needs no type analysis: **a member name declared
 * by one owner is matched unambiguously, and the rule is exact about it.** A name
 * several owners declare is where a consumed verdict may belong to a sibling, and
 * that set is the blind spot's reach, computed rather than estimated.
 *
 * **The figure at the time of writing is 376 of 1150 — the rule is exact about 33%
 * of its subject**, and the shared names are the ones a new type is most likely to
 * carry: `id` (30 owners), `kind` (23), `text` (15), `capabilities` (13), `width`
 * (10). An unrecorded limit reads as strength, and this one was invisible for the
 * same reason F159's was: a clean run looks identical either way.
 *
 * **Why printed rather than filed.** F159 and F160 both came out of a claim written
 * in a comment that was still a belief. A number in prose is a snapshot with no
 * mechanism (F142); a number recomputed on every run moves when the tree does, and
 * a fall in exactness is a component having grown a surface named like everything
 * else — which is worth a look rather than a failure.
 */
export function nameExactnessSignal(files, readFile = (f) => readFileSync(f, "utf8")) {
  const sources = new Map(files.map((f) => [f, readFile(f)]));
  const members = interfaceMembers(files, (f) => sources.get(f) ?? "");
  const owners = new Map();
  for (const { owner, name } of members) {
    if (!owners.has(name)) owners.set(name, new Set());
    owners.get(name)?.add(owner);
  }
  const seen = new Set();
  let exact = 0;
  for (const { owner, name } of members) {
    const key = `${owner}.${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (owners.get(name)?.size === 1) exact += 1;
  }
  // The names most owners share, since *which* names collide is the actionable
  // half — a member called `id` is where the blind spot is certain to apply.
  const shared = [...owners]
    .filter(([, o]) => o.size > 1)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 5)
    .map(([name, o]) => `${name} (${String(o.size)})`);
  return { members: seen.size, exact, shared };
}

/**
 * **The public surface by use — roadmap 48, A03 §9.** Reported, never gated.
 *
 * F105 and F160 closed MG24's name-matching as a class: four tightenings
 * measured, four refused. What F160 left is a residue, and it named the shape
 * that could work — *a second consumer written from the public surface names
 * every field it uses, and the residue is the candidates, by **use** rather than
 * by name.* This is that measurement.
 *
 * **The same match, in the opposite direction, and that is the whole argument.**
 * MG24's verdict is *unconsumed*, so it needs the **cleared** side exact — and a
 * member is cleared the moment any unrelated type anywhere declares the name.
 * This verdict is *candidate*, so it needs the **listed** side exact — and a
 * collision can only ever clear. So the residue **under-reports and cannot
 * over-report**, which is what a set of candidates for a read wants and what a
 * gate cannot use. `ambiguous` is that figure, printed rather than filed for
 * F142's reason.
 *
 * **The blind spot, stated because an unrecorded limit reads as strength.** The
 * residue is exact about the claim it makes — *neither example names this
 * member* — and that claim is a **proxy** for use with one known gap: a builder
 * can set a field the app never names. `b.live` is the measured instance —
 * `examples/docker` uses the mechanism `ViewRefresh` declares and reaches it
 * through a builder whose own `LiveSpec` spells the field differently. So the
 * first question the read asks of a candidate is whether a builder covers it.
 *
 * Two further limits: the population is the types `src/index.ts` exports **as
 * types**, so a member reachable only through an exported *value* is out of
 * scope; and a member named only in an example's tests is neither cleared nor
 * listed, because a test names a field in order to assert it, which is evidence
 * about the surface rather than about use.
 */
export function publicSurfaceUseSignal(
  files,
  exampleFiles,
  readFile = (f) => readFileSync(f, "utf8"),
) {
  const strip = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  // The published population — the type names the runtime entry point exports.
  const entry = files.find((f) => f === "src/index.ts" || f.endsWith("/src/index.ts"));
  const published = new Set();
  if (entry !== undefined) {
    for (const m of strip(readFile(entry)).matchAll(/export\s+type\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(",")) {
        const n = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (n !== undefined && n !== "") published.add(n);
      }
    }
  }

  const sources = new Map(files.map((f) => [f, readFile(f)]));
  const members = interfaceMembers(files, (f) => sources.get(f) ?? "").filter((m) =>
    published.has(m.owner),
  );

  // A test row names a member to assert it exists; that is the surface, not use.
  const isTest = (f) => /(^|\/)tests?\//.test(f) || f.endsWith(".test.ts");
  const joined = (fs) => fs.map((f) => strip(readFile(f))).join("\n");
  const app = joined(exampleFiles.filter((f) => !isTest(f)));
  const tests = joined(exampleFiles.filter(isTest));

  // **MG24's looser test, for every member, and the keyword decides nothing
  // here.** MG24 picks the test by keyword for F94's reason — inside `src/` an
  // interface is called into and a record is built inline at a call site. That
  // split was measured against this population and **is false**:
  // `CompletionSource` is declared `export interface` and `examples/docker`
  // *builds* four of them by object literal, so under the split `slots`,
  // `dynamic`, `ttlMs` and `cacheKey` were false candidates — a residue that
  // over-reports, which is the one thing this signal claims it cannot do.
  //
  // The keyword says how the framework **declares** a type, and an app's use is
  // decided by what the type is *for*: a declaration is supplied, a handle is
  // called, and the entry point publishes both under both keywords. So the loose
  // test runs everywhere — justified by the cell above rather than by taste,
  // since a wrongly-cleared member only ever shortens the list.
  const uses = (src, { name }) =>
    new RegExp(`[.?]\\s*${name}\\b|(?:^|[{,(\\s])${name}\\s*:`, "m").test(src);

  const owners = new Map();
  for (const { owner, name } of members) {
    if (!owners.has(name)) owners.set(name, new Set());
    owners.get(name)?.add(owner);
  }

  const candidates = [];
  let cleared = 0;
  let ambiguous = 0;
  let testOnly = 0;
  const seen = new Set();
  for (const m of members) {
    const key = `${m.owner}.${m.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (uses(app, m)) {
      cleared += 1;
      if ((owners.get(m.name)?.size ?? 1) > 1) ambiguous += 1;
      continue;
    }
    if (uses(tests, m)) {
      testOnly += 1;
      continue;
    }
    candidates.push(key);
  }

  // Which owners the residue concentrates in is the actionable half: the read is
  // over strata — *what would an app have to do to reach this* — and an owner is
  // the closest thing to a stratum the signal can compute.
  const byOwner = new Map();
  for (const key of candidates) {
    const owner = key.slice(0, key.indexOf("."));
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
  }
  const concentrated = [...byOwner]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([owner, n]) => `${owner} (${String(n)})`);

  return { members: seen.size, candidates, cleared, ambiguous, testOnly, concentrated };
}


// --- MG29: an exported function whose argument cannot be built ---------------

/**
 * MG29 — a published function whose parameter type is interior (C24 I29, §8c).
 *
 * **A parameter whose type is not published makes the function itself
 * unusable, whatever the export list says**, and the failure is silent in the
 * direction that matters: the export *is* there and the signature *does*
 * resolve, right up to the moment a consumer has to supply the argument.
 *
 * `plotToSvg(given: Plot, theme: ResolvedTheme)` is the measured instance —
 * exported by name, described at the entry point as *the second renderer*, and
 * uncallable for a year because neither `ResolvedTheme` nor `loadTheme` was
 * published. It is the third of its class: `CompletionContext` came with
 * `completionContext` (C24 §8b) and `ProducerContext` with `producerContext`
 * (I26), each found by a consumer trying to use the thing.
 *
 * ## What it cannot see, stated because an unrecorded limit reads as strength
 *
 * - **Reachability, not usability, and this is the limit that hid the
 *   instance.** `ResolvedTheme` *was* reachable — `RenderContext.theme`, and
 *   `RenderContext` is published — so this rule would have cleared it. The route
 *   led into a synchronous `render`, which is the one place an SVG cannot be
 *   rasterised. **A route that exists and does not reach the caller who needs it
 *   is indistinguishable from a working one at this resolution**, and finding
 *   that needs a human writing the consumer, which is what §8c records.
 * - **Named types only.** Inline object literals, unions of literals and
 *   primitives are constructible by writing them out.
 * - **One level of reachability.** A type published as a member of a published
 *   type counts; a member of a member does not, which under-reports rather than
 *   over-reports.
 * - **A homonym on the subject side, closed.** The rule once matched
 *   `export function <name>(` in *every* file under `src/`, so publishing C06's
 *   `createRouter` reported C16's internal `createRouter` — two rows on
 *   `router/router.ts` for types that were never on the entry (F510's class,
 *   one side over). It now resolves each `export { name } from "<path>"` on the
 *   entry through that path and the barrels it names to the declaring module,
 *   and reads the signature there alone. What remains: a name published from
 *   two declaring modules is read in both, which is the right answer for a
 *   genuine double publication and would be a defect of its own.
 */
export function checkExportedArguments(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];
  const strip = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const entry = files.find((f) => f === "src/index.ts" || f.endsWith("/src/index.ts"));
  if (entry === undefined) return violations;
  const src = strip(readFile(entry));

  // The published type names, and the runtime names beside them.
  const published = new Set();
  for (const m of src.matchAll(/export\s+(?:type\s*)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const n = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (n !== undefined && n !== "") published.add(n);
    }
  }

  // One level out: a type named as a member of a published type is constructible
  // by holding the owner. Under-reports rather than over-reports, deliberately.
  const sources = new Map(files.map((f) => [f, strip(readFile(f))]));
  const reachable = new Set(published);
  for (const text of sources.values()) {
    for (const m of text.matchAll(/export\s+(?:type|interface)\s+(\w+)/g)) {
      if (!published.has(m[1])) continue;
      const at = m.index ?? 0;
      const body = text.slice(at, at + 4000);
      for (const f of body.matchAll(/^\s+(?:readonly\s+)?\w+\??:\s*([A-Z]\w+)/gmu)) {
        reachable.add(f[1]);
      }
    }
  }

  // Every exported function's parameter types, **from the module that declares
  // it** — resolved through the entry's re-export path and any barrel it names,
  // rather than matched by name across the tree.
  const byBare = new Map([...sources.keys()].map((f) => [bare(f), f]));
  const moduleOf = (from, spec) => {
    const target = resolve(from, spec);
    if (target === null) return undefined;
    return byBare.get(bare(target)) ?? byBare.get(`${bare(target)}/index`);
  };
  /** `declaring.get(publishedName)` → the set of files whose `export function` it is. */
  const declaring = new Map();
  const follow = (file, localName, publishedName, depth) => {
    const text = sources.get(file);
    if (text === undefined || depth > 6) return;
    if (new RegExp(`export\\s+(?:async\\s+)?function\\*?\\s+${localName}\\s*\\(`).test(text)) {
      if (!declaring.has(publishedName)) declaring.set(publishedName, new Set());
      declaring.get(publishedName).add(file);
      return;
    }
    for (const m of text.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
      for (const part of m[1].split(",")) {
        const [inner, outer = inner] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).map((x) => x.trim());
        if (outer !== localName) continue;
        const next = moduleOf(file, m[2]);
        if (next !== undefined) follow(next, inner, publishedName, depth + 1);
      }
    }
    for (const m of text.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
      const next = moduleOf(file, m[1]);
      if (next !== undefined) follow(next, localName, publishedName, depth + 1);
    }
  };
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    const from = moduleOf(entry, m[2]);
    if (from === undefined) continue;
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (t === "" || t.startsWith("type ")) continue;
      const [inner, outer = inner] = t.split(/\s+as\s+/).map((x) => x.trim());
      if (/^[a-z]/.test(outer)) follow(from, inner, outer, 0);
    }
  }
  const declaringFiles = new Set([...declaring.values()].flatMap((set) => [...set]));
  const publishedFrom = (file) =>
    new Set([...declaring].filter(([, set]) => set.has(file)).map(([name]) => name));

  const BUILTIN = /^(string|number|boolean|void|unknown|never|any|Promise|Array|Readonly|Partial|Record|Map|Set|URL|Error|Date|RegExp|NodeJS|Buffer|Uint8Array)$/;
  for (const [file, text] of sources) {
    if (file === entry || !declaringFiles.has(file)) continue;
    const names = publishedFrom(file);
    for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)) {
      const [, name, params] = m;
      if (!names.has(name)) continue;
      for (const p of params.split(",")) {
        // **The default value is not the parameter's type**, and taking it was
        // this rule's first defect: `layout: SvgLayout = SVG_DEFAULT_LAYOUT`
        // reported the constant. Caught on the first run, by reading what it
        // named rather than counting how many it found.
        const t = p.split(":").slice(1).join(":").split("=")[0];
        if (t.trim() === "") continue;
        for (const named of t.matchAll(/\b([A-Z]\w+)\b/g)) {
          const ty = named[1];
          if (BUILTIN.test(ty) || reachable.has(ty)) continue;
          violations.push({
            rule: "MG29",
            file,
            message:
              `\`${name}\` is exported and its parameter type \`${ty}\` is not — so the ` +
              `function resolves, and a consumer cannot supply the argument. Publish the ` +
              `type and whatever builds one, as \`completionContext\` and \`producerContext\` ` +
              `already are (C24 I29, §8c)`,
            spec: "A03 §3, MG29",
          });
        }
      }
    }
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
//      declaration. Prose mentions run the other way: `backoffOf` is named in
//      four comments and called nowhere, and a scan that counts them agrees the
//      seam is wired.
//
// **Stripping comments is not a refinement of this rule; it is what makes it
// correct at all.** The general trap, and it is worth stating for the next scan
// someone writes here: **prose about a mechanism inflates every textual signal
// of its existence.** A producer with no consumer is documented *more* than a
// working one — it is the thing that needs explaining, so it accumulates
// comments in the exact proportion that it lacks calls. A naïve occurrence
// count therefore does not merely miss `backoffOf`; it reports it consumed with
// the highest confidence in the tree. Any future rule counting textual
// occurrences inherits this, and the default in every grep-shaped tool is to
// count comments.
//
// **What MG25 does not catch**, stated because a rule whose limits are
// unrecorded reads as stronger than it is:
//
//   - **Name collisions.** It matches on names, so an unrelated declaration of
//     the same name reads as a call — `renderToLines` is the measured case, a
//     registry member of different arity in `measurement-conformance.ts`. MG24
//     has this hole for the same reason, and neither can close it without
//     resolving imports.
//   - **The reverse of a name collision**: a rule expressed twice with the
//     second expression unreachable. `isUsable` and `plotAreaWidth` are found
//     here, but only because they *look* like unconsumed producers. A duplicate
//     expression that happens to be called somewhere is invisible to any
//     import-graph tool, because the graph is exactly the thing that cannot see
//     that two callable things say one thing.
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
// **`isUsable` came off the list by being consumed, and the rule is what took it
// off.** C22's gate 3b calls it (C22 I61, F8), and the entry did not have to be
// remembered: the list is compared by equality, so `make enforce` refused the
// commit until the row went. That is the disposal MG25's own note asked for —
// *wire it or remove it* — rather than a second exemption. C01's inline test
// stays, because C01 is a component with its own consumers and must refuse
// whoever hands it an unusable record. The duplication is gone in the sense that
// mattered: the rule now has one *reachable* statement on the shell's path, and
// C01's is the floor under it rather than a second opinion nobody reads.
//
// Note that pair — one of it left — is a *different* class from MG24's: not a seam with no
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
  // **`createSourceErrorSink` was here and is gone** — wired by `construct.ts`
  // on 2026-09-03 (C19 T3.6's *logged once* given a place to log to, drained by
  // C22 §8 step 3), and the equality arm removed the entry the day it was.
  // **\`sampleGrid\`, \`unitOf\`, \`basisOf\`, \`createDepth\` and \`writeDepth\` were
  // here and are gone**, released by \`plot3d\` exactly as their reasons said.
  // Five entries, one symbol, one commit — and the equality arm is what turned
  // *the day it arrives* into a rule rather than a promise.

  // **Six entries left here at once, and the equality arm is what removed them.**
  //
  // The seven family emitters landed one commit at a time, each with the same
  // deferral: *the expiry is a symbol — `plotToSvg` walking a figure.* On the
  // commit that met it, `figureFor` called all seven and this rule refused every
  // exemption in the same run. That is the deferral discipline working
  // mechanically rather than by anyone remembering: an entry that excuses
  // nothing is how the next one gets in unread, so it cannot survive its own
  // condition being satisfied.
  //
  // `matrixFigure` was never here — `heatmapFormRows` consumed it on the day it
  // landed, and the entry written for it was refused then (C12 §3ak.7).

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
  //
  // **Empty, and that is the rule finishing what it started.** `assignOffsets`
  // and `backoffOf` were this section's founding entries and its whole argument:
  // a complete producer with no consumer, held here because deleting it would
  // remove a capability the specs commit to. The entries said *ships with
  // `b.live`*, and the equality arm below is what made that a promise rather
  // than a note — the day the driver called them, `make enforce` refused the
  // commit until the rows went. Neither had to be remembered.

  // --- a rule expressed twice, the second expression unreachable ------------
  plotAreaWidth:
    "C12 — `definition.ts` computes `areaWidth` inline across a three-rung ladder with " +
    "`MIN_AREA`, and this helper states the simple case. Two expressions of one width, " +
    "and the helper is the one no renderer calls. C12's to reconcile",
  // **`toolCallDoc` left here on 2026-09-05** (Lane P, C23 I54): the expiry was
  // *the first `src/` call*, and `execution.ts` step 3 is it — the pending entry
  // is the card. The entry was self-expiring by the equality arm, as written.
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
/**
 * MG26 — no module outside `testing/` and `fixtures/` imports them
 * (C24 I8, T2.3).
 *
 * `@fmx/calcium/testing` and `@fmx/calcium/fixtures` are dev-only entry points, and I8
 * says they are absent from a production bundle. Until C24 there was no
 * production bundle: with `src/index.ts` at `export {}`, nothing rooted the
 * graph, so the claim had nothing to be false about — A03 §2's vacuity class
 * holding an invariant open rather than a rule.
 *
 * **It was false the moment there was a root.** Three modules —
 * `shell/paint.ts`, `shell/composite.ts` and `shell/session.ts` — imported
 * `renderSequenceToLines` from `../testing/index.js`, and the built runtime
 * entry reached `dist/testing/index.js` and both conformance suites behind it.
 * Nothing was mislayered; L4 importing L1 is downward either way. The helper
 * was simply written where its first caller was, and its first caller was a
 * test. It lives in `presentation/render-lines.ts` now.
 *
 * **Stated flatly rather than as reachability from `src/index.ts`.** The first
 * version walked the graph from the runtime entry, which is how the defect was
 * found and is the wrong shape for a rule: a fabricated violation has no root,
 * so it matched nothing and would have passed on a real one presented alone —
 * A03 commitment 14 catching the rule rather than the tree. The flat claim is
 * also the stronger one, because a non-dev module importing the dev entry is
 * either shipping it or is dead code.
 *
 * **Type-only imports do not count, and that is the rule rather than an
 * exemption.** The claim is about what ships, and an `import type` erases at
 * build — `export type { WorldDriver }` puts no module in the bundle. This is
 * the one place in this file where erasure is the right answer; MG6 and MG19
 * both count type-only edges because their claims are about *dependency*, and
 * this claim is about *output*.
 */
export function checkDevEntryIsolation(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];

  for (const raw of files) {
    const file = raw.replaceAll("\\", "/");
    if (!file.startsWith("src/")) continue;
    // A dev module importing its own sibling is the point of the directory.
    if (file.startsWith("src/testing/") || file.startsWith("src/fixtures/")) continue;

    for (const spec of importsOf(file, readFile)) {
      const resolved = resolve(file, spec);
      if (resolved === null) continue;
      const target = resolved.replace(/\.js$/, ".ts");
      if (!target.startsWith("src/testing/") && !target.startsWith("src/fixtures/")) continue;

      violations.push({
        rule: "MG26",
        file,
        message:
          `imports ${spec} — \`testing/\` and \`fixtures/\` are dev-only entry points, and a ` +
          `module outside them that imports one puts it in the production bundle (C24 I8)`,
        spec: "A03 §3, MG27 · C24 I8, T2.3",
      });
    }
  }

  return violations;
}

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
