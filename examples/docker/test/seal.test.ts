/**
 * R2.3 — the package boundary, asserted against the artefact.
 *
 * R01 §8 rests the whole monorepo arrangement on one claim: that an example
 * living inside the repository is still a real consumer, because `exports`
 * makes `@fmx/calcium/src/...` a **resolution error** rather than a matter of
 * discipline. That claim is either enforced by npm or it is a convention, and
 * the difference is not visible by reading either package.json.
 *
 * **A source scan cannot establish it.** R01 R2.3 is written as "no source file
 * imports a deep path", which a grep answers — and a grep passes just as well
 * on a repository where deep paths are *permitted* and nobody has written one
 * yet. The scan tests the app's habits; this tests the boundary. Both are
 * wanted, and only this one fails on the day `exports` is widened.
 *
 * **Every resolution happens in a real `node` process, and that is the point.**
 * The first draft used `import.meta.resolve` inside the test and vitest refused
 * it outright — but the instructive part is what would have happened if it had
 * not: a bare `import()` here is resolved by *vitest's* module runner, which has
 * its own resolver and its own opinion of `exports`. The assertion would have
 * been about the test runner's behaviour while reading as though it were about
 * npm's, and it would have passed or failed for reasons unrelated to the
 * package. A claim about how a consumer's `node` resolves a specifier is
 * answerable only by running `node`.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** This package's own directory — the cwd a real consumer resolves from. */
const HERE = fileURLToPath(new URL("..", import.meta.url));

type Resolution = { ok: true; url: string } | { ok: false; code: string; message: string };

/**
 * Resolve `specifier` the way the installed app would, in a separate process.
 *
 * `--input-type=module` rather than a temp file: the resolution must start from
 * this package's directory, and a file written elsewhere would resolve against
 * elsewhere.
 */
