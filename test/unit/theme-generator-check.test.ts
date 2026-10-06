// C10 §4b — `make design-check` refuses a hand edit to `tokens.generated.ts`.
// C10 claimed this before anything did it: nothing design-check ran opened the
// file. `from-registry.mjs --check` renders in memory, writes nothing, and names
// the first differing line. Dropping the comparison (always exiting 0) → TG2
// fails; writing in check mode → TG2's "nothing written" fails. Since C10 I62
// the check renders `four-bit.generated.ts` too; checking only the first file →
// TG3 fails.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "src/presentation/theme/tokens.generated.ts";
const FOUR_BIT_FILE = "src/presentation/theme/four-bit.generated.ts";
const check = (out?: string, fourBitOut?: string) =>
  spawnSync("node", [
    "tools/theme/from-registry.mjs",
    "--check",
    ...(out === undefined ? [] : ["--out", out]),
    ...(fourBitOut === undefined ? [] : ["--four-bit-out", fourBitOut]),
  ], { encoding: "utf8" });

describe("C10 §4b — the generated themes checked against the registry", () => {
  it("TG1 (C10 §4b): the tree's file is the registry's projection, and the check writes nothing", () => {
    const before = readFileSync(FILE, "utf8");
    const fourBitBefore = readFileSync(FOUR_BIT_FILE, "utf8");
    const r = check();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/OK · tokens\.generated\.ts and four-bit\.generated\.ts are the registry's projection · 10 themes/u);
    expect(readFileSync(FILE, "utf8")).toBe(before);
    expect(readFileSync(FOUR_BIT_FILE, "utf8")).toBe(fourBitBefore);
  });

  it("TG2 (C10 §4b): one hex edited by hand is refused, at its line, with both values — and nothing is written", () => {
    const dir = mkdtempSync(join(tmpdir(), "calcium-themes-"));
    const copy = join(dir, "tokens.generated.ts");
    copyFileSync(FILE, copy);
    const lines = readFileSync(copy, "utf8").split("\n");
    const at = lines.findIndex((l) => /#[0-9a-f]{6}/u.test(l));
    expect(at, "a line holding a hex to edit").toBeGreaterThanOrEqual(0);
    const original = lines[at]!;
    const edited = original.replace(/#[0-9a-f]{6}/u, "#123456");
    expect(edited).not.toBe(original);
    lines[at] = edited;
    const tampered = lines.join("\n");
    writeFileSync(copy, tampered);
    try {
      const r = check(copy);
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stderr).toContain(`differs from the registry's projection at line ${String(at + 1)}`);
      expect(r.stderr).toContain(`on disk:   ${edited}`);
      expect(r.stderr).toContain(`generated: ${original}`);
      expect(readFileSync(copy, "utf8"), "check mode wrote nothing").toBe(tampered);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("TG3 (C10 §4b, C10 I62): one 4-bit index edited by hand in four-bit.generated.ts is refused at its line", () => {
    const dir = mkdtempSync(join(tmpdir(), "calcium-four-bit-"));
    const copy = join(dir, "four-bit.generated.ts");
    copyFileSync(FOUR_BIT_FILE, copy);
    const lines = readFileSync(copy, "utf8").split("\n");
    const at = lines.findIndex((l) => /"tone\.ok": \d+,/u.test(l));
    expect(at, "a line holding an index to edit").toBeGreaterThanOrEqual(0);
    const original = lines[at]!;
    const edited = original.replace(/\d+,$/u, "4,");
    expect(edited).not.toBe(original);
    lines[at] = edited;
    const tampered = lines.join("\n");
    writeFileSync(copy, tampered);
    try {
      // The token file is the tree's, and clean, so only the 4-bit copy can fail.
      const r = check(undefined, copy);
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stderr).toContain(`${copy} differs from the registry's projection at line ${String(at + 1)}`);
      expect(r.stderr).toContain(`on disk:   ${edited}`);
      expect(r.stderr).toContain(`generated: ${original}`);
      expect(readFileSync(copy, "utf8"), "check mode wrote nothing").toBe(tampered);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
