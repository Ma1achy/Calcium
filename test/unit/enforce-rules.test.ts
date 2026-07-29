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
import { readdirSync, statSync } from "node:fs";
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
    rule: "SS35",
    file: "src/data/manifest/types.ts",
    source: "export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E };",
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

  it.each(SCANS.map((s) => ({ id: s.id, scope: s.scope })))(
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
