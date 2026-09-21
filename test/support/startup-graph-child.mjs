// C23 I71 / T5.22's child: import the built package and list the graph, then
// run one shell command through the route and list it again.
//
// **Against `dist/`, over the bench's fakes** — the row is about what the
// shipped package loads, and a session over fakes is the cheapest thing that
// runs the shell route end to end. Two JSON lines on stdout: `afterImport`
// and `afterShell`, each the module list at that moment.
import { performance } from "node:perf_hooks";
import { appendFileSync } from "node:fs";
// **To a file, not the pipe**: a synchronous write to a non-blocking pipe stops
// at the pipe's capacity and a 146 KB list arrived cut at 146 176 bytes.
const OUT = process.argv[2];
if (OUT === undefined) throw new Error("usage: startup-graph-child.mjs <out-file>");
const emit = (o) => appendFileSync(OUT, JSON.stringify(o) + "\n");
const trace = globalThis.__importTrace;
if (typeof trace !== "function") throw new Error("run under --import ./test/support/import-trace.mjs");

const { createTui, defaultTheme } = await import("../../dist/index.js");
emit({ afterImport: trace() });

const { fakeStdin, fakeStdout, screenRows } = await import("../../tools/bench/fakes.mjs");
const SIZE = { columns: 80, rows: 24 };
const stdout = fakeStdout(SIZE);
const stdin = fakeStdin();
const tui = createTui({
  name: "startup-graph", binary: "/bin/true",
  manifest: { schema: "tui.manifest/1", binary: "startup-graph", version: "1.0.0", tools: [] },
  theme: defaultTheme, env: { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_GB.UTF-8", PATH: process.env["PATH"] ?? "" },
  stdout, stdin,
});
await tui.start();
const settle = async (turns) => { for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r)); };
await settle(4);
stdin.emit("echo tracer-ok");
await settle(1);
stdin.emit("\r");
const t0 = performance.now();
let seen = false;
while (performance.now() - t0 < 15_000) {
  await new Promise((r) => setTimeout(r, 25));
  if (screenRows(stdout.chunks, SIZE).some((row) => row.includes("tracer-ok") && !row.includes("echo tracer-ok"))) { seen = true; break; }
}
emit({ afterShell: trace(), seen, screen: seen ? undefined : screenRows(stdout.chunks, SIZE).filter((r) => r.trim() !== "") });
await tui.stop("exit");
process.exit(0);
