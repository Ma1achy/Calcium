// A03 commitment 14 — every rule ships with a fabricated violation and asserts
// it fires, naming the rule.
//
// This is not belt-and-braces. A rule that matches nothing passes, and passing
// is what we look for: `make enforce` reports "no violations" identically
// whether the suite is clean or the suite is broken. Three ways that happens,
// and all three have happened here:
//
//   - **The pattern cannot match a real specifier.** MG20 compared a resolved
//     path against `src/terminal/escapes` while every NodeNext specifier ends
//     `.js`, so it matched nothing and reported compliance for a day.
//   - **The scope matches no files.** SS26 scopes to `src/data/process/` and the
//     tree has `src/data/process.ts` — a file, not a directory. `startsWith`
//     never matches, so "no writes to real process.stdout in the process
//     runner" has never once been checked.
//   - **A named entity does not exist.** MG20's `MODE_OWNERS` assigned
//     `SYNC_UPDATE` and `SCROLL_REGION` to C03 while `escapes.ts` exported
//     neither, so those rows could not fire whatever the tree contained.
//
// None of the three was a wrong rule. Each was a rule with nothing to be wrong
// about. The fabricated violation catches the first, the scope check the
// second, the existence check the third; no one of them catches the others,
// which is why all three are here (A03 §2, commitment 14).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkModuleGraph,
  modeOwnersAreReal,
  MODULE_GRAPH_RULES,
} from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans, SCANS } from "../../tools/enforce/source-scans.mjs";
import { checkDependencies, DEPENDENCY_RULES } from "../../tools/enforce/dependencies.mjs";

/** A file that must fail `rule`, at a path inside its scope. */
type Fabrication = { rule: string; file: string; source: string };

/**
 * One per implemented scan and module-graph rule. Each source is the smallest
 * thing that is genuinely the violation — not a string engineered to match the
 * regex, which would test the regex against itself.
 */
