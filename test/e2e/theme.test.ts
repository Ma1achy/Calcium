// C10 tier 5 — e2e. Every one of these needs a rendered frame, so every one of
// them waits on the renderer that produces it.
import { describe, it } from "vitest";

describe("C10 e2e", () => {
  // C09's fourteen have golden frames as of C09 — `test/golden/blocks.test.ts`,
  // four widths × both variants × both unicode modes. What is still deferred is
  // the *whole* union: `table`, `plot` and `patch` are registered by C11, C12
  // and C25, so "every block kind" cannot be honest until they exist.
  it.todo("T5.1: golden frames for every block kind, both variants, four depths — waits on C11, C12 and C25");
  it.todo("T5.2: a real session under TERM=xterm emits no truecolour escapes — waits on L4");
  it.todo("T5.3: a real session under TERM=dumb emits no colour at all, statuses still distinct — waits on L4");
  it.todo("T5.4: /theme toggled fifty times mid-session — no flicker, no half-themed frame — waits on L4");
});
