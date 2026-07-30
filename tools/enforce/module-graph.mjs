// A03 §3 — MG1..MG19. Imports go down only; L0's halves never touch.
import { readFileSync } from "node:fs";
import { layerOf } from "./layers.mjs";

/**
 * The rules this module actually implements — A03 §3 inventories twenty, and
 * seventeen of them wait on the components they govern. Declared as a list so
 * the vacuity suite can assert every one of them has been shown to fire; a rule
 * added here without a fabricated violation fails A03 commitment 14.
 */
export const MODULE_GRAPH_RULES = ["MG1", "MG3", "MG6", "MG10", "MG19", "MG20", "MG21", "MG22"];

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
      for (const spec of importsOf(file, readFile, true)) {
        const target = resolve(file, spec);
        if (target === null || !target.startsWith(edge.to)) continue;
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
