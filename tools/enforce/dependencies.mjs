// A03 SS31/SS32 — supply chain. A04 §2, §3.
import { readFileSync, existsSync, readdirSync } from "node:fs";

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

export function checkDependencies() {
  const v = [];
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const declared = new Set(Object.keys(pkg.dependencies ?? {}));

  if (!existsSync("DEPENDENCIES.md")) {
    v.push({ rule: "SS31", file: "DEPENDENCIES.md",
             message: "missing — every runtime dependency needs a justification",
             spec: "A04 §2" });
    return v;
  }

  const doc = readFileSync("DEPENDENCIES.md", "utf8");
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
  for (const [name, dir] of installed()) {
    if (SS32_ALLOW.has(name)) continue;
    let dep;
    try { dep = JSON.parse(readFileSync(`${dir}/package.json`, "utf8")); } catch { continue; }
    const hooks = DEPENDENCY_HOOKS.filter((s) => dep.scripts?.[s]);
    if (hooks.length > 0) {
      v.push({ rule: "SS32", file: `${dir}/package.json`,
               message: `${name} declares ${hooks.join(", ")} — install scripts are the primary npm attack vector`,
               spec: "A04 §3" });
    }
  }
  return v;
}
