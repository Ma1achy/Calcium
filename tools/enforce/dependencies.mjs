// A03 SS31/SS32 — supply chain. A04 §2, §3.
import { readFileSync, existsSync } from "node:fs";

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

  for (const s of ["preinstall", "install", "postinstall", "prepare"]) {
    if (pkg.scripts?.[s]) {
      v.push({ rule: "SS32", file: "package.json",
               message: `"${s}" script present — install scripts are banned`,
               spec: "A04 §3" });
    }
  }
  return v;
}
