// C26 §7a — focus pulls the viewport, by the minimum (§021, §095).
//
// **One sentence and two axes.** §021 states it of a scroll box's rows and
// §095's rule 2 states it of a tape's members in the same words, so the rows
// here are about a distance rather than about a container: what differs between
// the two callers is the unit, and the unit belongs to the container.
import { describe, it } from "vitest";

describe("C26 §7a — the pull", () => {
  it.todo("T1.48 (C26 I24, §7a, §021) — not deferred on a component: the pull lands in this MR's second commit: the pull is the minimum distance, from both sides, and a target taller than the window shows its head");

  it.todo("T1.49 (C26 I24, §7a) — not deferred on a component: the pull lands in this MR's second commit: scrolling does not move focus, and the next focus move pulls the viewport back");

  it.todo("T1.50 (C26 I25, §7a, C04 I124) — not deferred on a component: the pull lands in this MR's second commit: a tape's window is held between frames rather than recomputed from the head");
});
