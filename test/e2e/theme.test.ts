// C10 tier 5 — e2e. Every one of these needs a rendered frame, so every one of
// them waits on the renderer that produces it.
import { describe, it } from "vitest";

describe("C10 e2e", () => {
  it.todo("T5.1: golden frames for every block kind, both variants, four depths — waits on C09");
  it.todo("T5.2: a real session under TERM=xterm emits no truecolour escapes — waits on L4");
  it.todo("T5.3: a real session under TERM=dumb emits no colour at all, statuses still distinct — waits on L4");
  it.todo("T5.4: /theme toggled fifty times mid-session — no flicker, no half-themed frame — waits on L4");
});
