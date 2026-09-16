// C24 T5.6 (C24 I36) — the runtime barrel imports nothing from the Mermaid
// renderer; the transform is its own entry, `@fmx/calcium/mermaid` (F1188).
//
// **The graph, not a duration** (C23 I71's argument, T5.22's instrument). A
// timing row is green on a fast machine with the renderer still on the graph
// and red on a slow one with it gone; the module list under the import trace
// is the same on both.
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    expect(pkg.exports["./launch"]).toEqual({ types: "./dist/launch.d.ts", default: "./dist/bundle/launch.js" });
  }, 120_000);
});

describe("C24 I38 — every entry resolves into one bundled graph", () => {
  it("T5.8 (C24 I38, F1193): the armed bundled runtime under the import trace is under four hundred modules with nothing from the emulator or the renderer, the six entries' export keys equal the tsc files', a b.live declaration made through the runtime is read by the testing entry's liveParts, the emulator chunk appears only after a shell command, and exports resolve into dist/bundle beside files that exist", async () => {
    const here = new URL("../support/", import.meta.url);
    const dir = mkdtempSync(join(tmpdir(), "bundle-graph-"));
    const out = join(dir, "trace.jsonl");
    try {
      await execFileP(process.execPath, [
        "--import", fileURLToPath(new URL("import-trace.mjs", here)),
        fileURLToPath(new URL("bundle-graph-child.mjs", here)),
        out,
      ], { timeout: 90_000 });
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
    const lines = readFileSync(out, "utf8").split("\n").filter((l) => l.startsWith("{"));
    rmSync(dir, { recursive: true, force: true });
    const graph = JSON.parse(lines[0] ?? "{}") as { status?: string; afterImport?: string[] };
    const names = (JSON.parse(lines[1] ?? "{}") as { names?: Record<string, { bundled: string[]; tree: string[] }> }).names ?? {};
    const live = (JSON.parse(lines[2] ?? "{}") as { live?: unknown }).live;
    const before = (JSON.parse(lines[3] ?? "{}") as { beforeShell?: string[] }).beforeShell ?? [];
    const after = JSON.parse(lines[4] ?? "{}") as { afterShell?: string[]; seen?: boolean };

    // **The graph.** Armed, bundled: a few hundred where the tree was 1,130.
    expect(graph.status).toBe("hooked");
    const imported = graph.afterImport ?? [];
    const count = imported.length; // cells-ok
    expect(count, "modules on the bundled runtime's import").toBeGreaterThan(50);
    expect(count).toBeLessThan(400);
    const forbidden = (urls: readonly string[]): string[] => urls.filter((u) => u.includes("/@xterm/headless/") || u.includes("/beautiful-mermaid/") || u.includes("/elkjs/") || /\/emulator-[^/]*\.js$/.test(u));
    expect(forbidden(imported), "nothing from the emulator or the renderer").toEqual([]);
    expect(imported.some((u) => u.includes("/dist/bundle/index.js")), "the bundled runtime is what loaded").toBe(true);

    // **The same names, six times.**
    const entries = ["index.js", "launch.js", "mermaid.js", "testing/index.js", "fixtures/index.js", "shell/profiling/index.js"];
    expect(Object.keys(names).sort()).toEqual([...entries].sort());
    for (const e of entries) expect(names[e]?.bundled, `${e}: the bundled entry's names are the tree's`).toEqual(names[e]?.tree);
    expect(names["index.js"]?.bundled ?? [], "and the runtime has its names").toContain("createTui");

    // **One instance.** The runtime's b.live is read by testing's liveParts.
    expect(live, "liveParts sees the declaration b.live made").toEqual(["one"]);

    // **The emulator, after and not before.**
    // The renderer is on this list legitimately — the parity arm imported the
    // mermaid entry — so before the command only the emulator is forbidden.
    const emulatorIn = (urls: readonly string[]): string[] => urls.filter((u) => u.includes("/@xterm/headless/") || /\/emulator-[^/]*\.js$/.test(u));
    expect(emulatorIn(before), "before the shell command").toEqual([]);
    expect(after.seen, "the shell command's output reached the screen").toBe(true);
    const emulator = after.afterShell ?? [];
    expect(emulator.some((u) => /\/emulator-[^/]*\.js$/.test(u)), "the emulator chunk is loaded by the command").toBe(true);
    expect(emulator.some((u) => u.includes("/@xterm/headless/")), "and the emulator's package with it").toBe(true);

    // **The map.** Six defaults under dist/bundle, six types under dist, every one a file.
    const root = new URL("../../", import.meta.url);
    const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as { exports: Record<string, { types: string; default: string }> };
    const subpaths = Object.keys(pkg.exports);
    expect(subpaths).toHaveLength(6);
    for (const sub of subpaths) {
      const target = pkg.exports[sub];
      if (target === undefined) throw new Error(sub);
      expect(target.default.startsWith("./dist/bundle/"), `${sub} default → ${target.default}`).toBe(true);
      expect(target.types.startsWith("./dist/") && !target.types.startsWith("./dist/bundle/"), `${sub} types → ${target.types}`).toBe(true);
      expect(existsSync(new URL(target.default, root)), `${target.default} exists`).toBe(true);
      expect(existsSync(new URL(target.types, root)), `${target.types} exists`).toBe(true);
    }
  }, 150_000);
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
      default: "./dist/bundle/mermaid.js",
    });
  }, 90_000);
});
