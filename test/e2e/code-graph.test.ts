// C09 I71 — what the code block's module loads, read from a real child under the
// import trace (the T5.22 pattern): the tokeniser's core, the sixteen grammars
// §4a names, and nothing from the wrapper whose package entry loads them all.
import { describe, it } from "vitest";

describe("C09 e2e — the code block's import graph", () => {
  it.todo(
    "T5.6 (C09 I71): a child importing dist/presentation/blocks/kinds/code.js under the import trace lists highlight.js/lib/core.js, exactly the sixteen grammar files and nothing from lowlight, and after registerGrammar with a seventeenth grammar lists that one file more — not deferred on a component: the code commit replaces this row",
  );
});
