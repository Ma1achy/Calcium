// C09 I71 / T5.6's child: import the built code block and list the graph, then
// register a seventeenth grammar and list it again. Two JSON lines to the file
// named by argv[2]: `afterImport` and `afterRegister`, each the module list.
import { appendFileSync } from "node:fs";
const OUT = process.argv[2];
if (OUT === undefined) throw new Error("usage: code-graph-child.mjs <out-file>");
const emit = (o) => appendFileSync(OUT, JSON.stringify(o) + "\n");
const trace = globalThis.__importTrace;
if (typeof trace !== "function") throw new Error("run under --import ./test/support/import-trace.mjs");

const { registerGrammar, tokenise } = await import("../../dist/presentation/blocks/kinds/code.js");
emit({ afterImport: trace() });

const ruby = (await import("highlight.js/lib/languages/ruby")).default;
registerGrammar("ruby", ruby);
emit({ afterRegister: trace(), coloured: tokenise("def f\n  1\nend", "ruby").some((t) => t.slot !== null) });
