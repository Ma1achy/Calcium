// C28 I65 — the built bundle's chunk, not a synthetic map (F1193). Tier 5
// because it reads dist/, which make e2e builds and make test does not.
import { describe, it } from "vitest";

describe("C28 I65 — a fold over the built bundle", () => {
  it.todo("T5.5 (C28 I65, F1193): a profile naming the built dist/bundle chunk at createBlockRegistry's line and column folds to src/presentation/blocks/registry.ts and the declaration's line — not deferred on a component: the code commit replaces this row");
});
