// C09 §7d — the trust boundary, tier 6.
//
// Each row names the change that makes it fail. They are assertions about the
// rows in `test/unit/trust-boundary.test.ts`: what the mutation pass checks
// mechanically, stated so a reader can see which row dies for which defect.
import { describe, expect, it } from "vitest";

import { neutraliseControl } from "../../src/data/text.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { patchDefinition } from "../../src/presentation/patch/definition.js";
import { plotDefinition } from "../../src/presentation/plot/definition.js";
import { tableDefinition } from "../../src/presentation/table/definition.js";
import { measurable, visible } from "../support/render.js";

const ESC = String.fromCharCode(27);

describe("C09 §7d — tier 6", () => {
  it("T6.142 (C09 I127): #resolve handing the block un-neutralised → T2.191 fails on patch's path, hunk header and line text", () => {
    // **The three fields that leaked** while the sweep ran on a registry that
    // drew `patch` as `raw`: the header's path, the hunk header and a line's
    // text, which was tokenised raw and sliced by the stripped length.
    const kit = measurable({ definitions: [patchDefinition] as never });
    const patch = {
      kind: "patch",
      id: "p",
      path: `src/a${ESC}[2J.ts`,
      language: "typescript",
      hunks: [{ header: `@@ -1 +1 @@${ESC}[2J`, lines: [{ kind: "add", text: `x${ESC}[2Jy`, newNo: 1 }] }],
    } as unknown as Block;
    const drawn = kit.renderToLines(patch, 80).join("\n");
    expect(drawn.includes(`${ESC}[2J`), "no erase-display from a field").toBe(false);
    // Three sites, three residues: each field arrived and was shown as an escape.
    expect(visible(drawn).split("^[[2J").length - 1, "the path, the header and the line each show ^[").toBe(3);
  });

  it("T6.144 (C09 I128): the bidi arm without U+2066–U+2069 → T1.86 and T2.192 fail on the isolates", () => {
    // **The isolates are the members a narrowed range drops first**: they were
    // added to Unicode after the embeddings, and a range written from memory as
    // `202A–202E` reads complete.
    for (const cp of [0x2066, 0x2067, 0x2068, 0x2069]) {
      const text = `a${String.fromCharCode(cp)}b`;
      expect(neutraliseControl(text)).toBe(`a<U+${cp.toString(16).toUpperCase()}>b`);
    }
  });

  it("T6.145 (C09 I130): the sweep on a bare registry → T2.190 fails on the kinds", () => {
    // **The row the sweep's registry is asserted by.** A bare `measurable()`
    // lacks the three the framework registers through the public mechanism, and
    // on that registry each fell back to `raw` — which is how `patch`'s leak
    // read clean. T2.190 compares the production kinds by equality, so the bare
    // registry fails it on exactly these three.
    const bare = measurable().kinds;
    const full = measurable({ definitions: [tableDefinition, plotDefinition, patchDefinition] as never }).kinds;
    expect(["table", "plot", "patch"].filter((k) => bare.includes(k))).toEqual([]);
    expect(["table", "plot", "patch"].filter((k) => full.includes(k))).toEqual(["table", "plot", "patch"]);
  });

  it("T6.146 (C09 I129): copyOf handing the caller's block → T2.193 fails on every kind that copies", () => {
    // **The copy reads the resolved block**, and the resolved block is the
    // neutralised one. Handing the definition the caller's block instead keeps
    // every copy working and puts the ESC on the clipboard.
    const kit = measurable();
    const kv = {
      kind: "keyValue",
      id: "kv",
      rows: [{ label: `k${ESC}[2J`, value: `v${ESC}]52;c;cHduZWQ=${String.fromCharCode(7)}` }],
    } as unknown as Block;
    const copy = kit.registry.copyOf(kv) ?? "";
    expect(copy.includes(ESC), "no ESC on the clipboard").toBe(false);
    expect(copy).toContain("k^[[2J");
    expect(copy).toContain("v^[]52;c;cHduZWQ=^G");
  });
});