const FABRICATED: readonly Fabrication[] = [
  { rule: "SS1", file: "src/viewport/viewport.ts", source: "const at = Date.now();" },
  { rule: "SS10", file: "src/shell/session.ts", source: "const term = process.env.TERM;" },
  { rule: "SS11", file: "src/presentation/theme.ts", source: "const off = process.env.NO_COLOR;" },
  { rule: "SS14", file: "src/viewport/viewport.ts", source: 'const clear = "\\x1b[2J";' },
  { rule: "SS15", file: "src/presentation/table.ts", source: 'out.write("?1049h");' },
  { rule: "SS16", file: "src/data/viewmodel/index.ts", source: 'const fg = "#c0ffee";' },
  { rule: "SS17", file: "src/presentation/blocks/text.ts", source: 'const fg = "#c0ffee";' },
  {
    rule: "SS19",
    file: "src/presentation/theme/tokens-dark.ts",
    source: 'export const OK = "\\u001b[32m"; // 38;5;114',
  },
  {
    // SS20 and SS21 police scopes whose legitimate members do not exist yet —
    // `code.ts` and `patch.ts` arrive with C09 and C25. A rule over an empty
    // scope passes exactly like a satisfied one, so these fabrications are the
    // only thing currently proving either rule can fire at all.
    rule: "SS20",
    file: "src/presentation/blocks/table.ts",
    source: 'const style = resolve("syntax.keyword", theme, caps);',
  },
  {
    rule: "SS21",
    file: "src/viewport/transcript.ts",
    source: 'const style = resolve("spectrum.3", theme, caps);',
  },
  { rule: "SS23", file: "src/presentation/blocks/text.ts", source: "const w = label.length;" },
  {
    // SS40's own violation, and the reason it is not SS23 widened. The same
    // expression in the editor wants a different answer: `cells()` is a display
    // width and the cursor needs a grapheme index, so one rule would give one of
    // the two call sites the wrong advice at the moment someone reaches for the
    // quick fix.
    rule: "SS40",
    file: "src/interaction/editor.ts",
    source: "const end = buffer.length;",
  },
  {
    // The code-unit half, which `.length` alone does not cover.
    rule: "SS40",
    file: "src/interaction/editor.ts",
    source: "const ch = buffer.charAt(cursor);",
  },
  {
    // The shape an adapter author reaches for when a document wants a
    // timestamp column the far side did not send. It compiles, it reads
    // sensibly, and it makes the adapter untestable against a fixture.
    rule: "SS3",
    file: "src/data/adapters/docker.ts",
    source: "const seed = Math.random();",
  },
  {
    // The shape a world author reaches for when a run needs a plausible loss
    // curve. It reads perfectly well, and it makes every golden frame flake —
    // which is the failure C08 §3 describes and the reason SS2 spans all of
    // `src/` rather than only the fixture directory.
    rule: "SS2",
    file: "src/data/fixtures/rng.ts",
    source: "const jitter = Math.random() * 0.1;",
  },
  {
    // Not C08's file, deliberately. The rule is scoped to `src/` because a
    // jittered retry in the execution pipeline is the same defect wearing a
    // different coat, and a rule scoped to `fixtures/` would not see it.
    rule: "SS2",
    file: "src/shell/execution.ts",
    source: "const backoff = base + crypto.randomUUID().length;",
  },
  {
    // SS24 covers C11, C12 and C18. Two of the three scopes are real now, and
    // both are fabricated against below rather than one standing in for the pair:
    // the rule's `scope` is a list, and a list satisfied by its first entry is
    // the vacuity this file exists for.
    rule: "SS24",
    file: "src/presentation/table/plan.ts",
    source: "let lastPlan = null;",
  },
  {
    // C12's half. The cache someone reaches for is a memo of the last raster,
    // because downsampling 50,000 points looks expensive — and the height, which
    // is the only thing measured, never touches the data at all.
    rule: "SS24",
    file: "src/presentation/plot/scale.ts",
    source: "let lastRange = null;",
  },
  { rule: "SS26", file: "src/data/process/runner.ts", source: 'process.stdout.write(chunk);' },
  {
    // The exit-code half of SS25. A `switch` on the code, on the way to a
    // status, is the shape this rule exists to stop — C06 reports the number and
    // C07 decides what it means (C06 I2).
    rule: "SS25",
    file: "src/data/transport/subprocess.ts",
    source: "if (exit.exitCode === 2) return invalid;",
  },
  {
    // The envelope half. The information is right there, which is exactly why
    // someone builds one.
    rule: "SS25",
    file: "src/data/transport/fixture.ts",
    source: "const error: ErrorLike = { message: stderr };",
  },
  { rule: "SS28", file: "src/interaction/router.ts", source: "scheduler.invalidate();" },
  { rule: "SS33", file: "src/shell/execution.ts", source: 'console.error("failed");' },
  {
    rule: "SS34",
    file: "src/shell/session.ts",
    source: "render({ alternateScreen: true }, ui);",
  },
  {
    rule: "SS37",
    file: "src/presentation/blocks/notice.ts",
    source: '<Text color={style.colour}>{text}</Text>',
  },
  {
    rule: "SS36",
    file: "src/presentation/blocks/text.ts",
    source: 'const style = { colour: "#7faecf", bold: true };',
  },
  {
    // The literal an adapter author writes when a document needs a status
    // marker and the vocabulary is one token short. It compiles behind an
    // `as`, it looks right on the machine it was written on, and it has no
    // ASCII fallback.
    rule: "SS39",
    file: "src/data/adapters/docker.ts",
    source: 'blocks.push({ kind: "notice", tone: "error", glyph: "✗", text });',
  },
  {
    rule: "SS35",
    file: "src/data/manifest/types.ts",
    source: "export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E };",
  },

  {
    // The grace period, which is the form this arrives in. Nobody adds an
    // escalation ladder to C21; someone adds two seconds of politeness to
    // `killAll` and the timing policy exists in two places.
    rule: "SS27",
    file: "src/data/process/runner.ts",
    source: "setTimeout(() => handle.signal('SIGKILL'), 2000);",
  },
  {
    // And the other half: the ladder's own signal, named here rather than by a
    // caller. C21 delivers what it is given and names only `SIGKILL`.
    rule: "SS27",
    file: "src/data/process/stream.ts",
    source: 'const first = "SIGTERM";',
  },
  {
    // The read that would make I6 untestable again, and the one SS10 does not
    // cover.
    rule: "SS41",
    file: "src/data/process/runner.ts",
    source: "if (process.stdin.isRaw) throw new Error('suspend first');",
  },
  {
    rule: "MG1",
    file: "src/presentation/table.ts",
    source: 'import { scroll } from "../viewport/viewport.js";',
  },
  {
    rule: "MG3",
    file: "src/terminal/lifecycle.ts",
    source: 'import { open } from "../data/transport.js";',
  },
  {
    // The sideways edge no other rule sees. Both files are L0 data, so MG1's
    // layer walk reports it clean — and this is the *type-only* form, which
    // every other module-graph rule deliberately ignores. MG6 is the one place
    // an `import type` is an edge, because C06 I1 forbids the reference rather
    // than the emit.
    rule: "MG6",
    file: "src/data/transport/subprocess.ts",
    source: 'import type { ViewDocument } from "../viewmodel/types.js";',
  },
  {
    // The same sideways shape as MG6, one directory over, and in the form
    // someone would actually write it: asking C01 whether the terminal was
    // released reads as *more* correct than probing `stdin.isRaw`, which is
    // exactly why the rule counts a type-only import as an edge. L0's halves
    // are independent in what they know, not merely in what they emit.
    rule: "MG19",
    file: "src/data/process/runner.ts",
    source: 'import type { TerminalLifecycle } from "../../terminal/lifecycle.js";',
  },
  {
    rule: "MG20",
    file: "src/terminal/frame-scheduler.ts",
    source: 'import { ALT_SCREEN } from "./escapes.js";',
  },
  {
    // The edge C09 opens, and the two edits that would widen it. A value
    // import of anything in `terminal/` other than `escapes.js` fails; the
    // type-only form of the same import does not, and the case below asserts
    // that separately rather than assuming it.
    rule: "MG21",
    file: "src/presentation/blocks/notice.ts",
    source: 'import { detect } from "../../terminal/capabilities.js";',
  },
  {
    // The edge a reader would reach for: a plot inside an expanded table row
    // wants a width, and `planColumns` has one. Written as a type-only import
    // deliberately — that is the form that erases at build and passes every other
    // rule, which is why MG6 and MG19 both record that it counts here.
    rule: "MG22",
    file: "src/presentation/plot/definition.ts",
    source: 'import type { PlannedColumns } from "../table/plan.js";',
  },
];

