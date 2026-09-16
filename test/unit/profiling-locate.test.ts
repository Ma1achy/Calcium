// C28 I65 — a sampled frame is located through its chunk's source map when the
// profile is folded, and a frame with no map keeps its URL (F1193).
import { describe, it } from "vitest";

describe("C28 I65 — the frame locator", () => {
  it.todo("T1.129 (C28 I65, F1193): a frame in a chunk beside its map answers the original source and line; map absent, malformed or not covering the position answers null; the map is read once; foldCpuProfile draws the located name with the locator and the URL without — not deferred on a component: the code commit replaces this row");
});