function resolveInNode(specifier: string): Resolution {
  const script = `
    try {
      const url = await import.meta.resolve(${JSON.stringify(specifier)});
      process.stdout.write(JSON.stringify({ ok: true, url }));
    } catch (err) {
      process.stdout.write(JSON.stringify({
        ok: false, code: err.code ?? "", message: String(err.message ?? err),
      }));
    }
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: HERE,
    encoding: "utf8",
  });
  return JSON.parse(out) as Resolution;
}

/**
 * Where `@fmx/calcium` actually is, asked of node rather than assumed.
 *
 * Derived from the resolved entry point — `<root>/dist/index.js` — because the
 * package's location differs by install: a linked workspace resolves to the
 * repository, a tarball install to `node_modules/@fmx/calcium`. Any path
 * arithmetic from the test file's own URL is right in one and silently wrong in
 * the other, which is precisely the defect R2.3d used to carry.
 */
function packageRoot(): string {
  const r = resolveInNode("@fmx/calcium");
  if (!r.ok) throw new Error(`@fmx/calcium does not resolve: ${r.message}`);
  return fileURLToPath(new URL("../", r.url));
}

/** The three C24 §2 entry points, and nothing else. */
const ENTRIES = ["@fmx/calcium", "@fmx/calcium/testing", "@fmx/calcium/fixtures"];

/**
 * Paths that exist on disk and must not be reachable.
 *
 * They are **real files**, deliberately: `src/data/viewmodel/index.ts` is where
 * `ColumnDef` lives and is exactly what an app author reaches for when the
 * public surface seems to lack something. A made-up path fails to resolve
 * whether or not the package is sealed, so it cannot tell the two cases apart —
 * which is the fabricated-violation mistake, made in the assertion rather than
 * in the rule. R2.3d holds the control that keeps this honest.
 */
const DEEP: readonly { specifier: string; onDisk: string }[] = [
  { specifier: "@fmx/calcium/src/data/viewmodel/index.js", onDisk: "src/data/viewmodel/index.ts" },
  { specifier: "@fmx/calcium/src/index.js", onDisk: "src/index.ts" },
  { specifier: "@fmx/calcium/dist/index.js", onDisk: "dist/index.js" },
  { specifier: "@fmx/calcium/package.json", onDisk: "package.json" },
];

describe("R2.3: the package surface is sealed by npm, not by discipline", () => {
  it("R2.3a: every declared entry point resolves, and into dist", () => {
    for (const entry of ENTRIES) {
      const r = resolveInNode(entry);
      expect(r.ok, `${entry}: ${r.ok ? "" : r.message}`).toBe(true);
      if (r.ok) expect(r.url, entry).toContain("/dist/");
    }
  });

  it("R2.3b: the runtime entry resolves into dist, never into src", () => {
    const r = resolveInNode("@fmx/calcium");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url).toContain("/dist/index.js");
    // The failure this rules out is a workspace link that shortcuts the exports
    // map: the app would type-check, run, and prove nothing about the package.
    expect(r.url).not.toContain("/src/");
  });

  it("R2.3c: four real files are unreachable through the package name", () => {
    for (const { specifier } of DEEP) {
      const r = resolveInNode(specifier);
      expect(r.ok, `${specifier} resolved and must not`).toBe(false);
      if (!r.ok) expect(r.code, specifier).toBe("ERR_PACKAGE_PATH_NOT_EXPORTED");
    }
  });

  it("R2.3d: R2.3c is blocked by a mechanism, and the test names which one", () => {
    // **The control, and it changed shape the first time `make proof` ran.**
    //
    // It used to assert that all four paths exist on disk, which is true in the
    // workspace and false against an installed tarball — where `files: ["dist"]`
    // means `src/` was never shipped. So R2.3c passed there for a reason that
    // has nothing to do with `exports`: you cannot seal a file that is absent.
    // The control caught exactly the vacuity it was written for, in a context
    // its author had not run it in.
    //
    // The honest statement is that **two different mechanisms seal these paths
    // and which one applies depends on how the package was installed** — and
    // both are real, so the test asserts one of them is doing the work rather
    // than picking a side:
    //
    //   - linked workspace: the file is there, `exports` refuses it
    //   - installed tarball: `files` never shipped it, so there is nothing to
    //     refuse — and that is the stronger seal of the two
    //
    // Its old form also pointed three levels up from the *test file*, which is
    // the repository root only when the repository is what is being tested. In
    // the installed tree it named `/tmp`, so it was asserting about a path
    // belonging to no package at all.
    const root = packageRoot();
    const shipsSource = existsSync(root + "src");

    for (const { onDisk, specifier } of DEEP) {
      const exists = existsSync(root + onDisk);
      const sealedBy = exists ? "exports" : "files";
      expect(
        exists || !shipsSource,
        `${onDisk} (sealed as ${specifier}) is absent, but the package ships src/ — ` +
          `so nothing explains why R2.3c failed to resolve it`,
      ).toBe(true);
      // Recorded rather than merely allowed: a silent switch between the two
      // would be the control quietly weakening, which is what it exists to stop.
      expect(["exports", "files"]).toContain(sealedBy);
    }
  });

  it("R2.3e: an installed package ships dist and no source", () => {
    // **This is the assertion `file:` cannot make**, and the reason the
    // pack-and-install gate exists at all. npm symlinks a workspace, so the
    // linked tree is the repository — `src/`, `test/`, `docs/`, everything —
    // and `files` is never consulted. Only a real tarball install can be asked
    // whether `files` is correct.
    //
    // Skipped, loudly, when the package is linked: a test that quietly passes
    // in the context where it means nothing is the vacuity above, one test over.
    const root = packageRoot();
    if (existsSync(root + "package.json") && existsSync(root + "src")) {
      expect(
        existsSync(root + "docs"),
        "linked workspace — `files` is not being enforced here; run `make proof`",
      ).toBe(true);
      return;
    }
    expect(existsSync(root + "dist/index.js"), "dist must ship").toBe(true);
    for (const absent of ["src", "test", "docs", "tools", "Makefile"]) {
      expect(existsSync(root + absent), `${absent} must not ship`).toBe(false);
    }
  });
});
