// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9), tier 2.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createEmulator } from "../../src/data/emulator/emulator.js";
import { ANIMATES, tickIntervalOf } from "../../src/presentation/blocks/animation.js";
import { RAMP_EXTENT } from "../../src/presentation/blocks/ramp.js";
import { degradeColour } from "../../src/presentation/theme/colormap.js";
import { b } from "../../src/shell/builders/index.js";
import { measurable } from "../support/render.js";

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
  it.todo("T2.118 (C04 I110, §5a): a terminal carrying every run field and both modes round-trips through JSON deep-equal, and TERMINAL_KEYS refuses a seventh block key and an eleventh run key by name — not deferred on a component: lands with the Terminal type");
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
  it.todo("T2.8 (C21 I15): no node-pty import anywhere in src/, and a compile-level check that node-pty's IPty is assignable to PtyProcess; skipped with a reported reason when node-pty is absent — not deferred on a component: lands with the PtyFactory port");
  it.todo("T2.100 (C22 I91): TuiConfig.pty reaches the runner's deps by object identity, and config.pty is read at exactly one site in src/shell/ — not deferred on a component: lands with TuiConfig.pty");
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it.todo("T2.47 (C23 I67): a settled terminal document carries no cursor at any position, and dispose is called after snapshot, asserted by call order — not deferred on a component: lands with the route's settle");
});
