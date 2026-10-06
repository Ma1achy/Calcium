// RULING-a — the rows that stopped reading wall-clock, each broken so the shape or the pairing has to see it (F1348, F1351, F1406, F1447).
//
// **Each mutation makes the subject slower or wrong in the way the row's claim
// is about**, and the control is one that kills every row at once.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const FILES = "test/edge/manifest.test.ts test/edge/view-model.test.ts test/unit/plot-performance.test.ts test/contract/surface.test.ts";

const results = runPass({
  read,
  write,
  run: () => {
    try {
      return execSync(`npx vitest run ${FILES}`, { cwd: ROOT, encoding: "utf8", timeout: 900_000 });
    } catch (e) {
      return `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
  },
  control: {
    file: "src/data/manifest/find.ts",
    from: "  return null;\n}\n\n/**\n * The tools an app offers",
    to: "  throw new Error(\"control\");\n}\n\n/**\n * The tools an app offers",
    why: "findTool throws, so the manifest rows fail",
  },
  mutations: [
    {
      // C05 T3.14's lookup half: an index answers in the same time at any size.
      name: "findTool scans the manifest instead of using its index",
      file: "src/data/manifest/find.ts",
      from: "    const tool = index.byName.get(tokens.slice(0, n).join(\" \"));",
      to: "    const key = tokens.slice(0, n).join(\" \");\n    const tool = [...index.byName.values()].find((t) => t.name === key);",
      expect: "T3.14",
    },
    {
      // C04 T3.14: validation of ten thousand blocks against an eighth.
      name: "validation compares every block with every other",
      file: "src/data/viewmodel/validate.ts",
      from: "  // I14 — unique within the document, nested children included. This is what",
      to: "  if (isArray(doc[\"blocks\"])) for (const p of doc[\"blocks\"]) for (const q of doc[\"blocks\"]) void (p === q);\n  // I14 — unique within the document, nested children included. This is what",
      expect: "T3.14",
    },
    {
      // C04 T3.18: a merge is linear because both sides are indexed.
      name: "merge scans for each row instead of indexing",
      file: "src/data/viewmodel/patch.ts",
      from: "  const present = new Set(existing.map((r) => r.id));",
      to: "  const present = { has: (id: string) => existing.some((r) => r.id === id) };",
      expect: "T3.18",
    },
    {
      name: "merge's updates are found by scanning the payload",
      file: "src/data/viewmodel/patch.ts",
      from: "  const updates = new Map(incoming.map((r) => [r.id, r]));",
      to: "  const updates = { get: (id: string) => incoming.find((r) => r.id === id) };",
      expect: "T3.18",
    },
    {
      // plot-performance: a render that costs tens of references.
      name: "kde does the kernel sum sixty times over",
      file: "src/presentation/plot/derive.ts",
      from: "    for (const xi of data) sum += gaussianKernel((x - xi) / h);",
      to: "    for (let rep = 0; rep < 60; rep += 1) for (const xi of data) sum += gaussianKernel((x - xi) / h);",
      expect: "KDE with 1000 samples",
    },
    {
      // C16 T1.170: the synthesised release arrives with the press, in the same window.
      name: "the legacy release is synthesised with no delay",
      file: "src/shell/surface.ts",
      from: "const LEGACY_RELEASE_MS = 50;",
      to: "const LEGACY_RELEASE_MS = 0;",
      expect: "T1.170",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
