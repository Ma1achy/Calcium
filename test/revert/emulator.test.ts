// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9), tier 6.
//
// Each row names the change that makes it fail. They are assertions about the
// rows above: what the mutation pass checks mechanically, stated so a reader can
// see which row dies for which defect.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createEmulator } from "../../src/data/emulator/emulator.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { containText, lineOf, type LineLike } from "../../src/data/emulator/snapshot.js";
import { tickIntervalOf } from "../../src/presentation/blocks/animation.js";
import { terminalDefinition } from "../../src/presentation/blocks/kinds/terminal.js";
import type { MeasureFn } from "../../src/data/viewmodel/index.js";
import { degradeColour } from "../../src/presentation/theme/colormap.js";
import { b } from "../../src/shell/builders/index.js";
import { MONO_CAPS, measurable, visible } from "../support/render.js";

/** The child measurer a container would use; this kind never calls it. */
const noChildren: MeasureFn = () => 0;

/** A hand-built buffer line, so the walk can be driven without the dependency. */
const lineFrom = (
  cellSpecs: readonly Readonly<{ chars: string; width?: number; fg?: number; bold?: boolean }>[],
): LineLike => ({
  length: cellSpecs.length,
  getCell: (x) => {
    const spec = cellSpecs[x];
    if (spec === undefined) return undefined;
    return {
      getChars: () => spec.chars,
      getWidth: () => spec.width ?? 1,
      getFgColor: () => spec.fg ?? 0,
      getBgColor: () => 0,
      isFgRGB: () => false,
      isBgRGB: () => false,
      isFgPalette: () => spec.fg !== undefined,
      isBgPalette: () => false,
      isFgDefault: () => spec.fg === undefined,
      isBgDefault: () => true,
      isBold: () => (spec.bold === true ? 1 : 0),
      isDim: () => 0,
      isItalic: () => 0,
      isUnderline: () => 0,
      isInverse: () => 0,
      isStrikethrough: () => 0,
    };
  },
});

describe("C27 terminal emulator — tier 6", () => {
  it("T6.1 (C27 I2): removing the replacement → T2.4 admits a control", () => {
    // The row this protects: the gate is the only thing between a child's bytes
    // and a renderer that does not strip.
    expect(containText("a\u001b[31mb")).not.toContain("\u001b");
    expect(containText(`a${String.fromCharCode(0xd800)}b`)).toBe("a?b");
  });

  it("T6.3 (C27 I5): emitting a run for default-styled cells → T1.2 counts four runs, not three", () => {
    const line = lineOf(lineFrom([{ chars: "a" }, { chars: "b", fg: 2 }, { chars: "c" }]));
    expect(line.runs).toEqual([{ from: 1, to: 2, fg: { kind: "ansi16", index: 2 } }]);
  });

  it("T6.4 (C27 I6): including a wide cluster's filler → T1.4's no-empty-character assertion fails", () => {
    const line = lineOf(lineFrom([{ chars: "漢", width: 2 }, { chars: "", width: 0 }, { chars: "x" }]));
    expect(line.text).toBe("漢x");
  });

  it("T6.5 (C27 I7): counting dropped from line feeds → T1.6 reads 30, not 7", async () => {
    const term = createEmulator({ cols: 20, rows: 4, scrollback: 20 });
    for (let i = 1; i <= 30; i += 1) await term.write(`line ${String(i)}\r\n`);
    // The relation, restated where a feed-counting implementation would differ:
    // 30 feeds, 24 rows kept, 7 gone — never 30, and never 6.
    expect(term.dropped).toBe(7);
    term.dispose();
  });

  it("T6.6 (C27 I4): returning rows lines in lines mode → T1.1 has four lines for one write", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await term.write("one");
    expect(term.snapshot("t").lines).toHaveLength(1);
    term.dispose();
  });

  it("T6.7 (C27 I8): storing the title on the block → T2.3's deep-equal fails", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await term.write("\u001b]0;renamed\u0007x");
    expect(Object.keys(term.snapshot("t"))).toEqual(["kind", "id", "cols", "screen", "lines", "cursor"]);
    term.dispose();
  });

  it("T6.8 (C27 I12): snapshot after dispose returning the last value → T3.7 fails", async () => {
    const term = createEmulator({ cols: 10, rows: 2 });
    await term.write("x");
    term.dispose();
    expect(() => term.snapshot("t")).toThrow();
  });

  it("T6.10 (C27 I10): applying the cap before the reflow → T1.7 loses a line", async () => {
    const term = createEmulator({ cols: 40, rows: 4, scrollback: 8 });
    await term.write(`${"y".repeat(120)}\r\n`);
    const before = term.snapshot("t").lines.map((l) => l.text).join("");
    term.resize(20, 4);
    expect(term.snapshot("t").lines.map((l) => l.text).join("")).toBe(before);
    term.dispose();
  });
});

