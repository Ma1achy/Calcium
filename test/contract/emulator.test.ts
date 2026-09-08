// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9), tier 2.
import { readdirSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

// **Type-only, both of them** — `import type` is erased, so this file names the
// package without loading its native binding and without making C21's claim
// false by the act of checking it (C21 I15).
import type * as nodePty from "node-pty";
import type { IPty } from "node-pty";

import type { PtyFactory, PtyProcess } from "../../src/data/process/types.js";

import { createEmulator } from "../../src/data/emulator/emulator.js";
import { ANIMATES, tickIntervalOf } from "../../src/presentation/blocks/animation.js";
import { RAMP_EXTENT } from "../../src/presentation/blocks/ramp.js";
import { degradeColour } from "../../src/presentation/theme/colormap.js";
import { b } from "../../src/shell/builders/index.js";
import { measurable } from "../support/render.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { TERMINAL_KEYS, TERMINAL_RUN_KEYS } from "../../src/data/viewmodel/types.js";

/** The errors, or an empty list — so a row reads the same on either arm. */
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

const harnessFor = (): ReturnType<typeof measurable> => measurable({});

const feed = async (
  term: ReturnType<typeof createEmulator>,
  ...chunks: readonly (string | Uint8Array)[]
): Promise<void> => {
  for (const chunk of chunks) await term.write(chunk);
};

describe("C27 terminal emulator — tier 2", () => {
  it("T2.1 (C27 I11): the package is imported at one site, and the emulator imports nothing from terminal/", () => {
    const files = ["src/data/emulator/emulator.ts", "src/data/emulator/snapshot.ts", "src/data/emulator/types.ts"];
    // **Comments blanked first.** `snapshot.ts` names the package in prose — its
    // port is cut from that shape — and an import assertion that counts a
    // comment measures the documentation rather than the graph.
    const code = (f: string): string =>
      readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
    const importers = files.filter((f) => /@xterm\/headless/u.test(code(f)));
    expect(importers).toEqual(["src/data/emulator/emulator.ts"]);
    for (const f of files) {
      expect(code(f)).not.toMatch(/from "\.\.\/\.\.\/terminal\//u);
    }
  });

  it("T2.2 (C27 I1): the component reads no ambient state and emits no bytes", () => {
    const src = ["src/data/emulator/emulator.ts", "src/data/emulator/snapshot.ts", "src/data/emulator/types.ts"]
      .map((f) => readFileSync(f, "utf8"))
      // Comments blanked: prose about `onData` is not a subscription, and a
      // source assertion that counts documentation measures the documentation
      // (the best-commented file fails hardest).
      .map((t) => t.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, ""))
      .join("\n");
    for (const forbidden of ["process.stdout", "process.stdin", "process.env", "console.", "onData", "onBell", "onTitleChange"]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });

  it("T2.3 (C27 I8): a bell and a title change nothing about the snapshot", async () => {
    const plain = createEmulator({ cols: 20, rows: 4 });
    const noisy = createEmulator({ cols: 20, rows: 4 });
    await feed(plain, "text\r\n");
    await feed(noisy, "\u0007\u001b]0;renamed\u0007text\r\n");
    expect(noisy.snapshot("t")).toEqual(plain.snapshot("t"));
    plain.dispose();
    noisy.dispose();
  });

  it("T2.4 (C27 I2): no snapshot of a random byte corpus carries a control or a lone surrogate", async () => {
    // Seeded, and the seed is in the failure message: a corpus that cannot be
    // reproduced reports a defect nobody can chase.
    const seed = 0x5eed;
    let x = seed;
    const next = (): number => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x;
    };
    const term = createEmulator({ cols: 20, rows: 4, scrollback: 50 });
    for (let i = 0; i < 1000; i += 1) {
      let chunk = "";
      const length = next() % 12;
      for (let c = 0; c < length; c += 1) chunk += String.fromCharCode(next() % 0x2200);
      await term.write(chunk);
    }
    for (const line of term.snapshot("t").lines) {
      for (let i = 0; i < line.text.length; i += 1) {
        const unit = line.text.charCodeAt(i);
        const bad = unit < 0x20 || (unit >= 0x7f && unit <= 0x9f) || (unit >= 0xd800 && unit <= 0xdfff);
        expect(bad, `seed ${String(seed)}: U+${unit.toString(16)} in ${JSON.stringify(line.text)}`).toBe(false);
      }
    }
    term.dispose();
  });

  it("T2.6 (C27 I7): a snapshot never carries dropped: 0", async () => {
    const term = createEmulator({ cols: 20, rows: 4, scrollback: 50 });
    await feed(term, "one\r\ntwo\r\n");
    expect(Object.keys(term.snapshot("t"))).not.toContain("dropped");
    term.dispose();
  });
});

describe("C04 — the terminal kind, spec-first rows", () => {
  it("T2.118 (C04 I110, §5a): every run field round-trips through JSON, and both key sets refuse an extra by name", () => {
    // **The round trip is the contract**, because a `terminal` crosses the
    // transport as JSON and comes back: a field the serialiser drops is a style
    // the far side declared and the frame does not draw, and nothing else in
    // the suite would notice.
    const every = {
      kind: "terminal",
      id: "t1",
      cols: 80,
      screen: "lines",
      lines: [
        {
          text: "abcdef",
          runs: [
            {
              from: 0,
              to: 3,
              fg: { kind: "rgb", hex: "#ff8800" },
              bg: { kind: "ansi256", index: 17 },
              bold: true,
              dim: false,
              italic: true,
              underline: true,
              inverse: false,
              strike: true,
            },
          ],
        },
      ],
      cursor: { line: 0, col: 4 },
      dropped: 12,
    };
    expect(JSON.parse(JSON.stringify(every)), "every run field survives").toEqual(every);
    expect(errs(every), "and the whole of it validates").toEqual([]);

    // The grid arm, which cannot carry `dropped` — so both modes are exercised
    // rather than the one that happens to hold more fields.
    const grid = { ...every, screen: "grid", dropped: undefined };
    delete (grid as Record<string, unknown>)["dropped"];
    expect(JSON.parse(JSON.stringify(grid)), "and the grid mode round-trips too").toEqual(grid);
    expect(errs(grid), "and validates").toEqual([]);

    // **By name, not by count.** The deferral for this row said *a seventh block
    // key*, which was true when the type had six; it now has nine, and a row
    // written to the old number would have failed for the right reason and said
    // the wrong thing. Asserting the set's size beside the refusal is what keeps
    // the two in step — a key added without a decision fails here.
    expect(TERMINAL_KEYS.size, "nine block keys, and the deferral said seven").toBe(9);
    expect(TERMINAL_RUN_KEYS.size, "ten run keys").toBe(10);
    expect(errs({ ...every, screenful: true }).join(" "), "an extra block key").toContain(
      'unknown key "screenful" on terminal',
    );
    expect(
      errs({ ...every, lines: [{ text: "abc", runs: [{ from: 0, to: 3, blink: true }] }] }).join(" "),
      "an extra run key",
    ).toContain('unknown key "blink" on a run');
  });
});

describe("C09 · C10 — the terminal block and a literal colour", () => {
  it("T2.121 (C09 I55, C09 §6b): the kind windows, and a window's rows are the whole block's rows", () => {
    const harness = harnessFor();
    const lines = Array.from({ length: 2000 }, (_, i) => ({ text: `line ${String(i)}` }));
    const block = b.terminal(80, lines, { id: "t" });
    const whole = harness.renderToLines(block, 80);
    const windowed = harness.window(block, 80, 10, 16);
    expect(windowed).toBeDefined();
    expect(harness.renderToLines(windowed!.block, 80)).toEqual(whole.slice(10, 16));
  });

  it("T2.122 (C09 I57): a terminal neither ramps nor ticks", () => {
    expect(RAMP_EXTENT.terminal).toBe("none");
    expect(ANIMATES.terminal).toBe(false);
    expect(tickIntervalOf(b.terminal(20, [{ text: "x" }]))).toBeNull();
  });

  it("T2.36 (C10 I38): the ladder takes no theme, and its module names none", () => {
    // A compile-level check: a second parameter would make this call an error,
    // and the source scan is the half a signature cannot state.
    expect(degradeColour({ kind: "rgb", hex: "#ffffff" }, { colourDepth: 4 })).toBeDefined();
    const code = readFileSync("src/presentation/theme/colormap.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/[^\n]*/gu, "");
    const ladder = code.slice(code.indexOf("export function degradeColour"));
    expect(ladder).not.toContain("theme");
  });
});

describe("C21 · C22 — the PTY port, spec-first rows", () => {
  it("T2.8 (C21 I15): src/ imports no PTY package, and node-pty satisfies both halves of the port", () => {
    // **The compile-level half, and `tsc` is the assertion.** Neither expression
    // has a runtime claim to make; each is an error if one half of I15 is false,
    // and the `expect` below exists so `noUnusedLocals` keeps them.
    //
    // **Both halves, because I15 names both types.** The row this replaces asked
    // only for `IPty` → `PtyProcess`, which passes — and the factory did not,
    // for one `readonly` (F920). A row citing a two-part invariant and covering
    // one part reads, from the citation, exactly like coverage.
    const asProcess = (p: IPty): PtyProcess => p;
    const asFactory = (m: typeof nodePty): PtyFactory => m;
    expect([asProcess, asFactory].every((f) => typeof f === "function")).toBe(true);

    // The scan half — a signature cannot state *and nothing imports it*.
    const imports = (code: string): boolean =>
      /(?:from|require\()\s*["'][^"']*node-pty/u.test(
        code.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, ""),
      );

    // **The control first** (SS26): a scan that matches nothing passes exactly
    // like one whose corpus is clean, and `types.ts` now discusses `node-pty` in
    // prose — so the matcher must see an import and not a mention.
    expect(imports('import { spawn } from "node-pty";'), "the matcher sees an import").toBe(true);
    expect(imports('const x = 1; // node-pty satisfies it unchanged'), "not a comment").toBe(false);
    // **The third encoding, and the one that caught the first draft of T6.16**:
    // `runner.ts`'s throw message names the package in a *string literal*, which
    // a comment-stripper is built not to touch. A control with two arms passed
    // over a corpus the two-armed matcher got wrong.
    expect(imports('throw new Error("node-pty satisfies it unchanged");'), "not a string").toBe(false);

    const offenders = srcFiles("src").filter((f) => imports(readFileSync(f, "utf8")));
    expect(offenders, "src/ imports no PTY package").toEqual([]);
    expect(srcFiles("src").length, "over a non-empty corpus").toBeGreaterThan(200);

    // **No installed-or-not arm.** The deferral asked for one, reported rather
    // than silent. `node-pty` is a devDependency the container builds by name in
    // `make install`, and `test/support/pty.ts` has imported it unconditionally
    // all along — a skip here would be a branch nothing can enter, which is the
    // vacuity class this row is otherwise about.
  });
  it.todo("T2.100 (C22 I91): TuiConfig.pty reaches the runner's deps by object identity, and config.pty is read at exactly one site in src/shell/ — not deferred on a component: lands with TuiConfig.pty");
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  // **Partial, not deferred** (F919). The blocker — *lands with the route's
  // settle* — landed, and `test/unit/emulator.test.ts` holds a running T2.47
  // asserting both halves: a settled screen carries no cursor, and a dispose
  // before the snapshot would have thrown C27's refusal, so `status: "ok"` is
  // the ordering. What is not covered is the corpus: *at any position* against
  // the one position that row builds. That is owed coverage on built code
  // rather than work waiting on a component, and the distinction is the whole
  // of the closes/reframes/partial test — a deferral that says *partial* is the
  // only one of the three that leaves a residue named.
  it.todo("T2.47 (C23 I67): the settled screen carries no cursor at EVERY cursor position, not only the one test/unit/emulator.test.ts builds — not deferred on a component: the route's settle has landed and the row is written narrower than this asked");
});

function srcFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) srcFiles(path, out);
    else if (/\.tsx?$/u.test(entry) && !/\.d\.ts$/u.test(entry)) out.push(path);
  }
  return out;
}
