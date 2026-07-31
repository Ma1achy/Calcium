// C15 tier 5 — e2e. Entirely deferred, and that is the honest state.
//
// Every one of C15's tier-5 claims is about a layer *and its input*: a menu that
// flips and shows every candidate, a search that stacks over it and hands focus
// back, a confirm that ignores `esc` and answers to `n`. C15 supplies geometry
// and a stack; none of those sentences can be written without the router that
// routes to it and the engine that fills it.
//
// A tier-5 file asserting something C15 can do alone would look like coverage
// and be tier 1 in a different directory.
import { describe, it } from "vitest";

describe("C15 e2e — layers under real input", () => {
  // The flip is asserted as geometry in T3.5 and T3.5b. What is left here is
  // that it is *the completion menu* flipping, at a real terminal height, with
  // every candidate visible — which needs C19 to produce the candidates and the
  // shell to own the prompt they sit above.
  it.todo(
    "T5.1: a completion menu near the bottom flips above the prompt and shows every candidate — waits on C19 and L4",
  );
  it.todo(
    "T5.2: reverse-i-search over a completion menu — both stacked, keys to the search, esc returns to the menu. The stacking and routing halves are asserted in test/integration/router.test.ts — waits on C19 and C20",
  );
  // T4.5b asserts the ladder's shape against C15 alone. This is the same claim
  // through a real keystroke, and the rung that must not fire is the one that
  // pops the dashboard out from under the confirm.
  it.todo(
    "T5.3: a confirm inside the dashboard — drawn over it, esc does nothing, n resolves it and returns. The routing half is asserted in test/integration/router.test.ts T4.2; composing the session is what remains — waits on C22",
  );
  // C01 already delivers the SIGWINCH snapshot this needs; what is missing is
  // the thing that composes a frame from it, so the blocker is L4 alone. Naming
  // C01 alongside it made this expire the moment the rule ran, which is TD2
  // doing exactly what it is for.
  it.todo(
    "T5.4: resizing with three layers open — all reposition, none escapes the region, no blank frames — waits on L4",
  );
  it.todo(
    "T5.5: esc from the logs view — the view pops, a one-line trace appears, focus returns to the live block — waits on L4",
  );
});
