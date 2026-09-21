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

// **T5.7 stood here** (F1192, and the invariant C24 §5 retires): a child under the import trace calling
// `prepareLaunch()` and then importing `dist/index.js`, listing under ten
// es-toolkit modules where the same child without the call listed over a
// thousand — both arms in one row, the plain one the fabricated violation. The
// invariant is retired with Ink (F1209): the barrel it narrowed belonged to a
// dependency that is no longer in the tree, the entry point is deleted, and a
// row here would be counting resolutions of a package nothing installs.


describe("C24 I38 — every entry resolves into one bundled graph", () => {
  it("T5.8 (C24 I38, F1193): the bundled runtime under the import trace is under four hundred modules with nothing from the emulator or the renderer, the five entries' export keys equal the tsc files', a b.live declaration made through the runtime is read by the testing entry's liveParts, the emulator chunk appears only after a shell command, and exports resolve into dist/bundle beside files that exist", async () => {
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
    const graph = JSON.parse(lines[0] ?? "{}") as { afterImport?: string[] };
    const names = (JSON.parse(lines[1] ?? "{}") as { names?: Record<string, { bundled: string[]; tree: string[] }> }).names ?? {};
    const live = (JSON.parse(lines[2] ?? "{}") as { live?: unknown }).live;
    const before = (JSON.parse(lines[3] ?? "{}") as { beforeShell?: string[] }).beforeShell ?? [];
    const after = JSON.parse(lines[4] ?? "{}") as { afterShell?: string[]; seen?: boolean };

    // **The graph.** Bundled: a few hundred where the tree was 1,130. It opened
    // by reading the launcher's `"hooked"` back off the child, which is gone
    // with the entry (F1209) — the bound below is what the row was ever about.
    const imported = graph.afterImport ?? [];
    const count = imported.length; // cells-ok
    // **The floor was 50 and the graph is 40**, measured 2026-09-17 after Ink,
    // react and es-toolkit left the tree (F1209, F1212) — the third bound in
    // this repository taken from the population it bounds, and so the third to
    // inverse the moment that population is what the work is shrinking. The
    // ceiling is the claim and the floor only refutes *nothing was traced*, so
    // the floor moves to ten and the ceiling stays where it was.
    expect(count, "modules on the bundled runtime's import").toBeGreaterThan(10);
    expect(count).toBeLessThan(400);
    const forbidden = (urls: readonly string[]): string[] => urls.filter((u) => u.includes("/@xterm/headless/") || u.includes("/beautiful-mermaid/") || u.includes("/elkjs/") || /\/emulator-[^/]*\.js$/.test(u));
    expect(forbidden(imported), "nothing from the emulator or the renderer").toEqual([]);
    expect(imported.some((u) => u.includes("/dist/bundle/index.js")), "the bundled runtime is what loaded").toBe(true);

    // **The same names, five times** — six until `./launch` went with Ink (F1209).
    const entries = ["index.js", "mermaid.js", "testing/index.js", "fixtures/index.js", "shell/profiling/index.js"];
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

    // **The map.** Five defaults under dist/bundle, five types under dist, every one a file.
    const root = new URL("../../", import.meta.url);
    const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as { exports: Record<string, { types: string; default: string }> };
    const subpaths = Object.keys(pkg.exports);
    expect(subpaths).toHaveLength(5);
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
