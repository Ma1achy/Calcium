// C26 §7a — focus pulls the viewport, by the minimum (§021, §095).
//
// **One sentence and two axes.** §021 states it of a scroll box's rows and
// §095's rule 2 states it of a tape's members in the same words, so the rows
// here are about a distance rather than about a container: what differs between
// the two callers is the unit, and the unit belongs to the container.
import { describe, it } from "vitest";

describe("C26 §7a — the pull", () => {
  it.todo("T1.48 (C26 I24, §7a, §021) — not deferred on a component: the pull lands in this MR's second commit: the pull is the minimum distance, from both sides, and a target taller than the window shows its head");

  it.todo("T1.49 (C26 I24, §7a, C04 I125) — not deferred on a component: the pull lands in this MR's second commit: tapeWindow's start and pullIntoView's agree over a uniform tape with costless marks");

  it.todo("T1.50 (C26 I25, §7a, C04 I124) — not deferred on a component: the pull lands in this MR's second commit: tapeStart is a fixed point, differs from the from-the-head answer, and does not depend on the tick");

  it.todo("T4.60 (C26 I24, §7a, §021) — not deferred on a component: the pull lands in this MR's second commit: in a session, scrolling does not move focus and the next focus move pulls the window back");

  it.todo("T4.61 (C26 I25, §7a, C04 I124) — not deferred on a component: the pull lands in this MR's second commit: in a session, a tape's window stays where the walk put it");
});
