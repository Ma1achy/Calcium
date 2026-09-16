// C24 T5.6 (C24 I36) — the runtime barrel imports nothing from the Mermaid
// renderer; the transform is its own entry, `@fmx/calcium/mermaid` (F1188).
import { describe, it } from "vitest";

describe("C24 I36 — the Mermaid renderer is off the runtime barrel's graph", () => {
  it.todo("T5.6 (C24 I36, F1188): a child importing dist/index.js under the import trace loads nothing from beautiful-mermaid or elkjs, and after importing dist/mermaid.js the renderer is in the list and mermaidCode's output equals the contract corpus's — not deferred on a component: the code commit replaces this row");
});
