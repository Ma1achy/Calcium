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

describe("C24 I37 — prepareLaunch narrows Ink's es-toolkit import to one module", () => {
  it("T5.7 (C24 I37, F1192): a child under the import trace calling prepareLaunch() then importing dist/index.js lists under ten es-toolkit modules and none of the barrel's re-exports, the same child without the call over a thousand, and the armed child renders a block through Ink; exports[\"./launch\"] resolves to ./dist/launch.js", async () => {
    // **Both arms in one row.** The plain child is the fabricated violation
    // — a consumer who never called it — and it is what shows the trace sees
    // the barrel at all; a small armed count with no large plain count would
    // be an instrument that lists nothing.
    const here = new URL("../support/", import.meta.url);
    const dir = mkdtempSync(join(tmpdir(), "launch-graph-"));
    const child = async (mode: "armed" | "plain"): Promise<string[]> => {
      const out = join(dir, `${mode}.jsonl`);
      await execFileP(process.execPath, [
        "--import", fileURLToPath(new URL("import-trace.mjs", here)),
        fileURLToPath(new URL("launch-graph-child.mjs", here)),
        out, mode,
      ], { timeout: 60_000 });
      return readFileSync(out, "utf8").split("\n").filter((l) => l.startsWith("{"));
    };
    try {
      const [armed, plain] = await Promise.all([child("armed"), child("plain")]);
      const armedGraph = JSON.parse(armed[0] ?? "{}") as { status?: string; esToolkit?: string[] };
      const plainGraph = JSON.parse(plain[0] ?? "{}") as { status?: string; esToolkit?: string[] };
      const rendered = JSON.parse(armed[1] ?? "{}") as { rendered?: string };
      expect(armedGraph.status, "the hooks were installed on this Node").toBe("hooked");
      expect(plainGraph.status).toBe("not called");
      const plainCount = (plainGraph.esToolkit ?? []).length; // cells-ok
      const armedCount = (armedGraph.esToolkit ?? []).length; // cells-ok
      expect(plainCount, "the barrel, unnarrowed, is over a thousand modules").toBeGreaterThan(1000);
      expect(armedCount, `armed: ${(armedGraph.esToolkit ?? []).join(", ")}`).toBeLessThan(10);
      expect(armedGraph.esToolkit ?? [], "none of the barrel's re-exports").not.toContainEqual(expect.stringContaining("/compat/array/chunk.mjs"));
      expect(plainGraph.esToolkit ?? [], "the plain child does list them").toContainEqual(expect.stringContaining("/compat/array/chunk.mjs"));
      expect(rendered.rendered, "Ink ran with the redirected throttle").toContain("armed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as { exports: Record<string, { types: string; default: string }> };
    expect(pkg.exports["./launch"]).toEqual({ types: "./dist/launch.d.ts", default: "./dist/launch.js" });
  }, 120_000);
});

describe("C24 I38 — every entry resolves into one bundled graph", () => {
  it.todo("T5.8 (C24 I38, F1193): the armed bundled runtime under the import trace is under four hundred modules with nothing from the emulator or the renderer, the six entries' export keys equal the tsc files', SurfaceError is one object across the runtime and testing entries, and the emulator chunk appears only after a shell command; exports resolve into dist/bundle — not deferred on a component: the code commit replaces this row");
});

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
