// C23 I76 and C09 I104 — §036's operation surface.
//
// **The classification table is the fixture.** §036 draws the head twice and
// they are not the same line, and the two drawings differ by *which of two
// correct statements applies* rather than by a value — which is the structural
// interaction a table finds and a sequence trace does not: nothing happens
// between them that a row could key on.
import { describe, expect, it } from "vitest";

import { measurable, FULL_CAPS, DARK_THEME } from "../support/render.js";
import { operationHeader, operationRows, toolCallHeader } from "../../src/shell/documents.js";
import type { OperationSpec } from "../../src/shell/documents.js";

// **The ESC is part of the sequence.** Without it the strip leaves a bare
// \u001b in every line and every offset is one out per escape — the matcher
// that sees one encoding, and it passes by luck where the offsets agree.
const SGR = /\u001b\[[0-9;]*m/gu;

const linesOf = (blocks: readonly unknown[], width: number): readonly string[] =>
  blocks.flatMap((b) =>
    measurable({ theme: DARK_THEME, capabilities: FULL_CAPS })
      .renderToLines(b as never, width)
      .map((l) => l.replace(SGR, "")),
  );

/**
 * §036's own operation, in whatever state the case wants.
 *
 * **`drop` rather than `undefined`**: under `exactOptionalPropertyTypes` an
 * absent field and a field holding `undefined` are different types, and the
 * cases here are about absence.
 */
const compacting = (
  over: Partial<OperationSpec> = {},
  drop: readonly (keyof OperationSpec)[] = [],
): OperationSpec => {
  const base: Record<string, unknown> = {
    verb: "Compacting conversation…",
    elapsedMs: 338_000,
    delta: "↓ 8.0k tokens",
    current: 77,
    total: 100,
    ...over,
  };
  for (const key of drop) delete base[key];
  return base as unknown as OperationSpec;
};

describe("C23 I76 — an operation's head brackets while it runs and flattens when it stops", () => {
  it("T1.71 (C23 I76, §036, `R-BLK-249`, `R-BLK-263`): four running shapes and four stopped ones", () => {
    // **Running: the numbers are inside ONE pair of parentheses.**
    const both = operationHeader(compacting({}), FULL_CAPS);
    expect(both).toBe("⋅ Compacting conversation… (5m 38s · ↓ 8.0k tokens)");

    // **One member takes no separator** — `(5m 38s · )` is the shape a row
    // asserting only the two-member case would accept.
    expect(operationHeader(compacting({}, ["delta"]), FULL_CAPS)).toBe(
      "⋅ Compacting conversation… (5m 38s)",
    );
    expect(operationHeader(compacting({}, ["elapsedMs"]), FULL_CAPS)).toBe(
      "⋅ Compacting conversation… (↓ 8.0k tokens)",
    );

    // **No members, no parentheses.** `()` says *these are the numbers* about
    // no numbers, and it is what an unguarded group draws.
    const bare = operationHeader(compacting({}, ["elapsedMs", "delta"]), FULL_CAPS);
    expect(bare).toBe("⋅ Compacting conversation…");
    expect(bare).not.toContain("(");

    // **Stopped: the same numbers are FLAT PEERS.** This is the row the walk
    // found. *The aside groups the elapsed and the delta* and *a head joins its
    // fields with the separator* are both true, and only one applies at each
    // end — a build that brackets the settled head satisfies every assertion
    // above it.
    const settled = operationHeader(
      {
        verb: "compacted",
        state: "succeeded",
        elapsedMs: 372_000,
        delta: "41k → 12k tokens",
        outcome: "18 turns summarised",
      },
      FULL_CAPS,
    );
    expect(settled).toBe("compacted · 6m 12s · 41k → 12k tokens · 18 turns summarised");
    expect(settled).not.toContain("(");

    for (const state of ["cancelled", "failed"] as const) {
      const head = operationHeader(
        { verb: "compacting", state, elapsedMs: 130_000, outcome: state },
        FULL_CAPS,
      );
      expect(head, `${state} is flat`).toBe(`compacting · 2m 10s · ${state}`);
    }

    // A settled operation carrying nothing is the verb alone — no separator
    // with one field, at this end as well as the other.
    expect(operationHeader({ verb: "compacted", state: "succeeded" }, FULL_CAPS)).toBe("compacted");

    // **The control is the call head**, which brackets nothing at either end —
    // so the bracket is this grammar's and not something the separator does.
    expect(toolCallHeader({ name: "pytest", args: "tests/unit", elapsedMs: 4000, outcome: "47 passed" }, FULL_CAPS))
      .not.toContain("(5m");
  });

  it("T1.72 (C23 I76, §036, `R-BLK-263`, `R-BLK-265`): the bar goes when settled, when cancelled and when failed", () => {
    // Running, there is a bar.
    const live = linesOf(operationRows(compacting({}), FULL_CAPS), 56);
    expect(live.length, "a head and a bar").toBe(2);
    expect(live[1]).toContain("▰");

    // **Three stopped states, asserted separately.** Two arguments end with no
    // bar and neither substitutes for the other — *a 100% bar on a finished
    // thing is a row spent on nothing* is settlement's, *a stopped bar is a
    // claim about progress that is not being made any more* is cancellation's.
    // A row written about settlement alone is satisfied by a cancelled
    // operation still drawing its frozen fill, which is the state that lies.
    for (const [state, current] of [["succeeded", 100], ["cancelled", 41], ["failed", 41]] as const) {
      const rows = linesOf(operationRows(compacting({ state, current }), FULL_CAPS), 56);
      expect(rows.length, `${state} draws the head alone`).toBe(1);
      expect(rows[0], `${state} keeps its head`).toContain("Compacting conversation…");
      expect(rows.join(""), `${state} draws no bar`).not.toContain("▰");
      expect(rows.join(""), `${state} draws no empty bar either`).not.toContain("▱");
    }

    // **A head is one committed row at both ends** (C09 I46). The running arm
    // wrapped before this row existed: at 28 cells the aside fell to a second
    // line at column zero, reading as a line of its own rather than as the
    // verb's numbers. The settled head was already fitted, so only the frame
    // separated the two.
    expect(linesOf([operationRows(compacting({}), FULL_CAPS)[0]], 28).length).toBe(1);
  });
});

describe("C09 I104 — a meter's label column costs nothing when there is no label", () => {
  it("T1.71 (C09 I104, §036, C23 I76): an empty label spends no cells, and the bar is wider by the column", () => {
    const bar = (label: string): string => {
      const rows = linesOf(
        [{ kind: "progress", id: "p", label, current: 77, total: 100, quantity: "progress", granularity: "segmented" }],
        56,
      );
      return rows[0] ?? "";
    };
    const none = bar("");
    const some = bar("Compacting conversation");

    // **Read the BAR's length, not the absence of text** — a row asserting *no
    // label is drawn* is satisfied by nineteen spaces, which is what the tree
    // drew: `width / 3` was reserved unconditionally.
    const cellsOf = (line: string): number => (line.match(/[▰▱]/gu) ?? []).length;
    expect(cellsOf(none), "the unlabelled bar is longer").toBeGreaterThan(cellsOf(some));
    expect(cellsOf(none) - cellsOf(some), "by the column and its gap").toBe(19);

    // And it starts at the row's own first cell — the gap went with the column.
    expect(none.startsWith("▰"), `drawn as |${none}|`).toBe(true);
    // The control: the labelled bar is unchanged, column and all.
    expect(some.startsWith("Compacting")).toBe(true);

    // **The second half, and the fixture above cannot see it** (§065). Its label
    // is 23 cells against a cap of 18, so it is clamped either way and the rule
    // could change underneath it with every assertion still passing — which is
    // what happened: a mutation restoring the unconditional third survived this
    // row. A *short* label is the case the ceiling is about.
    const short = bar("ctx");
    expect(short.startsWith("ctx "), `drawn as |${short}|`).toBe(true);
    // The bar begins one gap after the label, not a third of the row in.
    expect(short.indexOf("\u25b0"), "the label's width plus one gap, and no more").toBe(4);
    // And the cells the padding used to take are the bar's: 18 − 3 = 15 back.
    expect(cellsOf(short) - cellsOf(some), "a short label spends what it is, not what it may").toBe(15);
  });
});
