// `tools/theme/quantised.mjs` — the writer of C10 I41's table, run.
//
// **T3.73 holds the table and never runs the writer.** It compares each entry
// with `quantiseSet` computed fresh, which is the property that matters; what
// it cannot see is the writer's own claim — *a regeneration with no change is a
// byte-identical file* — so a writer that reordered its keys, dropped the
// provenance comments or wrote a stale count would pass T3.73 until the next
// regeneration and then land as a diff nobody asked for. `make instruments`
// found it with no fixture.
//
// Tier 5, because the writer reads `dist/` (`probes build before they measure`).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const TABLE = "src/presentation/theme/quantised.generated.ts";

describe("tools/theme/quantised.mjs — the shipped themes' quantisations, written", () => {
  it("QT1 (C10 I41): regenerating into another file reproduces the committed table byte for byte, and leaves it untouched", () => {
    const before = readFileSync(TABLE, "utf8");
    const dir = mkdtempSync(join(tmpdir(), "calcium-quantised-"));
    try {
      const out = join(dir, "quantised.generated.ts");
      const said = execFileSync("node", ["tools/theme/quantised.mjs", "--out", out], { encoding: "utf8", timeout: 120_000 });
      const written = readFileSync(out, "utf8");
      // The count it prints is the count it wrote — the entries, one per key.
      const sets = Number(/quantised: (\d+) sets written to /u.exec(said)?.[1]);
      expect(sets, said).toBeGreaterThan(0);
      // A key is a JSON string of the set, escaped quotes and all.
      expect(written.match(/^ {2}".*": Object\.freeze\(/gmu)?.length).toBe(sets);
      expect(written).toContain(`// ${String(sets)} sets over `);
      expect(written).toBe(before);
      expect(readFileSync(TABLE, "utf8"), "`--out` writes nowhere else").toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
