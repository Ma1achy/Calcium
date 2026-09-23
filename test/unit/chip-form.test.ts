// C17 §5c — the chip's label and its ground.
//
// **Spec-first**: the rows are `it.todo` until the parts reach `Chip` and
// `chipSpans` comes off the walk. Each names what it is waiting for (SP9), and
// each title is one literal — a blocker clause split across a join is read by
// nothing (TD5, A03 §9a).
import { describe, it } from "vitest";

describe("C17 §5c — the chip", () => {
  it.todo(
    "T1.44 (C17 I25, §5c): the label is composed from the parts, and the bracket is the 1-bit rung — not deferred on a component: `Chip` is `{label, content}` and carries no `ordinal`, `kind`, `name` or `lines` for a label to be composed from",
  );
  it.todo(
    "T1.45 (C17 I26, §5c, §099): a chip moves whole and no row holds a prefix of its label — not deferred on a component: the property holds today and this row is its watch, so what is missing is the composed label — a row asserting the application's string measures the shell's label builder and not the editor's",
  );
  it.todo(
    "T1.46 (C17 I26, §5c): `chipSpans` slices exactly the label out of the row `layout` returns — not deferred on a component: `chipSpans` does not exist; the walk returns rows and cells and nothing names the cells a chip occupies",
  );
  it.todo(
    "T1.47 (C17 I25, §5c, I20): a chip wider than the row overflows and its span still names its cells — not deferred on a component: the same missing function T1.46 names, `chipSpans`, which is unwritten",
  );
});
