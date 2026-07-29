// A03 SS31/SS32 — supply chain. A04 §2, §3.
import { readFileSync, existsSync, readdirSync } from "node:fs";

/** The rules this module implements. See MODULE_GRAPH_RULES for why. */
export const DEPENDENCY_RULES = ["SS31", "SS32", "SS38"];

const INSTALL_HOOKS = ["preinstall", "install", "postinstall", "prepare"];

/**
 * Over the tree, only the three hooks npm actually runs for an installed
 * dependency. `prepare` is not one of them: it runs in a package's own
 * directory and for a git dependency, never on a published tarball — which is
 * why A04 commitment 13 rules out git dependencies rather than `prepare`.
 *
 * Eighteen packages in this tree declare `prepare` and not one of them executes.
 * Flagging them would train everyone to ignore SS32, which is worse than not
 * having it. Our own manifest is still checked on all four.
 */
const DEPENDENCY_HOOKS = ["preinstall", "install", "postinstall"];

/**
 * SS32's exceptions, named rather than implicit, with the reason each is
 * tolerable. Anything else acquiring an install script fails the build.
 *
 * `node-pty` ships darwin and win32 prebuilds only, so Linux — every
 * devcontainer, all of CI — compiles it. `--ignore-scripts` stays set for the
 * whole tree and `make install` invokes that one build by name; the difference
 * is that we invoke it rather than letting a hook run unsupervised (A04 §3).
 *
 * `esbuild` is transitive under vitest and its postinstall is *suppressed* —
 * we never run it. npm installs the platform binary as an optional dependency
 * instead, and the hook is the fallback for installers that cannot. Listed
 * rather than silently skipped: if a vitest upgrade ever makes that fallback
 * load-bearing, the tests fail and this comment is where the reason is.
 */
const SS32_ALLOW = new Set(["node-pty", "esbuild"]);

/** Installed packages, one level of scope nesting deep. */
function* installed(root = "node_modules") {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === ".bin") continue;
    if (e.name.startsWith("@")) yield* installed(`${root}/${e.name}`);
    else yield [e.name, `${root}/${e.name}`];
  }
}

/**
 * Package names justified by DEPENDENCIES.md — read only from the sections that
 * list *installed* packages.
 *
 * Scraping the whole document also picked up the "What is deliberately NOT a
 * dependency" table, which is prose about absence: a backticked package name
 * there reported as `"x" is justified but not installed — stale entry`, which
 * is precisely backwards.
 */
