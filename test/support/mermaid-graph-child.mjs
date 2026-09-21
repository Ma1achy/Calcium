// C24 I36 / T5.6's child: import the built runtime barrel and list the graph,
// then import the mermaid entry, list it again and render one flowchart.
//
// **Against `dist/`**, because the row is about what the shipped package loads.
// Two JSON lines to a file (a pipe cuts a long list, as startup-graph-child.mjs
// found): `afterImport` — the barrel's graph and the names it exports — and
// `afterMermaid` — the graph once `dist/mermaid.js` is in, with the rendering.
import { appendFileSync } from "node:fs";
const OUT = process.argv[2];
if (OUT === undefined) throw new Error("usage: mermaid-graph-child.mjs <out-file>");
const emit = (o) => appendFileSync(OUT, JSON.stringify(o) + "\n");
const trace = globalThis.__importTrace;
if (typeof trace !== "function") throw new Error("run under --import ./test/support/import-trace.mjs");

const runtime = await import("../../dist/index.js");
emit({ afterImport: trace(), names: Object.keys(runtime) });

const { mermaidCode } = await import("../../dist/mermaid.js");
const SOURCE = "graph TD\n  A[Start] --> B{Choice}\n";
const drawn = mermaidCode(SOURCE, { unicode: "full", ambiguousWidth: "narrow" });
emit({ afterMermaid: trace(), drawn });
