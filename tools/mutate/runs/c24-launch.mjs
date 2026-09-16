// C24 I37 — prepareLaunch narrows Ink's es-toolkit import to the one module it
// binds, exactly or not at all. Mutated (T6.20, F1192).
//
// **The pass rebuilds `dist/` before each run**: T5.7 spawns children over
// `dist/launch.js` and `dist/index.js`, so a mutation that never reaches
// `dist/` is a mutation of nothing (c09-token-emitter's precedent).
//
// **The control is a predicate that never arms.** T5.7's armed child then
// lists the whole barrel, and its `< 10` fails.
//
// **Blind spots, stated.** The `parentURL` and `specifier` checks in the
// resolve hook are not mutated: nothing else on the graph imports
// `es-toolkit/compat`, so no row can construct a second importer the
// redirect would wrongly reach. The arming flag itself (`!armed ||`) is not
// mutated for the same reason — with Ink's line present the armed and
// unarmed redirects agree — and T1.12 holds the predicate that sets it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npm run build >/dev/null 2>&1; npx vitest run test/unit/launch.test.ts test/e2e/public-api.test.ts";
const L = "src/launch.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: L,
    from: "  return inkSource.includes(INK_IMPORT_LINE);",
    to: "  return false;",
    why: "the redirect never arms: the armed child lists the whole barrel and T5.7's under-ten fails",
  },
  mutations: [
    {
      // **Armed on a substring.** The day Ink binds two names, the redirect
      // links `debounce` against a file exporting `throttle`.
      name: "LOOSE-ARM: the predicate arms on the specifier alone, not the line",
      file: L,
      from: "  return inkSource.includes(INK_IMPORT_LINE);",
      to: '  return inkSource.includes("es-toolkit/compat");',
      expect: "T1.12",
    },
    {
      // **Every index.mjs is the barrel.** Any package's entry under the
      // rewrite becomes a throttle path that is not there.
      name: "ANY-INDEX: the rewrite matches any /index.mjs tail, not the compat barrel's",
      file: L,
      from: "const BARREL_TAIL = /\\/compat\\/index\\.mjs$/;",
      to: "const BARREL_TAIL = /\\/index\\.mjs$/;",
      expect: "T1.12",
    },
    {
      // **No look at the disk.** A copy of es-toolkit laid out differently
      // fails to start instead of starting slowly.
      name: "NO-EXISTS: the narrow URL is returned without checking the file is there",
      file: L,
      from: "  return exists(fileURLToPath(narrow)) ? narrow : resolvedUrl;",
      to: "  void exists; return narrow;",
      expect: "T1.12",
    },
    {
      // **The disk asked about the wrong file.** The check passes on the
      // barrel that is known to exist and the narrow file is never checked.
      name: "EXISTS-BARREL: the existence check is made on the barrel's path",
      file: L,
      from: "  return exists(fileURLToPath(narrow)) ? narrow : resolvedUrl;",
      to: "  return exists(fileURLToPath(resolvedUrl)) ? narrow : resolvedUrl;",
      expect: "T1.12",
    },
    {
      // **The hook resolves and never redirects.** Exactly the control's
      // observable from the other half: T1.12 stays green on both pure
      // functions and only the graph row sees it.
      name: "NO-REDIRECT: the resolve hook returns the barrel it resolved",
      file: L,
      from: "      return narrow === resolved.url ? resolved : { ...resolved, url: narrow };",
      to: "      void narrow; return resolved;",
      expect: "T5.7",
    },
  ],
});

execSync("npm run build >/dev/null 2>&1", { cwd: ROOT });
report(results);
