// C28 I65 — the built bundle's chunk, not a synthetic map (F1193). Tier 5
// because it reads dist/, which make e2e builds and make test does not.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createSourceLocator } from "../../src/shell/profiling/locate.js";
import { foldCpuProfile } from "../../src/shell/profiling/stacks.js";

describe("C28 I65 — a fold over the built bundle", () => {
  it("T5.5 (C28 I65, F1193): a profile naming the built dist/bundle chunk at createBlockRegistry's line and column folds to src/presentation/blocks/registry.ts and the declaration's line", () => {
    const bundle = new URL("../../dist/bundle/", import.meta.url);
    const files = readdirSync(fileURLToPath(bundle)).filter((f) => f.endsWith(".js"));
    const NEEDLE = "function createBlockRegistry(";
    const hits = files.map((f) => ({ f, text: readFileSync(new URL(f, bundle), "utf8") })).filter((x) => x.text.includes(NEEDLE));
    expect(hits.map((h) => h.f), "the declaration is in exactly one chunk").toHaveLength(1);
    const hit = hits[0];
    if (hit === undefined) throw new Error("unreachable");
    const lines = hit.text.split("\n");
    const line = lines.findIndex((l) => l.includes(NEEDLE));
    const column = (lines[line] ?? "").indexOf("createBlockRegistry");
    const url = new URL(hit.f, bundle).href;

    // The declaration's line in src/, read rather than assumed.
    const srcUrl = new URL("../../src/presentation/blocks/registry.ts", import.meta.url);
    const srcLine = readFileSync(srcUrl, "utf8").split("\n").findIndex((l) => l.startsWith("export function createBlockRegistry("));
    expect(srcLine, "the declaration is in src/").toBeGreaterThan(0);

    const folded = foldCpuProfile({
      nodes: [
        { id: 1, callFrame: { functionName: "(root)", url: "", lineNumber: -1 }, children: [2] },
        { id: 2, callFrame: { functionName: "createBlockRegistry", url, lineNumber: line, columnNumber: column } },
      ],
      samples: [2],
      timeDeltas: [50],
    }, createSourceLocator());
    expect(folded?.root.children[0]?.at).toBe(`${pathToFileURL(fileURLToPath(srcUrl)).href}:${String(srcLine + 1)}`);
  });
});
