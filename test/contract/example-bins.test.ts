/**
 * Every shipped command, as the kernel will run it — F56's class rather than its
 * instance (F858).
 *
 * **F56 was found, fixed and closed for one app of three.** `docker-tui` got a
 * `.js` launcher with a shebang and a row asserting it; `plots-tui` and
 * `svc-tui` kept `"bin": "./main.ts"` — a TypeScript file with no shebang — and
 * nothing ran either. Measured before this file existed:
 *
 *     $ ./main.ts          (plots, mode 755)
 *     ./main.ts: line 1: /bin: Is a directory
 *     ./main.ts: line 2: README.md: command not found
 *
 *     $ ./main.ts          (minimal, mode 644)
 *     bash: ./main.ts: Permission denied
 *
 * The docstring's opening `/**` is read by `sh` as a glob. The two failed
 * differently and for one reason: npm chmods a bin target to 755 on install, so
 * the second becomes the first the moment anybody installs it.
 *
 * **A sweep over the set rather than a row per app**, because the defect is that
 * a per-app row existed for one app. The list of manifests is read from the
 * directory, so an example added tomorrow is covered without anyone remembering
 * this file — the allow-list direction rather than the narrow-glob one.
 *
 * `examples/docker/test/bin.test.ts` keeps its own rows: they are F56's record,
 * they spawn the command as a program, and this file does not replace them.
 */
import { execFile } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = new URL("../../examples/", import.meta.url);

type Declared = Readonly<{ app: string; name: string; target: string; path: string }>;

const declared: readonly Declared[] = readdirSync(fileURLToPath(root), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const manifest = new URL(`${entry.name}/package.json`, root);
    let parsed: { bin?: Record<string, string> };
    try {
      parsed = JSON.parse(readFileSync(manifest, "utf8")) as { bin?: Record<string, string> };
    } catch {
      return [];
    }
    return Object.entries(parsed.bin ?? {}).map(([name, target]) => ({
      app: entry.name,
      name,
      target,
      path: fileURLToPath(new URL(`${entry.name}/${target}`, root)),
    }));
  });

describe("F858: every example's bin is a command, not a declaration", () => {
  it("F858: the sweep found the commands it is written about", () => {
    // **A sweep whose corpus is empty passes**, which is SS26's shape and the
    // reason this row is first. Three apps ship a command today; a fourth
    // arriving does not fail here, but zero does.
    expect([...declared.map((d) => d.name)].sort()).toEqual([
      "docker-tui",
      "plots-tui",
      "svc-tui",
    ]);
  });

  for (const { app, name, target, path } of declared) {
    describe(`${app} · ${name}`, () => {
      it("F56: the target is a launcher, not a module", () => {
        // Not a style preference: Node strips types by default only from 22.18,
        // and `engines` says `>=22`. On 22.0 a `.ts` bin fails with a syntax
        // error inside a file the user did not write.
        expect(target, `${name} points at ${target}`).toMatch(/\.js$/u);
      });

      it("F56: it has a shebang, or the kernel has nothing to hand it to", () => {
        expect(readFileSync(path, "utf8").startsWith("#!"), `${target} has no shebang`).toBe(true);
      });

      it("F56: it has the execute bit", () => {
        // npm chmods a bin target to 755 on install, so an installed consumer is
        // fine either way. What this guards is everyone reading the tree without
        // an install in between — git records the mode, and a fresh clone runs
        // the path directly.
        //
        // **Known limit, in the harness rather than the row**: the repository is
        // bind-mounted through Docker Desktop, which does not propagate the
        // host's mode, so a `chmod` on the host cannot make this fail. Inside
        // the container it can, and git records `100755`.
        // eslint-disable-next-line no-bitwise
        expect(statSync(path).mode & 0o111, `${target} is not executable`).not.toBe(0);
      });

      it("F853: NODE_ENV is set before the app is imported, and the import is dynamic", () => {
        // **The second half of F853, and the ordering is the whole of it.** ESM
        // evaluates every static import before the module body runs, so an
        // assignment above `import "../main.ts"` executes *after* `ink` has
        // resolved `react-reconciler` and chosen its build — a line that reads
        // as the fix and cannot be one. The dynamic import is what puts the
        // assignment first.
        const source = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
        const assignment = source.indexOf("process.env.NODE_ENV");
        const dynamic = source.indexOf("await import(");

        expect(assignment, `${target} does not set NODE_ENV`).toBeGreaterThan(-1);
        expect(dynamic, `${target} does not import the app dynamically`).toBeGreaterThan(-1);
        expect(assignment, "the assignment runs before the import").toBeLessThan(dynamic);
        expect(source, "a static import of the app would hoist above the assignment").not.toMatch(
          /^\s*import\s+["']\.\./mu,
        );
        expect(source, "and the variable a consumer set is kept").toContain("??=");
      });

      it(
        "F56: executing it reaches the application",
        async () => {
          // **Spawned as a program**, so the kernel honours the shebang, node
          // loads the launcher, the dynamic import resolves, `main.ts` is
          // type-stripped and run, capabilities are detected and the terminal is
          // found wanting. stdout is a pipe, so the app takes its no-TTY branch
          // and exits 0. Nothing shallower can go wrong without this failing.
          const { stdout } = await run(path, [], { timeout: 60_000 });
          expect(stdout).toContain(name);
          expect(stdout).toContain("needs a terminal");
        },
        90_000,
      );
    });
  }
});
