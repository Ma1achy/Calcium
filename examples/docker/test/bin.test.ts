/**
 * The `bin` entry — F56.
 *
 * **`package.json` declared this command from the app's first commit and it
 * could never have run.** `"docker-tui": "./src/main.ts"`: a TypeScript file,
 * mode `0644`, with no shebang. npm links whatever path it is given without
 * looking at either, so the declaration was accepted, published in the manifest,
 * described in the README-that-did-not-exist-yet, and named in the app's own
 * non-TTY help — which has been telling readers to run `docker-tui` for four
 * steps.
 *
 * Nothing caught it because nothing ran it. Every test imports the modules
 * directly; every session used `npm start`; `tools/capture.py` spawned
 * `node --experimental-strip-types src/main.ts`. **Three separate consumers,
 * all of them reaching around the entry point**, which is F7's shape and the
 * reason a fourth was needed.
 *
 * So the rows below deliberately spend nothing on the app's behaviour, which
 * twelve other files cover. They ask only the question no other file can: is
 * the thing npm is about to put on someone's `PATH` executable, and does
 * executing it reach the application?
 */

import { execFile } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as {
  bin: Record<string, string>;
};

/**
 * **Resolved through the manifest, never written out here.**
 *
 * A row that spawns `bin/docker-tui.js` by name passes on the day `package.json`
 * points somewhere else — it would test a file that exists rather than the entry
 * npm installs, which is the whole defect this file exists for. The path comes
 * from the field, so repointing the field moves the test with it.
 */
const declared = pkg.bin["docker-tui"];
const binPath = fileURLToPath(new URL(declared ?? "", root));

describe("F56: the bin is a claim about an executable", () => {
  it("the manifest declares one, and it is the launcher rather than a module", () => {
    expect(declared, "package.json must declare the command").toBeDefined();
    // The `.ts` form is the defect, not a style preference: Node strips types
    // by default only from 22.18, and `engines` says `>=22`. On 22.0 a `.ts`
    // bin fails with a syntax error inside a file the user did not write.
    expect(declared).toMatch(/\.js$/);
  });

  it("it has the execute bit — npm links the path without checking", () => {
    // **Known limit, and it is in the harness rather than in the row.** The
    // repository is bind-mounted into the devcontainer through Docker Desktop,
    // which does not propagate the host's mode: measured at the moment this was
    // written, `chmod 644` on the host left the container reading `755`. So
    // this row cannot be made to fail by a mutation applied on the host, and a
    // mutation run there is not evidence about it either way.
    //
    // It is not vacuous — `chmod 644` *inside* the container kills it, and git
    // records `100755`, so the mode a consumer installs is the one asserted
    // here. But the only place the mutation is meaningful is the container, and
    // saying so is cheaper than someone concluding the row is weak.
    // eslint-disable-next-line no-bitwise
    expect(statSync(binPath).mode & 0o111, `${declared} is not executable`).not.toBe(0);
  });

  it("it has a shebang, or the kernel has nothing to hand it to", () => {
    expect(readFileSync(binPath, "utf8").startsWith("#!")).toBe(true);
  });

  it("executing it reaches the application", async () => {
    // **Spawned as a program, not as an argument to node.** `node <path>` would
    // pass with no shebang and no execute bit, which is exactly the state that
    // shipped — the two rows above would then be the only thing standing
    // between the manifest and a broken command, and a structural assertion is
    // not a demonstration.
    //
    // stdout is a pipe here, so the app takes its no-TTY branch and exits 0.
    // That branch is the far end of the whole chain: the kernel honoured the
    // shebang, node loaded the launcher, the launcher's relative import
    // resolved, `main.ts` was type-stripped and run, capabilities were
    // detected, and the terminal was found wanting. Nothing shallower can go
    // wrong without this failing.
    const { stdout } = await run(binPath, [], { timeout: 30_000 });
    expect(stdout).toContain("docker-tui");
    expect(stdout).toContain("needs a terminal");
  }, 40_000);
});
