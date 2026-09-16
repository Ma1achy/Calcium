// C24 T5.7 (C24 I37) — the child under `import-trace.mjs`: `armed` calls
// `prepareLaunch()` before the runtime import and then renders through Ink;
// `plain` imports the runtime as a consumer who never called it would (F1192).
import { appendFileSync } from "node:fs";
const [OUT, MODE] = [process.argv[2], process.argv[3]];
if (OUT === undefined || (MODE !== "armed" && MODE !== "plain")) throw new Error("usage: launch-graph-child.mjs <out-file> armed|plain");
const emit = (o) => appendFileSync(OUT, JSON.stringify(o) + "\n");
const trace = globalThis.__importTrace;
if (typeof trace !== "function") throw new Error("run under --import ./test/support/import-trace.mjs");

const status = MODE === "armed" ? (await import("../../dist/launch.js")).prepareLaunch() : "not called";
await import("../../dist/index.js");
const esToolkit = trace().filter((u) => u.includes("/es-toolkit/")).map((u) => u.slice(u.indexOf("/es-toolkit/")));
emit({ mode: MODE, status, esToolkit });

if (MODE === "armed") {
  // **A redirect that links and never runs is what a graph row cannot see.**
  // `renderToString` constructs an Ink instance, whose constructor calls the
  // very `throttle` the hook redirected.
  const React = await import("react");
  const { renderToString, Text } = await import("ink");
  emit({ rendered: renderToString(React.createElement(Text, null, "armed")) });
}
