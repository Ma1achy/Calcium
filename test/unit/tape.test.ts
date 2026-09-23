// C04 §3ao — the tape's window (§095).
//
// **The rows are the walk's, and they were written before the kind existed.**
// §095's figure fixes the marks and the minimum move; the walk's own
// measurement fixes the rest — the cost of a window is not monotone in its
// bounds, because a residue mark disappears when the run reaches an end, so
// *grow while it fits* draws fewer members than fit. That is asserted against
// an exhaustive scan rather than against a fixture, because a fixture agrees
// with a greedy implementation at every width where the two happen to meet.
import { describe, it } from "vitest";

describe("C04 §3ao — the tape", () => {
  it.todo("T1.48 (C04 I124, §3ao, §095) — not deferred on a component: the kind's renderer lands in this MR's second commit, and these rows are the spec's own: a tape round-trips, a current naming no member draws no mark, and every member keeps its id through every window");

  it.todo("T1.49 (C04 I125, §3ao, §095) — not deferred on a component: the kind's renderer lands in this MR's second commit, and these rows are the spec's own: §095's moves drawn back, and the window is the maximum run that fits from the minimum start that reaches the current, against an exhaustive scan");

  it.todo("T1.50 (C04 I126, §3ao, §095) — not deferred on a component: the kind's renderer lands in this MR's second commit, and these rows are the spec's own: every detail or none, the details stay gone once the window has slid, and a member wider than the width truncates rather than vanishing");
});