export function justifiedIn(doc) {
  const INSTALLED = /^##\s+(Runtime|Development)\b/;
  const names = new Set();
  let inSection = false;

  for (const line of doc.split("\n")) {
    if (line.startsWith("## ")) {
      inSection = INSTALLED.test(line);
      continue;
    }
    if (!inSection) continue;
    const m = /^\|\s*`([^`]+)`/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

/**
 * The disk, injected. SS31 and SS32 are the two rules whose fabricated
 * violation cannot be a file path — one needs a manifest, the other a tree —
 * so the reads are parameters rather than calls (A03 commitment 14).
 */
export function checkDependencies(io = {}) {
  const readFile = io.readFile ?? ((f) => readFileSync(f, "utf8"));
  const exists = io.exists ?? existsSync;
  const tree = io.tree ?? installed();

  const v = [];
  const pkg = JSON.parse(readFile("package.json"));
  const declared = new Set(Object.keys(pkg.dependencies ?? {}));

  if (!exists("DEPENDENCIES.md")) {
    v.push({ rule: "SS31", file: "DEPENDENCIES.md",
             message: "missing — every runtime dependency needs a justification",
             spec: "A04 §2" });
    return v;
  }

  const doc = readFile("DEPENDENCIES.md");
  const justified = justifiedIn(doc);

  for (const d of declared) {
    if (!justified.has(d)) {
      v.push({ rule: "SS31", file: "package.json",
               message: `runtime dependency "${d}" has no entry in DEPENDENCIES.md`,
               spec: "A04 §2" });
    }
  }
  for (const j of justified) {
    if (!declared.has(j) && !Object.keys(pkg.devDependencies ?? {}).includes(j)) {
      v.push({ rule: "SS31", file: "DEPENDENCIES.md",
               message: `"${j}" is justified but not installed — stale entry`,
               spec: "A04 §2" });
    }
  }

  for (const s of INSTALL_HOOKS) {
    if (pkg.scripts?.[s]) {
      v.push({ rule: "SS32", file: "package.json",
               message: `"${s}" script present — install scripts are banned`,
               spec: "A04 §3" });
    }
  }

  // A03 scopes SS32 to "the install tree", not to our own manifest. Checking
  // only package.json would have passed on a tree where every dependency ran
  // code at install time, which is the thing the rule exists to prevent.
  for (const [name, dir] of tree) {
    if (SS32_ALLOW.has(name)) continue;
    let dep;
    try { dep = JSON.parse(readFile(`${dir}/package.json`)); } catch { continue; }
    const hooks = DEPENDENCY_HOOKS.filter((s) => dep.scripts?.[s]);
    if (hooks.length > 0) {
      v.push({ rule: "SS32", file: `${dir}/package.json`,
               message: `${name} declares ${hooks.join(", ")} — install scripts are the primary npm attack vector`,
               spec: "A04 §3" });
    }
  }
  return v;
}

/**
 * SS38 — a bare import in `src/` of a package that is not a declared runtime
 * dependency.
 *
 * SS31 compares `package.json` against `DEPENDENCIES.md`, and both were clean
 * while `src/` imported `highlight.js`, which appeared in neither: `lowlight`
 * depends on it, npm hoisted it, the import resolved, `tsc` was happy and every
 * gate passed. That is the shape this catches — a **phantom dependency**, whose
 * whole failure mode is that "it resolved, so it must be declared" is exactly
 * the reasoning that does not hold.
 *
 * It breaks on someone else's release: the day `lowlight` drops the dependency,
 * or a package manager stops hoisting, an import we never justified disappears.
 * And it is a supply-chain hole in the meantime — a package nobody reviewed,
 * pinned or wrote a row for, executing in the product.
 *
 * Scoped to `src/` because that is what ships. A test importing `vitest` is
 * fine; `src/` importing anything but a runtime dependency is not, including a
 * devDependency, which is absent from a consumer's install.
 *
 * Node builtins are not dependencies: `node:fs` is the runtime.
 */
const BARE_IMPORT = /^\s*(?:import|export)\b(?:[^'"]*?from\s*)?['"]([^'".][^'"]*)['"]/gm;

/** `@scope/name/deep/path` → `@scope/name`; `pkg/sub` → `pkg`. */
function packageOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

export function checkPhantomImports(files, io = {}) {
  const readFile = io.readFile ?? ((f) => readFileSync(f, "utf8"));
  const pkg = JSON.parse(readFile("package.json"));
  const declared = new Set(Object.keys(pkg.dependencies ?? {}));
  const dev = new Set(Object.keys(pkg.devDependencies ?? {}));

  const violations = [];
  for (const file of files) {
    const f = file.replaceAll("\\", "/");
    if (!f.startsWith("src/")) continue;

    const src = readFile(file);
    BARE_IMPORT.lastIndex = 0;
    let m;
    while ((m = BARE_IMPORT.exec(src))) {
      const specifier = m[1];
      if (specifier.startsWith("node:")) continue;
      const name = packageOf(specifier);
      if (declared.has(name)) continue;

      violations.push({
        rule: "SS38",
        file: f,
        message: dev.has(name)
          ? `imports "${name}", a devDependency — src/ ships, and a consumer's install does not have it`
          : `imports "${name}", which is not a declared runtime dependency — a phantom ` +
            `dependency resolves today because something else pulled it in, and disappears ` +
            `on someone else's release`,
        spec: "A04 §2 · C09 §4a",
      });
    }
  }
  return violations;
}
