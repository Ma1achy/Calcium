// C24 T5.8 (C24 I38) — the child under `import-trace.mjs` over the bundled
// entries: the runtime's graph, the five entries' names against the tsc
// tree's, one instance across runtime and testing, and the emulator chunk only
// after a shell command (F1193).
import { performance } from "node:perf_hooks";
import { appendFileSync } from "node:fs";
const OUT = process.argv[2];
if (OUT === undefined) throw new Error("usage: bundle-graph-child.mjs <out-file>");
const emit = (o) => appendFileSync(OUT, JSON.stringify(o) + "\n");
const trace = globalThis.__importTrace;
if (typeof trace !== "function") throw new Error("run under --import ./test/support/import-trace.mjs");

// **`prepareLaunch()` was called here first** and its `"hooked"` reported back
// as `status`, because the graph this child traces was the narrowed one. The
// entry is gone with Ink (F1209) and so is the field: the runtime is imported
// the way any consumer imports it.
const runtime = await import("../../dist/bundle/index.js");
emit({ afterImport: trace() });

// **The same names.** Each bundled entry against the tsc file it was built from.
const ENTRIES = ["index.js", "mermaid.js", "testing/index.js", "fixtures/index.js", "shell/profiling/index.js"];
const names = {};
for (const e of ENTRIES) {
  const bundled = await import(`../../dist/bundle/${e}`);
  const tree = await import(`../../dist/${e}`);
  names[e] = { bundled: Object.keys(bundled).sort(), tree: Object.keys(tree).sort() };
}
emit({ names });

// **One instance.** `b.live` from the runtime records its declaration where
// `liveParts` from the testing entry reads it (C24 I24) — two copies of that
// module and the testing entry sees nothing.
const { b } = runtime;
const { liveParts } = await import("../../dist/bundle/testing/index.js");
const doc = { blocks: [b.live({ id: "one", title: "one", fetch: async () => null, render: () => b.text("x") })] };
let live;
try { live = liveParts(doc).map((p) => p.block.id ?? p.block.kind); } catch (e) { live = { error: String(e) }; }
emit({ live });

// **The emulator, after a shell command and not before.**
const { createTui, defaultTheme } = runtime;
const { fakeStdin, fakeStdout, screenRows } = await import("../../tools/bench/fakes.mjs");
const SIZE = { columns: 80, rows: 24 };
const stdout = fakeStdout(SIZE);
const stdin = fakeStdin();
const tui = createTui({
  name: "bundle-graph", binary: "/bin/true",
  manifest: { schema: "tui.manifest/1", binary: "bundle-graph", version: "1.0.0", tools: [] },
  theme: defaultTheme, env: { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_GB.UTF-8", PATH: process.env["PATH"] ?? "" },
  stdout, stdin,
});
await tui.start();
const settle = async (turns) => { for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r)); };
await settle(4);
emit({ beforeShell: trace() });
stdin.emit("echo tracer-ok");
await settle(1);
stdin.emit("\r");
const t0 = performance.now();
let seen = false;
while (performance.now() - t0 < 15_000) {
  await new Promise((r) => setTimeout(r, 25));
  if (screenRows(stdout.chunks, SIZE).some((row) => row.includes("tracer-ok") && !row.includes("echo tracer-ok"))) { seen = true; break; }
}
emit({ afterShell: trace(), seen });
await tui.stop("exit");
process.exit(0);
