/**
 * The executable bit as a checked property of the tree.
 *
 * **This exists because a mode is the one file property no instrument reads.**
 * Every gate here compares bytes — golden frames, the SVG baselines, the
 * mutation anchors, `enforce`'s scans. A mode-only diff has an identical blob on
 * both sides, so it is invisible to all of them, and it is invisible to review
 * for the same reason: there is nothing in the patch to read. `tools/enforce/
 * index.mjs` lost its exec bit mid-round and was restored with the writer
 * unnamed, and the writer stayed unnamed because **no file in this repository
 * chmods anything** — measured, the only `chmod` occurrences are in scratch
 * output and one devcontainer command. It is not nameable from inside, so the
 * question was the wrong one and this is the right one: not *who wrote it*, but
 * *is the set what we think it is*. FINDINGS F774, F1041.
 *
 * **What the census turned up on the way.** Fourteen tracked files carried mode
 * `100755`; thirteen open with a shebang and one did not — `examples/plots/
 * main.ts`, which begins `/**`. It is not a `bin` target in any of the three
 * example packages (those are the three `bin/*-tui.js` files, all correct), so
 * npm's chmod — F56's mechanism, and the explanation this would otherwise have
 * inherited — does not reach it. Without a shebang the kernel cannot execute it
 * whatever its mode, so the bit meant nothing and was removed rather than
 * exempted. **Its mode had flipped three times**, once mode-only with an
 * identical blob on both sides (`0772f856`), in the commit whose subject is
 * *F56 closed at the instance*.
 *
 * **Compared by equality, both directions.** A subset check in either direction
 * is silent about the other half: contained-in-the-list lets a new executable
 * arrive unread, and contained-in-the-tree lets a deleted entry sit here
 * forever. That is this repository's standing ruling on exemption lists and it
 * is why the assertion is a set and not a loop.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every tracked file that git records as mode `100755`, and nothing else.
 * A file arriving here or leaving is a decision; this row makes it one.
 */
const EXECUTABLE = Object.freeze([
  ".githooks/pre-commit",
  "examples/docker/bin/docker-json",
  "examples/docker/bin/docker-tui.js",
  "examples/minimal/bin/svc",
  "examples/minimal/bin/svc-tui.js",
  "examples/plots/bin/plots",
  "examples/plots/bin/plots-tui.js",
  "examples/plots/test/run-in-pty.py",
  "test/support/farside.mjs",
  "tools/enforce/index.mjs",
  "tools/proof.sh",
  "tools/terminal-probe/probe.py",
  "tools/terminal-read.sh",
]);

function trackedExecutables(): string[] {
  const out = execFileSync("git", ["ls-files", "-s"], { encoding: "utf8" });
  return out
    .split("\n")
    .filter((l) => l.startsWith("100755 "))
    .map((l) => l.split("\t")[1] ?? "")
    .filter((p) => p !== "")
    .sort();
}

describe("the executable bit", () => {
  it("X1 (F774): the set of executables is exactly the stated set", () => {
    // Equality, so both directions fail loudly — a new executable that nobody
    // decided on, and an entry here whose file has gone.
    expect(trackedExecutables()).toEqual([...EXECUTABLE].sort());
  });

  it("X2 (F774): every executable opens with a shebang, and that is why the set is short", () => {
    // **The property that makes the bit mean something.** A file with the bit
    // and no shebang cannot be run: the kernel has no interpreter to hand it
    // to. So this is not style — it is the difference between an executable and
    // a file wearing the mode. The one file that failed it was not a `bin`
    // target either, which is what ruled out F56's npm-chmod explanation.
    const missing = EXECUTABLE.filter((p) => !readFileSync(p, "utf8").startsWith("#!"));
    expect(missing, "executable, but the kernel has no interpreter for it").toEqual([]);
  });

  it("X3 (F774): the reader sees the modes it claims to, and is not answering from an empty list", () => {
    // **The control.** X1 and X2 are both satisfied by a reader that returns
    // nothing — `git ls-files -s` misparsed, a filter that matches no line, a
    // path column read from the wrong field. Then the set is empty, equality
    // holds against an empty constant, and every shebang check passes over no
    // files at all. This is the fabricated-violation discipline pointed at this
    // file's own instrument rather than at its subject.
    const found = trackedExecutables();
    expect(found.length, "git reported no executables at all — the reader is broken").toBeGreaterThan(5);
    expect(found, "the reader must see a file known to be executable").toContain("tools/enforce/index.mjs");
    const all = execFileSync("git", ["ls-files", "-s"], { encoding: "utf8" }).split("\n");
    expect(all.length, "git listed almost nothing — the corpus is not the tree").toBeGreaterThan(300);
  });
});
