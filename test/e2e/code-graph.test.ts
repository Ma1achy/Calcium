// C09 I71 — what the code block's module loads, read from a real child under the
// import trace (the T5.22 pattern): the tokeniser's core, the sixteen grammars
// §4a names, and nothing from the wrapper whose package entry loads them all.
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LANGUAGES } from "../../src/presentation/blocks/kinds/code.js";

const execFileP = promisify(execFile);

describe("C09 e2e — the code block's import graph", () => {
  it("T5.6 (C09 I71): a child importing dist/presentation/blocks/kinds/code.js under the import trace lists highlight.js's core, exactly the sixteen grammar files and nothing from lowlight, and after registerGrammar with a seventeenth grammar lists that one file more", async () => {
    const here = new URL("../support/", import.meta.url);
    const dir = mkdtempSync(join(tmpdir(), "code-graph-"));
    const out = join(dir, "trace.jsonl");
    try {
      await execFileP(process.execPath, [
        "--import", fileURLToPath(new URL("import-trace.mjs", here)),
        fileURLToPath(new URL("code-graph-child.mjs", here)),
        out,
      ], { timeout: 60_000 });
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
    const lines = readFileSync(out, "utf8").split("\n").filter((l) => l.startsWith("{"));
    rmSync(dir, { recursive: true, force: true });
    const first = JSON.parse(lines[0] ?? "{}") as { afterImport?: string[] };
    const second = JSON.parse(lines[1] ?? "{}") as { afterRegister?: string[]; coloured?: boolean };
    // **`es/` or `lib/`**: the package's exports map resolves `highlight.js/lib/core`
    // to its ESM build under `es/`, and the row is about the files, not the tree.
    const hljs = (urls: readonly string[]): string[] =>
      [...new Set(urls.flatMap((u) => { const m = /\/highlight\.js\/(?:es|lib)\/(.+)$/u.exec(u); return m?.[1] === undefined ? [] : [m[1]]; }))].sort();
    const grammars = (files: readonly string[]): string[] =>
      files.filter((f) => f.startsWith("languages/")).map((f) => f.slice("languages/".length, -".js".length));
    const before = hljs(first.afterImport ?? []);
    expect(before, "the core is on the graph").toContain("core.js");
    expect(grammars(before), "exactly the sixteen §4a names").toEqual([...DEFAULT_LANGUAGES]);
    expect((first.afterImport ?? []).filter((u) => u.includes("/lowlight/")), "and nothing from the wrapper").toEqual([]);
    const after = hljs(second.afterRegister ?? []);
    expect(after.filter((f) => !before.includes(f)), "one file more, the seventeenth grammar's").toEqual(["languages/ruby.js"]);
    expect(second.coloured, "which tokenises on the next call").toBe(true);
  }, 90_000);
});
