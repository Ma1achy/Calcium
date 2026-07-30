// C10 tier 5 — e2e. Every one of these needs a rendered frame, so every one of
// them waits on the renderer that produces it.
import { describe, it } from "vitest";

describe("C10 e2e", () => {
  // C09's fourteen have golden frames as of C09 — `test/golden/blocks.test.ts`,
  // four widths × both variants × both unicode modes. What is still deferred is
  // the *whole* union: `table`, `plot` and `patch` are registered by C11, C12
  // and C25, so "every block kind" cannot be honest until they exist.
  // "Every block kind" is the claim, and **one** kind is still unregistered. C11
  // and C12 have their own goldens — `table` and `plot` at four widths in both
  // variants, and C12's in both unicode modes as well (C11 T5.1, C12 T5.1); this
  // one is the whole vocabulary in one frame and waits on the last registrant.
  //
  // Restated rather than left naming both: TD0 expires a deferral when *any*
  // blocker it names is implemented, which is the strict reading and the right one —
  // a todo listing two components stops being an accurate account of what it waits
  // for the moment one of them lands, and "waits on C12 and C25" would have carried
  // C12's name for however long C25 took.
  it.todo("T5.1: golden frames for every block kind, both variants, four depths — waits on C25");
  it.todo("T5.2: a real session under TERM=xterm emits no truecolour escapes — waits on L4");
  it.todo("T5.3: a real session under TERM=dumb emits no colour at all, statuses still distinct — waits on L4");
  it.todo("T5.4: /theme toggled fifty times mid-session — no flicker, no half-themed frame — waits on L4");
});
