/**
 * R01 R4.4, made runnable: *someone who is not its author builds a working TUI
 * from the README.*
 *
 * **The row that matters is the last one, and STEP8_WALK §A5 is why.** An
 * example verified by building a `ViewDocument` and asserting its blocks never
 * calls `createTui` at all — which is the exact surface F7 was about, where
 * `createTui` was unusable from the public entry point and invisible because
 * every internal caller reached around it. An example that reaches around it
 * would be the fifth such caller and would prove nothing.
 *
 * So it is spawned, in a terminal, and the assertion is on what the terminal
 * received.
 *
 * **Stated limitation**: this reads a byte stream, not a frame. A terminal
 * application redraws by overwriting, so a byte that was written and then
 * covered still appears here — `examples/docker` is where frames are read
 * properly, through a screen model, and VERIFYING.md §1 says why. What this row
 * establishes is that the chain ran end to end from the *packaged* surface:
 * `createTui` constructed, the shell opened, the far side was spawned, its JSON
 * reached the adapter, and blocks were drawn. That is the question F7 asks.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const here = (p: string): string => new URL(p, import.meta.url).pathname;

describe("the smallest complete example", () => {
  it("the far side emits one JSON object per line", async () => {
    // A fixture must be shown to respond before it is asserted against: if the
    // shim printed nothing, every row below would fail for a reason that has
    // nothing to do with Calcium.
    const { stdout } = await run(here("../bin/svc"), ["list", "--json"]);
    const lines = stdout.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({ name: "worker", replicas: 8 });
  });

  it("the README quotes this file rather than restating it", () => {
    // **`README.md` ships in the tarball** — it is in `files` — so a fenced
    // block in it is a published surface that nothing covers. A quoted example
    // that has drifted is worse than none: it fails on the reader's machine and
    // not on ours. STEP8_WALK §A6.
    const source = readFileSync(here("../main.ts"), "utf8");
    // **The README that ships, not the one in this repository.** `files` is
    // `["dist", "README.md", "LICENSE"]`, so a consumer installs it alongside
    // the code — and resolving it through the package means this row reads the
    // workspace copy in the dev loop and the *tarball's* copy under `make
    // proof`. A relative path to `../../../README.md` would read the repo in
    // both, which is the resolution that cannot see a packaging mistake.
    const pkgRoot = new URL("../", pathToFileURL(createRequire(import.meta.url).resolve("@fmx/calcium")));
    const readme = readFileSync(new URL("README.md", pkgRoot), "utf8");
    // **Anchored on a marker, not on "the first ts fence".** The first version
    // took the first one and landed on an unrelated `b.live` snippet — which is
    // how the row found that *that* block does not compile: no `title` (it is
    // required) and `data.cpu` on a value the builder types as `unknown`. A
    // test aimed by position drifts the moment prose is added above it.
    //
    // **Known limit**: only the marked block is checked. Short illustrative
    // snippets elsewhere in the README are not, and the `b.live` one is the
    // measured evidence that unchecked snippets go wrong.
    const fenced = readme.match(/<!-- verified against examples\/minimal\/main\.ts[^>]*-->\s*```ts\n([\s\S]*?)```/);
    expect(fenced, "the root README must carry the marked ts block").not.toBeNull();
    // Compared line by line and ignoring blank lines, so the README may omit
    // the comments — it may not disagree with the code.
    const meaningful = (s: string): string[] =>
      s.split("\n").map((l) => l.trimEnd()).filter((l) => l !== "" && !/^\s*(\/\*|\*|\/\/)/.test(l));
    for (const line of meaningful(fenced?.[1] ?? "")) {
      expect(meaningful(source), `README line not found in main.ts: ${line}`).toContain(line);
    }
  });

  it("it opens a shell, spawns the far side, and draws the table", async () => {
    const { stdout } = await run("python3", [here("run-in-pty.py"), "node", here("../main.ts")], {
      cwd: here(".."),
      maxBuffer: 8 << 20,
      timeout: 60_000,
    });
    expect(stdout.length, "the terminal received nothing at all").toBeGreaterThan(1000);
    // The heading is the framework's — the adapter supplied `label: "SERVICE"`
    // and C11 laid it out. Its presence means a table was rendered rather than
    // a document merely built.
    expect(stdout).toContain("SERVICE");
    for (const name of ["api", "worker", "cron"]) expect(stdout).toContain(name);
    // The notice below the table, which is the second block — so the document
    // was not truncated to its first.
    expect(stdout).toContain("3 services");
  }, 90_000);
});
