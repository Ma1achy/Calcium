// A call's state, from the outcome it settles with to the tone and mark its head
// draws — C04 I141, C09 I45, C23 I81, R-BLK-214, R-BLK-220 (review batch 2, M4
// items 1–3).
//
// **One file for three specs' rows, because the defect lived between them.**
// `callState` classified an outcome, `rollUp` classified it again, `callHead`
// chose a tone apart from either, and `headMark` resolved a mark from the state
// alone. Each was consistent with itself; what shipped was a failed call drawn
// as a blue `●` beside its parent's `1 failed`.
import { describe, it } from "vitest";

describe("C23 I81 — one classifier for a call's state and its parent's rollup", () => {
  it.todo(
    "T1.76 (C23 I81, I59, I62): exit N, each failure word, exit 0, a count and cancelled — the built head's state and tone and rollUp's parts, read together — not deferred on a component: the code lands in the next commit of this round",
  );
});

describe("C04 I141 — a notice's state names its tone and its glyph", () => {
  it.todo(
    "T2.136 (C04 I141): validateDocument refuses a state outside CallState and a tone or glyph disagreeing with the state, each naming the field — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T2.137 (C04 I141, C09 I45): b.notice with a state writes the state's tone and glyph and refuses a disagreeing tone; callHead writes both — not deferred on a component: the code lands in the next commit of this round",
  );
});

describe("C09 I45 — the call head, rendered", () => {
  it.todo(
    "T2.187 (C09 I45, C04 I141, R-BLK-214, R-BLK-220): five states through callHead and the renderer at 24-, 8- and 4-bit read as a cell and an SGR; 1 bit and ASCII five marks — not deferred on a component: the code lands in the next commit of this round",
  );
});
