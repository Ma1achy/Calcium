// C28 I65 — a sampled frame is located through its chunk's source map when the
// profile is folded, and a frame with no map keeps its URL (F1193).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createSourceLocator } from "../../src/shell/profiling/locate.js";
import { foldCpuProfile } from "../../src/shell/profiling/stacks.js";

// `AAAA,EACA;AACA`: generated (0,0) → source line 0; (0,2) → line 1; (1,0) → line 2.
const MAP = { version: 3, sources: ["../src/a.ts"], names: [], mappings: "AAAA,EACA;AACA" };
// The first mapping is on generated line 2, so line 0 is before any mapping.
const LATE = { version: 3, sources: ["../src/a.ts"], names: [], mappings: ";;AAAA" };

describe("C28 I65 — the frame locator", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const chunkIn = (map: unknown | null): { url: string; dir: string } => {
    const dir = mkdtempSync(join(tmpdir(), "locate-"));
    dirs.push(dir);
    const bundle = join(dir, "bundle");
    writeFileSync(join(dir, "keep"), "");
    // dist/bundle/chunk.js beside dist/bundle/chunk.js.map, sources ../src/a.ts → dist/src/a.ts
    // — the shape esbuild writes, relative to the map.
    const { mkdirSync } = require("node:fs") as typeof import("node:fs");
    mkdirSync(bundle);
    const chunk = join(bundle, "chunk-ABC.js");
    writeFileSync(chunk, "x;y;\nz;\n");
    if (map !== null) writeFileSync(`${chunk}.map`, typeof map === "string" ? map : JSON.stringify(map));
    return { url: pathToFileURL(chunk).href, dir };
  };

  it("T1.129 (C28 I65, F1193): a frame in a chunk beside its map answers the original source and line; map absent, malformed or not covering the position answers null; the map is read once; foldCpuProfile draws the located name with the locator and the URL without", () => {
    // **Located.** Three frames in one chunk, one read.
    const { url, dir } = chunkIn(MAP);
    const reads: string[] = [];
    const locate = createSourceLocator((p) => { reads.push(p); return require("node:fs").readFileSync(p, "utf8") as string; });
    const expected = pathToFileURL(join(dir, "src", "a.ts")).href;
    expect(locate(url, 0, 0)).toEqual({ url: expected, line: 0 });
    expect(locate(url, 0, 2), "the column selects the segment").toEqual({ url: expected, line: 1 });
    expect(locate(url, 1, 0)).toEqual({ url: expected, line: 2 });
    expect(reads, "the map is read once for three frames").toEqual([`${new URL(url).pathname}.map`]);

    // **The three nulls.**
    expect(createSourceLocator()(chunkIn(null).url, 0, 0), "no map beside the chunk").toBeNull();
    expect(createSourceLocator()(chunkIn("{ not json").url, 0, 0), "a map that does not parse").toBeNull();
    expect(createSourceLocator()(chunkIn(LATE).url, 0, 0), "a position before the first mapping").toBeNull();
    expect(createSourceLocator()(chunkIn(LATE).url, 2, 0), "and the same map answers where it maps").toEqual(expect.objectContaining({ line: 0 }));
    expect(createSourceLocator()("node:internal/x", 0, 0), "a URL that is not a file").toBeNull();

    // **The fold.** One node at the chunk's (0,2), drawn located and not.
    const profile = {
      nodes: [
        { id: 1, callFrame: { functionName: "(root)", url: "", lineNumber: -1 }, children: [2] },
        { id: 2, callFrame: { functionName: "work", url, lineNumber: 0, columnNumber: 2 } },
      ],
      samples: [2, 2],
      timeDeltas: [100, 100],
    };
    const plain = foldCpuProfile(profile);
    const located = foldCpuProfile(profile, locate);
    expect(plain?.root.children[0]?.at, "without a locator, V8's url:line").toBe(`${url}:1`);
    expect(located?.root.children[0]?.at, "with it, the source and its 1-based line").toBe(`${expected}:2`);
    expect(located?.root.children[0]?.self, "and nothing else about the frame moves").toBe(plain?.root.children[0]?.self);
  });
});
