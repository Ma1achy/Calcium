// C25 tier 6 — fail-on-revert. Each names the edit that makes a test fail, so the
// guard is legible from the change rather than from the assertion.
import { describe, expect, it } from "vitest";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { pairedRows } from "../../src/presentation/patch/height.js";
import { hunkOf, PATCH_CORPUS, patchOf, THE_ILLUSTRATION } from "../support/blocks.js";
import { FULL_CAPS, measurable, visible } from "../support/render.js";
import { readFileSync } from "node:fs";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

const kit = (): ReturnType<typeof measurable> =>
  measurable({ definitions: [patchDefinition as unknown as BlockDefinition<never>], capabilities: FULL_CAPS });

describe("C25 fail-on-revert", () => {
  it("T6.1 (I2): making long lines wrap → more than two heights across the seven widths", () => {
    // The revert is a wrap, and what it destroys first is not the arithmetic but the
    // gutter alignment — `logs` makes the same call for the same reason. The
    // arithmetic is how the suite notices.
    const k = kit();
    const long = patchOf({ hunks: [hunkOf([`+key: ${"x".repeat(400)}`])] });

    const heights = new Set([40, 60, 80, 100, 120, 160, 200].map((w) => k.measure(long, w)));
    expect(heights.size, "two: one per layout, and no more").toBeLessThanOrEqual(2);
  });

  it("T6.1a (I2a): making split stack rather than pair → T1.1a fails", () => {
    // **The revert that looks like a simplification**, because it restores the
    // width-independence the original I2 claimed. One row per line either side,
    // blanks opposite — and split becomes unified with wasted columns.
    const run = THE_ILLUSTRATION.lines;
    const stacked = run.filter((l) => l.kind !== "context").length; // cells-ok
    const paired = pairedRows(run) - run.filter((l) => l.kind === "context").length; // cells-ok

    expect(paired, "pairing must save rows, or split buys nothing").toBeLessThan(stacked);
  });

  it("T6.2 (I1): counting a collapsed region as its collapsed line count → T1.3 fails", () => {
    const k = kit();
    const with40 = patchOf({ id: "p40", hunks: [hunkOf([" a", "+b"], { collapsedBefore: 40 })] });
    const without = patchOf({ id: "p0", hunks: [hunkOf([" a", "+b"])] });

    expect(k.measure(with40, 80) - k.measure(without, 80), "one row, not forty").toBe(1);
  });

  it("T6.15 (C04 §3): putting `collapsedAfter` on `Hunk` → one region, two fields", () => {
    // **The revert that looks symmetrical.** A `collapsedAfter` beside
    // `collapsedBefore` on `Hunk` reads tidier and double-counts: the gap between
    // hunk 1 and hunk 2 is 1's *after* and 2's *before*, so a producer has to know
    // which of two fields describes one region and a renderer has to decide which to
    // believe. Asserted as the property that makes the block's field unambiguous —
    // there is exactly one place a tail can be declared.
    const twoHunks = patchOf({
      id: "p-two",
      hunks: [hunkOf([" a", "+b"], { collapsedBefore: 9 }), hunkOf([" c", "+d"], { collapsedBefore: 40 })],
      collapsedAfter: 170,
    });

    const drawn = kit().renderToLines(twoHunks, 80).map(visible).join("\n");
    const markers = [...drawn.matchAll(/unchanged lines/g)].length; // cells-ok — a marker count

    expect(markers, "three regions, three markers, and no region described twice").toBe(3);
    expect(drawn).toContain("9 unchanged lines");
    expect(drawn).toContain("40 unchanged lines");
    expect(drawn).toContain("170 unchanged lines");
  });

  it("T6.16 (I5): counting the tail as its elided line count → T1.3a fails", () => {
    const with170 = patchOf({ id: "p-t170", hunks: [hunkOf([" a", "+b"])], collapsedAfter: 170 });
    const without = patchOf({ id: "p-t0", hunks: [hunkOf([" a", "+b"])] });

    expect(kit().measure(with170, 80) - kit().measure(without, 80), "one row, not 170").toBe(1);
  });

  it("T6.3 (I6): making `patch` a privileged built-in → T2.3 fails", () => {
    const bare = createBlockRegistry({});
    expect(bare.kinds, "patch must not ship as a default").not.toContain("patch");
    expect(bare.get("patch")).toBeUndefined();
  });

  it("T6.4 (I4): carrying the distinction with tone alone → T4.2 fails at depth 1", () => {
    const mono = measurable({
      definitions: [patchDefinition as unknown as BlockDefinition<never>],
      capabilities: { ...FULL_CAPS, colourDepth: 1 },
    })
      .renderToLines(patchOf({ hunks: [hunkOf(["-a", "+b"])] }), 80)
      .map(visible)
      .join("\n");

    expect(mono).toContain("-");
    expect(mono).toContain("+");
  });

  it("T6.5 (I3): tokenising inside measure → the measurement path reaches the tokeniser", () => {
    // **Structural rather than behavioural**, and that is the point: C09's memo is
    // warm by the time most suites run, so a count-based assertion passes on a
    // `measure` that tokenises whatever it was given. What must hold is that the
    // measurement path cannot reach the tokeniser at all.
    //
    // `height.ts` is the whole of it — `patchHeight`, `hunkRows`, `pairedRows` — and
    // it imports the view model and nothing else. A `measure` that reached content
    // would have to import `lines.ts` or `../blocks/`, and this is what would say so.
    const source = readFileSync("src/presentation/patch/height.ts", "utf8");
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);

    expect(imports, "the measurement path imports one thing").toEqual(["../../data/viewmodel/index.js"]);

    // **Comments stripped first**, because the prose that explains a rule is not a
    // violation of it. This assertion fired on the sentence "a `measure` that could
    // reach the tokeniser is a `measure` that eventually does" — the file documenting
    // the property it satisfies. A03 §4's scan runner skips comment lines for exactly
    // this reason, after SS23 reported a doc comment about `frames.length`.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(code, "no call to the tokeniser on the measurement path").not.toContain("tokenise");
  });

  it("T6.6 (§3): flipping the layout threshold → T1.5 fails and every line truncates at 60", () => {
    const k = kit();
    // At 60 the layout must be unified; split there gives 28 usable columns a side.
    const narrow = k.renderToLines(patchOf(), 60).map(visible);
    expect(narrow.some((l) => l.includes("│")), "60 columns must not be split").toBe(false);

    const wide = k.renderToLines(patchOf(), 160).map(visible);
    expect(wide.some((l) => l.includes("│")), "160 columns must be split").toBe(true);
  });

  it("T6.8 (I12): suppressing syntax on removed lines → T3.13 fails", () => {
    // The convention this spec rejected, and the one a reader is most likely to
    // restore from another tool. Its stated reason is a fact about the strength of
    // that tool's background, not about diffs.
    const rows = kit().renderToLines(patchOf({ hunks: [hunkOf(["-app: one", "+app: two"])] }), 80);
    const removed = rows.find((r) => visible(r).includes("app: one"));
    const added = rows.find((r) => visible(r).includes("app: two"));

    const styles = (row: string): number => new Set([...row.matchAll(/\[([0-9;]+)m/g)].map((m) => m[1])).size;
    expect(styles(removed as string), "a removed line is highlighted like an added one").toBe(
      styles(added as string),
    );
  });

  it("T6.9 (I13): carrying the distinction on the background alone → T4.2 fails at 1-bit", () => {
    // At one bit the background is gone; if it were the only signal, nothing would
    // be left. The marker is what survives.
    const mono = measurable({
      definitions: [patchDefinition as unknown as BlockDefinition<never>],
      capabilities: { ...FULL_CAPS, colourDepth: 1 },
    }).renderToLines(patchOf({ hunks: [THE_ILLUSTRATION] }), 80);

    for (const row of mono) expect(/\[[0-9;]*48;/.test(row), "no background at one bit").toBe(false);
    expect(mono.map(visible).join("\n")).toMatch(/[+-]/);
  });

  it("T6.12 (I2a): asserting one height across all seven widths → T2.2a fails", () => {
    // The other direction, and the one this suite would have shipped: a corpus where
    // nothing pairs satisfies "constant within a layout" *and* "constant across all
    // widths", so the step has to be asserted to exist somewhere.
    const k = kit();
    const stepped = PATCH_CORPUS.filter((b) => k.measure(b, 80) !== k.measure(b, 120));
    expect(stepped.length, "at least one fixture must distinguish the arithmetics").toBeGreaterThan(0);
  });

  it("T6.13 (I9): building a row outside `line()` → T2.7 finds a row over its width", () => {
    // C12's defect, guarded here rather than rediscovered: it rendered nineteen rows
    // at width 1 against a declared five, because one row skipped the clamp and the
    // terminal wrapped each of them.
    const k = kit();
    for (const width of [1, 2, 3]) {
      for (const row of k.renderToLines(patchOf({ hunks: [THE_ILLUSTRATION] }), width)) {
        expect(visible(row).length, `width ${width}`).toBeLessThanOrEqual(width); // cells-ok
      }
    }
  });

  it("T6.14 (I12a): one background per row rather than per side → T4.10 fails", () => {
    // The frame-visible defect: an unpaired addition painted its blank left half
    // green, asserting a change on the side that had none.
    const unpaired = kit()
      .renderToLines(patchOf({ hunks: [THE_ILLUSTRATION] }), 120)
      .find((r) => visible(r).includes("prism.fmx.io/family"));
    const [left] = (unpaired as string).split("│");

    expect(/\[[0-9;]*48;/.test(left as string), "the blank side must be unpainted").toBe(false);
  });
});