const scanIds = SCANS.map((s) => s.id);
const implemented = [...scanIds, ...MODULE_GRAPH_RULES, ...DEPENDENCY_RULES];

function srcFiles(dir = "src", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) srcFiles(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

describe("A03 commitment 14 — no rule is assumed to work", () => {
  it("every implemented rule has a fabricated violation", () => {
    // The assertion that makes the commitment enforceable rather than a habit:
    // a rule added to SCANS or to either RULES list without a case below fails
    // here, on the commit that adds it.
    const covered = new Set([...FABRICATED.map((f) => f.rule), ...DEPENDENCY_RULES]);
    expect([...implemented].sort()).toEqual([...covered].sort());
  });

  it.each(FABRICATED)("$rule fires on a fabricated violation", ({ rule, file, source }) => {
    const read = (f: string): string => (f === file ? source : "");
    const violations = rule.startsWith("MG")
      ? checkModuleGraph([file], read)
      : checkSourceScans([file], read);

    const fired = violations.filter((v) => v.rule === rule);
    expect(fired, `${rule} matched nothing — it would pass on a real violation`).toHaveLength(1);
    expect(fired[0]!.spec, `${rule} must name the spec that declared it`).toBeTruthy();
  });

  it("MG21 permits escapes.js, and permits a type-only capability import", () => {
    // The half of the rule a fabricated violation cannot show. MG21 is only
    // useful if the two imports C09 §3 actually needs pass it: `sgr` at run
    // time, and `TerminalCapabilities` as a type. A rule that failed on those
    // would be reverted within the hour and the edge would stop being watched.
    const permitted = {
      "src/presentation/blocks/notice.ts": [
        'import { sgr, SGR_RESET } from "../../terminal/escapes.js";',
        'import type { TerminalCapabilities } from "../../terminal/capabilities.js";',
        "",
      ].join("\n"),
    };

    const violations = checkModuleGraph(
      Object.keys(permitted),
      (f) => permitted[f as keyof typeof permitted] ?? "",
    ).filter((v) => v.rule === "MG21");

    expect(violations, "the two imports C09 §3 requires must both pass").toEqual([]);
  });

  it("SS31 fires on a dependency with no entry in DEPENDENCIES.md", () => {
    const violations = checkDependencies({
      readFile: (f) =>
        f === "package.json"
          ? JSON.stringify({ dependencies: { "left-pad": "1.0.0" } })
          : "# Dependencies\n\n## Runtime\n\n| Package |\n|---|\n",
      exists: () => true,
      tree: [],
    }).filter((v) => v.rule === "SS31");

    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain("left-pad");
  });

  it("SS32 fires on an install script in the tree, and on our own manifest", () => {
    const dep = checkDependencies({
      readFile: (f) =>
        f === "package.json"
          ? "{}"
          : f === "DEPENDENCIES.md"
            ? ""
            : JSON.stringify({ scripts: { postinstall: "curl … | sh" } }),
      exists: () => true,
      tree: [["evil", "node_modules/evil"]],
    }).filter((v) => v.rule === "SS32");

    expect(dep, "a dependency's postinstall must fail the build").toHaveLength(1);
    expect(dep[0]!.file).toBe("node_modules/evil/package.json");

    const ours = checkDependencies({
      readFile: (f) =>
        f === "package.json" ? JSON.stringify({ scripts: { prepare: "husky" } }) : "",
      exists: () => true,
      tree: [],
    }).filter((v) => v.rule === "SS32");

    // `prepare` is deliberately not checked on dependencies — it never runs for
    // a published tarball — but it is checked on ours, where it would.
    expect(ours).toHaveLength(1);
  });

  it("SS32's named exceptions are exceptions, not blanket permission", () => {
    const violations = checkDependencies({
      readFile: (f) =>
        f === "package.json"
          ? "{}"
          : f === "DEPENDENCIES.md"
            ? ""
            : JSON.stringify({ scripts: { install: "node-gyp rebuild" } }),
      exists: () => true,
      tree: [
        ["node-pty", "node_modules/node-pty"],
        ["node-pty-fork", "node_modules/node-pty-fork"],
      ],
    }).filter((v) => v.rule === "SS32");

    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toContain("node-pty-fork");
  });
});

/**
 * The second half, and the one the fabricated violations cannot reach: a
 * fabrication is written at a path inside the declared scope, so it fires
 * whether or not that scope describes anything real.
 */
describe("A03 commitment 14 — every scope reaches the tree", () => {
  // Rules whose scope matches nothing today, each with the component that will
  // create it. An entry here is a rule that is NOT being enforced.
  // Empty, and that is the news. SS26 sat here from the day the rule was
  // written: it scoped to `src/data/process/` while the tree had
  // `src/data/process.ts`, a file, so it had never once been evaluated. C06
  // needed C21's interface, the interface landed as `src/data/process/types.ts`,
  // and the directory became real — at which point this list's own assertion
  // failed, which is what a pending entry is for.
  const PENDING: Record<string, string> = {};

  const files = srcFiles();

  // **Flattened per scope, not per rule.** SS24 has three scopes declared and had
  // one written down; a rule whose scopes are checked as a set would be satisfied
  // by any one of them matching, which is how two thirds of a rule stays vacuous
  // while its row reads as covered. Every scope answers for itself.
  it.each(
    SCANS.flatMap((s) =>
      (Array.isArray(s.scope) ? s.scope : [s.scope]).map((scope) => ({ id: s.id, scope })),
    ),
  )(
    "$id's scope $scope matches at least one file",
    ({ id, scope }) => {
      const matched = files.filter((f) => f.replaceAll("\\", "/").startsWith(scope));

      if (PENDING[id] !== undefined) {
        // The exemption is itself checked: when C21 lands and the scope becomes
        // real, this fails and the entry above must go. A pending list that
        // outlives its reason is how a rule stays unenforced silently.
        expect(matched, `${id} is listed pending but its scope now matches`).toHaveLength(0);
        return;
      }

      expect(matched.length, `${id} scans nothing — it cannot fail`).toBeGreaterThan(0);
    },
  );

  it("every MODE_OWNERS row names an export escapes.ts actually has", () => {
    // The third way a rule comes to have nothing to be wrong about, after an
    // unmatchable pattern and a scope matching no files: an ownership row for a
    // name that does not exist. The lookup can never hit, so the row reports
    // compliance whatever the tree contains — which is exactly what these rows
    // did while `SYNC_UPDATE` was unwritten (A03 §2).
    const OWNER_PENDING: Record<string, string> = {
      SCROLL_REGION: "waits on M-T6 — scroll-region acceleration is gated on measurement",
    };

    const { missing } = modeOwnersAreReal();

    for (const name of missing) {
      // The exemption is checked in the same direction as SS26's: when M-T6
      // lands and the export appears, this fails and the entry must go.
      expect(
        OWNER_PENDING[name],
        `MG20 owns ${name}, which escapes.ts does not export — that row cannot fire`,
      ).toBeDefined();
    }

    for (const name of Object.keys(OWNER_PENDING)) {
      expect(
        missing,
        `${name} is listed pending but escapes.ts now exports it`,
      ).toContain(name);
    }
  });

  it("the MODE_OWNERS existence check fires on a fabricated absent export", () => {
    // Fabricated the same way every other rule is: a tree in which the name is
    // genuinely gone, rather than a string built to fail the comparison.
    const withoutSync = modeOwnersAreReal(
      () => 'export const ALT_SCREEN = mode("a", "b");\nexport const CURSOR = mode("c", "d");\n',
    );

    expect(withoutSync.missing).toContain("SYNC_UPDATE");
    expect(withoutSync.missing).toContain("MOUSE");
    expect(withoutSync.exported).toEqual(["ALT_SCREEN", "CURSOR"]);
  });

  it("no scan's allow list exempts a path that does not exist", () => {
    // An allow entry pointing at a moved file silently widens nothing, but it
    // also documents an exemption that is no longer real — and the next reader
    // takes it as evidence the file is special.
    for (const scan of SCANS) {
      for (const allowed of scan.allow) {
        expect(
          files.some((f) => f === allowed || f.startsWith(allowed)),
          `${scan.id} allows ${allowed}, which is not in the tree`,
        ).toBe(true);
      }
    }
  });
});

/**
 * The third half, and the one neither of the others can reach.
 *
 * A fabricated violation proves a rule *can* fire; a scope check proves it has
 * something to fire *at*. Neither says anything about a rule that was written
 * down in A03 and never implemented — `checkSourceScans` iterates the rows it
 * has, so a missing row is not a rule that fails but a rule that is not there.
 * It appears in no report, and an unimplemented rule is indistinguishable from
 * a passing one in every report there is.
 *
 * That was SS3 for the whole life of the project: inventoried in A03, absent
 * from `source-scans.mjs`, and additionally scoped to a directory that was a
 * file. Two of A03 §2's four vacuity failures in one rule.
 *
 * So the inventory is asserted equal to what exists — implemented plus
 * explicitly pending. **A rule written down and never built fails on the commit
 * that writes it down**, which is the commit where someone still remembers what
 * it was for.
 *
 * **And it read `SS` rows only, for its whole life.** Adding an `MG` row to A03
 * and implementing nothing passed every gate — the check written to catch a rule
 * that cannot fire could not see two thirds of the inventory. That is the same
 * defect as a narrow scope (A03 §2, and the standing preference for a rule that
 * covers a family and names its exceptions over one whose pattern quietly
 * excludes what it never thought about).
 *
 * It now reads **every** rule family A03 tabulates, and the families divide in
 * two:
 *
 *   - `SS` and `MG` are implemented as data in `tools/enforce/`, so "implemented"
 *     is a set membership and the equality is exact in both directions.
 *   - `EX`, `TL`, `CP` and `SP` name a *test id* in their last column rather than
 *     a rule module — `C09 T2.6`, `B04 B4.3`. Asserting those exist is a
 *     different mechanism against a different corpus, and it is not built. Named
 *     here as an unchecked family rather than left to look covered, which is the
 *     whole subject of this file.
 */
describe("A03 commitment 14b — the inventory equals what is implemented", () => {
  /**
   * Rules inventoried in A03 and deliberately not implemented yet, each with
   * the component that will make them implementable. An entry here is a rule
   * that is NOT being enforced, and saying so is the point.
   */
  const PENDING_RULES: Record<string, string> = {
    SS4: "C13 — no transcript/",
    SS5: "C14 — no viewport/ rule yet",
    SS6: "C16",
    SS7: "C17",
    SS8: "C19",
    SS9: "C20",
    SS12: "C10 — folded into SS11's scope for now",
    SS13: "C14",
    SS18: "C10 — needs the block-producing module list",
    SS22: "C19",
    SS29: "C23",
    SS30: "C18, C19",

    // SS31, SS32 and SS38 were here, each saying "implemented in
    // dependencies.mjs, not source-scans.mjs" — which is not a pending rule but
    // an implemented one filed in the wrong drawer, and it survived because the
    // staleness check compared against `SCANS` alone. Three entries claiming a
    // rule was off while it was on. They are gone; `implemented` covers all
    // three modules.

    // MG2 is the one genuinely unimplemented rule in the family: no cycle within
    // a layer. Nothing blocks it — it is implementable against the tree today —
    // and it is listed here rather than quietly omitted because that is the
    // difference between a rule not yet built and a rule nobody remembers.
    MG2: "nothing — implementable today, and the general form of MG13/MG18",

    // The rest of the MG family, which this check could not see until it read
    // more than `SS` rows. Each waits on the component whose directory it scopes
    // to; none of these exists, so the rule would have nothing to match.
    MG10: "C13 — no viewport/transcript.ts",
    MG11: "C14",
    MG12: "C15",
    MG13: "C15",
    MG14: "C16",
    MG15: "C17",
    MG16: "C18",
    MG17: "C19",
    MG18: "C20",
  };

  /**
   * Rules A03 inventories that are enforced by a **test** rather than by a row in
   * `tools/enforce/`, each pointing at the file that carries it. A03's own
   * "Declared" column already names these — `C04 T2.9`, `C09 T2.11` — so the
   * mapping is read off the document rather than invented here.
   *
   * **This is a third category, and the distinction is load-bearing.** A03 §2
   * opens by saying the first four kinds are build gates "because a layer
   * violation merged and fixed later has already had time to be depended upon".
   * A rule enforced in the corpus tier is enforced — but not at the gate, and a
   * table that records only "implemented" cannot say which.
   *
   * Writing this list is what settled a question the plan got wrong: MG4, MG5,
   * MG7, MG8 and MG9 looked unimplemented from the enforce side and are not. They
   * had been enforced since their components landed, in the tier their spec row
   * names.
   */
  const TEST_ENFORCED: Record<string, string> = {
    MG4: "test/contract/view-model.test.ts",
    MG5: "test/contract/manifest.test.ts",
    MG7: "test/contract/adapters.test.ts",
    MG8: "test/contract/fixtures.test.ts",
    MG9: "test/contract/blocks.test.ts",
  };

  /**
   * The families implemented as data in `tools/enforce/`, and therefore the ones
   * this equality can be exact about. `EX`, `TL`, `CP` and `SP` rows name a test
   * id rather than a rule module — see the header.
   */
  const RULE_FAMILIES = /^\|\s*((?:SS|MG)\d+)\s*\|/;

  /** The ids A03 declares, read from the document rather than restated here. */
  function inventoriedRules(): readonly string[] {
    const doc = readFileSync("docs/architecture/A03_enforcement_suite.md", "utf8");
    const ids = new Set<string>();
    for (const line of doc.split("\n")) {
      const match = RULE_FAMILIES.exec(line);
      if (match?.[1] !== undefined) ids.add(match[1]);
    }
    return [...ids].sort();
  }

  /**
   * Every family that is implemented as data, in one set. `implemented` is the
   * module-level list the fabrication check already uses, so the two cannot drift
   * apart: a rule added to one is a rule this sees.
   */
  const implementedIds = new Set(implemented);

  it("A03 declares no rule id twice", () => {
    // **The check that could not see a duplicate, and it was found by making one.**
    // Every assertion in this block compares *sets*, so two rows carrying one id
    // collapse into a single member: a new ambient-read rule written as SS41 —
    // which C21 already holds — passed the missing-rule check, because the id it
    // was looking for was present for an entirely different reason. An
    // inventoried, unimplemented rule reported compliance, which is the failure
    // A03 §2 opens with, reached through the mechanism built to prevent it.
    //
    // Reads the rows rather than the id set, deliberately: the set is what cannot
    // see this.
    const doc = readFileSync("docs/architecture/A03_enforcement_suite.md", "utf8");
    const seen = new Map<string, number>();
    for (const line of doc.split("\n")) {
      const match = RULE_FAMILIES.exec(line);
      if (match?.[1] === undefined) continue;
      seen.set(match[1], (seen.get(match[1]) ?? 0) + 1);
    }
    const twice = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`);

    expect(
      twice,
      `${twice.join(", ")} — two rows with one id are one member of every set ` +
        `comparison below, so the second rule is invisible to all of them`,
    ).toEqual([]);
  });

  it("every rule A03 inventories is implemented, test-enforced or explicitly pending", () => {
    const missing = inventoriedRules().filter(
      (id) =>
        !implementedIds.has(id) &&
        TEST_ENFORCED[id] === undefined &&
        PENDING_RULES[id] === undefined,
    );

    expect(
      missing,
      `A03 inventories ${missing.join(", ")} and nothing implements them. ` +
        `An unimplemented rule reports compliance exactly like a satisfied one — ` +
        `implement it, add it to TEST_ENFORCED with the test that carries it, or ` +
        `add it to PENDING_RULES with its blocking component.`,
    ).toEqual([]);
  });

  it.each(Object.entries(TEST_ENFORCED))(
    "%s's test-enforced claim names it, in %s",
    (rule, file) => {
      // The claim, made checkable. "Enforced by a test somewhere" is the same
      // shape of assertion as a rule with no fabricated violation: believed,
      // never demonstrated. Requiring the rule id in the test's own name means
      // the link is discoverable from either end, and it fails if the test is
      // renamed away or the file is split.
      expect(readFileSync(file, "utf8")).toContain(rule);
    },
  );

  it("nothing listed pending has quietly been implemented", () => {
    // The other direction, for the same reason the scope list checks its own
    // exemptions: a pending entry that outlives its reason is a rule everyone
    // believes is unenforced, and nobody checks the ones they think are off.
    const stale = Object.keys(PENDING_RULES).filter(
      (id) => implementedIds.has(id) || TEST_ENFORCED[id] !== undefined,
    );

    expect(stale, `${stale.join(", ")} is listed pending but implemented`).toEqual([]);
  });

  it("nothing is listed pending that A03 does not inventory", () => {
    // The fourth direction, and it exists because writing this check found the
    // other three had a hole each. A pending entry for a rule no table declares
    // is a rule that will never be implemented and never be missed: the missing
    // check below cannot see it (there is no row), and the staleness check above
    // cannot either (it is not implemented). It is a rule that exists only in a
    // list of things not being done.
    const inventoried = new Set(inventoriedRules());
    const phantom = [...Object.keys(PENDING_RULES), ...Object.keys(TEST_ENFORCED)].filter(
      (id) => !inventoried.has(id),
    );

    expect(phantom, `${phantom.join(", ")} is listed pending but A03 has no row`).toEqual([]);
  });

  it("every implemented rule is inventoried in A03", () => {
    // And the last direction: a rule in the code with no row in A03 is a rule
    // no one specified, which is how the suite grows past what it can justify.
    const inventoried = new Set(inventoriedRules());
    const unspecified = implemented.filter((id) => !inventoried.has(id));

    expect(unspecified, `${unspecified.join(", ")} is enforced but not inventoried`).toEqual([]);
  });
});
