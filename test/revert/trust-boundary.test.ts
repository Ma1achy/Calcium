// C09 §7d — the trust boundary, tier 6. Each row names the change that makes it fail.
import { describe, it } from "vitest";

describe("C09 §7d — tier 6", () => {
  it.todo(
    "T6.142 (C09 I124): #resolve handing the block un-neutralised → T2.191 fails on patch's path, hunk header and line text — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T6.144 (C09 I125): the bidi arm without U+2066–U+2069 → T1.86 and T2.192 fail on the isolates — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T6.145 (C09 I127): the sweep on a bare registry → T2.190 fails on the kinds — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T6.146 (C09 I126): copyOf handing the caller's block → T2.193 fails on every kind that copies — not deferred on a component: the code lands in the next commit of this round",
  );
});
