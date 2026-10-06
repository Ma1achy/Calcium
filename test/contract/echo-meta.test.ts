// C04 I152 — the echo's chips on the document (ruling 104 c, F1521).
//
// **Half of this row is the compiler's.** `@ts-expect-error` fails `tsc` when
// the line beneath it compiles, so the refusal is asserted by `make typecheck`
// and not by the runner; the runtime half asserts what a type cannot say —
// that C17 declares no union of its own.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ChipKind, DocumentMeta, EchoChip, ProducedMeta } from "../../src/data/viewmodel/index.js";
import type { ChipKind as EditorChipKind } from "../../src/interaction/editor/index.js";

describe("C04 I152 — meta.echo", () => {
  it("T2.157 (C04 I152): ProducedMeta refuses echo, DocumentMeta takes it, and ChipKind is one type in C04 and C17", () => {
    const chip: EchoChip = { from: 5, to: 30, ordinal: 1, kind: "paste", name: "pasted", lines: 6 };

    // @ts-expect-error — shell-owned, as `origin` is: a producer cannot put a chip in an echo.
    const produced: ProducedMeta = { echo: [chip] };
    const echo: DocumentMeta["echo"] = [chip];
    expect(produced.echo).toEqual(echo);

    // Each value assigns through both names and back, so neither union is wider.
    const kinds: readonly ChipKind[] = ["paste", "file", "image"];
    for (const kind of kinds) {
      const editor: EditorChipKind = kind;
      const back: ChipKind = editor;
      expect(back).toBe(kind);
    }

    // **And C17 restates no union**: two declarations agree today and drift on
    // the day a fourth kind lands in one of them.
    const layout = readFileSync(new URL("../../src/interaction/editor/layout.ts", import.meta.url), "utf8");
    expect(layout, "layout.ts re-exports C04's ChipKind").not.toMatch(/type ChipKind\s*=/u);
  });
});
