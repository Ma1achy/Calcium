// C24 T5.6 (C24 I36) — the runtime barrel imports nothing from the Mermaid
// renderer; the transform is its own entry, `@fmx/calcium/mermaid` (F1188).
//
// **The graph, not a duration** (C23 I71's argument, T5.22's instrument). A
// timing row is green on a fast machine with the renderer still on the graph
// and red on a slow one with it gone; the module list under the import trace
// is the same on both.
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { mermaidCode } from "../../src/presentation/mermaid.js";
import { FULL_CAPS } from "../support/render.js";

const execFileP = promisify(execFile);

describe("C24 I36 — the Mermaid renderer is off the runtime barrel's graph", () => {
  it("T5.6 (C24 I36, F1188): a child importing dist/index.js under the import trace loads nothing from beautiful-mermaid or elkjs and exports no mermaidCode; after importing dist/mermaid.js the renderer is in the list and the rendering equals the contract corpus's; the exports map names the entry", async () => {
    const here = new URL("../support/", import.meta.url);
    const dir = mkdtempSync(join(tmpdir(), "mermaid-graph-"));
    const out = join(dir, "trace.jsonl");
    try {
      await execFileP(process.execPath, [
        "--import", fileURLToPath(new URL("import-trace.mjs", here)),
        fileURLToPath(new URL("mermaid-graph-child.mjs", here)),
        out,
      ], { timeout: 60_000 });
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
    const lines = readFileSync(out, "utf8").split("\n").filter((l) => l.startsWith("{"));
    rmSync(dir, { recursive: true, force: true });
    const first = JSON.parse(lines[0] ?? "{}") as { afterImport?: string[]; names?: string[] };
    const second = JSON.parse(lines[1] ?? "{}") as { afterMermaid?: string[]; drawn?: { kind: string; text: string } };
    const renderer = (urls: readonly string[]): string[] =>
      urls.filter((u) => u.includes("/beautiful-mermaid/") || u.includes("/elkjs/"));

    expect(first.afterImport?.length ?? 0, "the import loaded the package").toBeGreaterThan(100);
    expect(first.afterImport?.some((u) => u.endsWith("/dist/index.js")), "the barrel is in the list").toBe(true);
    expect(renderer(first.afterImport ?? []), "and nothing from the renderer's packages is").toEqual([]);
    expect(first.names ?? [], "the barrel exports no mermaidCode").not.toContain("mermaidCode");
    expect(first.names ?? [], "and still exports the runtime").toContain("createTui");

    // The second import is what makes the first an assertion rather than an
    // absence: the renderer is reachable, and the entry is what reaches it.
    expect(renderer(second.afterMermaid ?? []).length, "the mermaid entry loaded the renderer").toBeGreaterThan(0);
    const expected = mermaidCode("graph TD\n  A[Start] --> B{Choice}\n", FULL_CAPS);
    expect(second.drawn?.kind).toBe("code");
    expect(second.drawn?.text, "the same function, byte for byte").toBe(expected.text);

    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      exports: Record<string, { types?: string; default?: string }>;
    };
    expect(pkg.exports["./mermaid"], "@fmx/calcium/mermaid resolves to the entry barrel").toEqual({
      types: "./dist/mermaid.d.ts",
      default: "./dist/mermaid.js",
    });
  }, 90_000);
});
