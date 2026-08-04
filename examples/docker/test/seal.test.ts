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
const CALCIUM = fileURLToPath(new URL("../../../", import.meta.url));

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

  it("R2.3d: each sealed path exists on disk — otherwise R2.3c proves nothing", () => {
    // The control. Without it R2.3c passes identically against a package with
    // no `src/` at all, and would keep passing after `exports` was widened to
    // something that still did not happen to name these four files.
    for (const { onDisk, specifier } of DEEP) {
      expect(existsSync(CALCIUM + onDisk), `${onDisk} (sealed as ${specifier})`).toBe(true);
    }
  });
});