describe("C04 — the terminal kind, spec-first rows", () => {
  const term = (over: Record<string, unknown> = {}): unknown => ({
    kind: "terminal",
    id: "t1",
    cols: 80,
    screen: "lines",
    lines: [{ text: "ok" }],
    ...over,
  });
  const errs = (block: unknown): readonly string[] => {
    const v = validateDocument({
      schema: "tui.view/1",
      command: "!pytest",
      status: "ok",
      meta: {
        verb: null, adapter: "shell", stderr: "", exitCode: 0, durationMs: 12,
        truncated: false, argv: ["pytest"], transport: "subprocess", origin: "user",
      },
      blocks: [block],
    });
    return v.ok ? [] : v.error;
  };

  it("T6.96 (C04 I110): dropping the control check admits an escape, and the escape reaches the outer terminal", () => {
    // **The revert**: take C27 I2 as sufficient. It is true that the emulator
    // replaces controls at the cell walk, and it is the wrong reason to drop
    // this — a `terminal` can arrive from a far side that never ran C27, which
    // is the whole case the second gate is for. The failure is not a rendering
    // defect: a terminal line is emitted *without stripping*, so `\x1b[31m` in
    // one would leave the block and colour the rest of the session's screen.
    expect(errs(term({ lines: [{ text: "red\u001b[31mhere" }] })).join(" "), "refused today").toContain(
      "control character",
    );
    // The half that says the rule is about controls: the same shape without one.
    expect(errs(term({ lines: [{ text: "red[31mhere" }] })), "and the ordinary text is not").toEqual([]);
  });

  it("T6.97 (C04 I111): admitting adjacent equal-styled runs makes two snapshots of one screen stop comparing equal", () => {
    // **The revert** reads as tidying — an adjacency check is not obviously a
    // correctness rule, and merging costs the producer something. What it costs
    // the consumer is diff stability: `[0,3)` + `[3,6)` bold and `[0,6)` bold
    // paint identically and are different values, so an unchanged screen
    // snapshotted twice compares unequal and every frame redraws.
    expect(
      errs(term({ lines: [{ text: "abcdef", runs: [{ from: 0, to: 3, bold: true }, { from: 3, to: 6, bold: true }] }] })).join(" "),
      "adjacent and equal is refused",
    ).toContain("adjacent runs share a style");
    // The control the revert would leave passing: adjacency alone is fine.
    expect(
      errs(term({ lines: [{ text: "abcdef", runs: [{ from: 0, to: 3, bold: true }, { from: 3, to: 6, italic: true }] }] })),
      "adjacent and different is maximal",
    ).toEqual([]);
  });

  it("T6.98 (C04 I113): allowing dropped: 0 draws a marker row reading zero lines dropped", () => {
    // **The revert**: `dropped < 0` instead of `dropped < 1`, which is the
    // natural bound for a count. `dropped` is declared **by presence**, so zero
    // is not *none* — it is a marker row above the scrollback saying nothing was
    // lost, which is the one thing a marker never needs to say.
    expect(errs(term({ dropped: 0 })).join(" "), "zero is refused").toContain("positive integer");
    expect(errs(term({ dropped: 1 })), "and one is the smallest thing worth drawing").toEqual([]);
  });
});
describe("C09 · C10 — the terminal block and a literal colour", () => {
  it("T6.99 (C09 I55): a wrapped measure → T1.29's long row measures more than one", () => {
    // The row that dies: a 200-character line at width 80 is one row, and a
    // wrapping measure makes it three — a tail that reflows on content.
    expect(terminalDefinition.measure(b.terminal(80, [{ text: "x".repeat(200) }]), 80, noChildren)).toBe(1);
  });

  it("T6.100 (C09 I56): a stripping renderer → T3.73's text loses characters", () => {
    const painted = measurable({}).renderToLines(b.terminal(20, [{ text: "a?b" }]), 20);
    expect(visible(painted[0] ?? "")).toContain("a?b");
  });

  it("T6.101 (C09 I57): animating the kind → T2.122's cadence stops being null", () => {
    expect(tickIntervalOf(b.terminal(20, [{ text: "x" }]))).toBeNull();
  });

  it("T6.95 (C10 I38): an ansi16 round trip → the child's red becomes ours", () => {
    // A hex round trip would map index 1 (#800000) onto its nearest, which is
    // itself — so the row that catches the defect is a colour whose nearest is a
    // different index: 8 (#808080) resolves to 7 (#c0c0c0) if it goes through.
    expect(degradeColour({ kind: "ansi16", index: 8 }, { colourDepth: 4 })).toEqual({
      kind: "ansi16",
      index: 8,
    });
  });

  it("T6.96 (C10 I38): dropping the attributes at 1-bit → an inverse cursor vanishes", () => {
    const block = b.terminal(20, [{ text: "abc" }], { cursor: { line: 0, col: 1 } });
    const line = measurable({ capabilities: MONO_CAPS }).renderToLines(block, 20)[0] ?? "";
    expect(line).toMatch(/\u001b\[(?:[0-9;]*;)?7(?:;[0-9;]*)?m/u);
  });
});

describe("C21 — the PTY port, spec-first rows", () => {
  it("T6.15 (C21 I16): falling back to spawnShell when no factory is injected → the throw becomes a handle", () => {
    // The fallback's signature is not that `spawnPty` stops throwing — it is
    // that **a child appears**. So the assertion is on `live`, which is the one
    // place a silently substituted pipe would be visible.
    const runner = createProcessRunner({ env: {}, stdin: {} });
    expect(() => runner.spawnPty("sleep 5", { cwd: () => "/w", cols: 80, rows: 6 })).toThrow();
    expect(runner.live, "no pipe was started in its place").toEqual([]);

    // And the second half of the deferral — *with no cause*. A fallback that
    // also logged would still fail this: the caller holds the message.
    let said = "";
    try {
      runner.spawnPty("sleep 5", { cwd: () => "/w", cols: 80, rows: 6 });
    } catch (err) {
      said = err instanceof Error ? err.message : String(err);
    }
    expect(said, "the field a consumer sets").toContain("TuiConfig.pty");
  });

  it("T6.16 (C21 I15): importing node-pty in runner.ts → the package becomes a runtime dependency", () => {
    // T2.8 scans all of `src/`; this row names the file the revert names, and
    // adds the half a source scan cannot see — **which section of the manifest
    // the package sits in**. An import in `runner.ts` with the dependency still
    // in `devDependencies` is a clean clone that installs and then throws
    // `ERR_MODULE_NOT_FOUND` on first use, which is F840's requirement failing
    // in the one way no test of `src/` reaches.
    //
    // **The matcher looks for an import, not a mention**, and the first draft of
    // this row did not: `runner.ts`'s throw message says *"(node-pty satisfies it
    // unchanged)"* in a string literal, so a bare `not.toMatch(/node-pty/)` fails
    // on the file's own documentation. Stripping comments is not enough — a
    // string is neither a comment nor an import, and it is the encoding a
    // comment-stripper is built not to see.
    const code = readFileSync("src/data/process/runner.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/[^\n]*/gu, "");
    expect(code, "the runner imports no PTY package").not.toMatch(
      /(?:from|require\()\s*["'][^"']*node-pty/u,
    );
    expect(code, "and the mention that is not one is still there").toMatch(/node-pty satisfies/u);

    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}), "and it is not a runtime dependency").not.toContain("node-pty");
    expect(Object.keys(manifest.devDependencies ?? {}), "it is a devDependency the container builds").toContain("node-pty");
  });

  it("T6.17 (C21 I18): hasPty hard-coded true → the arm is chosen on a runner that cannot spawn one", () => {
    // **Both arms from one call site**, because a constant satisfies either one
    // alone. The getter reads `deps` rather than a captured value, so two
    // runners built the same way disagree exactly when their deps do.
    const make = (pty?: unknown) =>
      createProcessRunner({ env: {}, stdin: {}, ...(pty === undefined ? {} : { pty: pty as never }) });
    expect(make().hasPty, "no factory").toBe(false);
    expect(make({ spawn: () => ({}) }).hasPty, "a factory").toBe(true);
  });

  it("T6.18 (C21 I15): restoring readonly to PtyFactory.spawn's args → the port refuses node-pty (F920)", () => {
    // **The gate for this is `tsc`, and it lives in T2.8** — that row assigns
    // `typeof import("node-pty")` to `PtyFactory` and is an error the moment the
    // modifier comes back. This row is the source-level pin, so the change is
    // caught by `test` as well as by `check`, and so the *reason* sits where
    // someone tightening the type will read it.
    //
    // `Readonly<>` is homomorphic: it rewrites the method into a property with a
    // function type, method bivariance is off, and `readonly string[]` is
    // refused against node-pty's `string[] | string`. Nothing is protected — the
    // only caller builds `["-c", command]` inline and drops it.
    const port = readFileSync("src/data/process/types.ts", "utf8");
    const factory = port.slice(port.indexOf("export type PtyFactory"));
    const args = /^\s*args: (.+),$/mu.exec(factory);
    expect(args?.[1], "the parameter node-pty has to satisfy").toBe("string[]");
  });
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it.todo("T6.93 (C23 I64): snapshotting per chunk → T1.51 counts 100 patches and a 2,000-line value enters the store per write — not deferred on a component: lands with the route's snapshot seam");
  it.todo("T6.94 (C23 I65): resizing the emulator first → T4.64's call order fails and one frame is drawn from the old grid — not deferred on a component: lands with the route's resize");
  it.todo("T6.95 (C23 I66): dropping the cancel registration → T3.62 fails, which is the defect F844 records as shipped — not deferred on a component: lands with the route's cancel");
  it.todo("T6.96 (C23 I67): keeping the cursor on settle → T2.47 fails and a settled block draws a cursor nobody is writing at — not deferred on a component: lands with the route's settle");
  it.todo("T6.98 (C23 I64): dropping the readout registration → T1.53's tail arm fails and a child's last lines wait for a chunk that never comes — not deferred on a component: lands with the route's snapshot seam");
  it.todo("T6.97 (C23 I63): falling back to the pipe arm when spawnPty throws → T3.63 fails and a configuration error becomes a child that quietly lost its colours — not deferred on a component: lands with the route's arm choice");
});
