/**
 * `@fmx/calcium/mermaid` — the Mermaid transform, as an entry of its own
 * (C24 §2, C24 I36).
 *
 * **Separate for a cost, not an audience.** `mermaidCode` is synchronous and
 * `beautiful-mermaid` is ESM-only, so the runtime barrel could only carry it by
 * importing the renderer — a layout engine — for every consumer, whether or not
 * a diagram is ever drawn: about a quarter of a cold import (F1188). A consumer
 * that draws diagrams imports this line and pays what it always paid, when it
 * chooses. The function is `presentation/mermaid.ts`'s, unchanged.
 */
export { mermaidCode } from "./presentation/mermaid.js";
