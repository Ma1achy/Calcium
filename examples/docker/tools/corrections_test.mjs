// `corrections.mjs`'s own fixture — known documents in, stated index out.
//
// **The rows that matter are the ones about what it cannot see.** A derived
// index whose count is wrong in the reassuring direction is worse than a hand
// list, because a hand list at least reads as a snapshot. This one reports a
// floor and the fixture is what holds it to that.
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = new URL("../../../", import.meta.url).pathname;
const TOOL = join(ROOT, "examples/docker/tools/corrections.mjs");

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  ok      ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL    ${name}${detail === "" ? "" : ` — ${detail}`}`);
  }
};

const run = () => execFileSync("node", [TOOL], { cwd: ROOT, encoding: "utf8" });

// ── CX1 — it finds the real tree's corrections, and reports a floor ─────────
const out = run();
const m = /\*\*(\d+) corrections across (\d+) documents\*\*/u.exec(out);
check("CX1: the real tree reports a count and a document span", m !== null);
const count = Number(m?.[1] ?? 0);
const docs = Number(m?.[2] ?? 0);

// **Not `> 0`.** A vocabulary regex that matched one loose word would satisfy
// `> 0` and be useless; F11's class was described as ten-odd sites, so the
// fixture states the order of magnitude it must reach.
check("CX2: it finds F11's class at the scale the ruling described", count >= 10, `found ${String(count)}`);
check("CX3: across several documents, not all in one", docs >= 5, `found ${String(docs)}`);

// ── CX4 — the floor is named in the output, not only in the source ──────────
// A number presented as exact is acted on as exact. This is the row that stops
// the wording drifting back to a bare count.
check("CX4: the output calls the number a floor", /\bfloor\b/u.test(out));
check("CX5: and says why — a vocabulary, with no marker to match", /vocabulary/u.test(out));

// ── CX6 — a fabricated correction in a fresh document is found ──────────────
// **The arm that proves it reads the tree rather than a cached list.** Without
// it every row above passes on a tool that prints a hard-coded index.
const tmp = mkdtempSync(join(tmpdir(), "corr-"));
try {
  mkdirSync(join(tmp, "docs/surfaces"), { recursive: true });
  mkdirSync(join(tmp, "examples/docker"), { recursive: true });
  writeFileSync(
    join(tmp, "docs/surfaces/S99_fabricated.md"),
    "# S99\n\n## A figure\n\nThe earlier one was drawn by hand and is wrong.\n",
  );
  writeFileSync(join(tmp, "examples/docker/ZZ_WALK.md"), "# Z\n\nnothing here\n");
  const fabricated = execFileSync("node", [TOOL, "--root", tmp], { encoding: "utf8" });
  check(
    "CX6: a fabricated correction in a new document is found",
    /S99_fabricated/u.test(fabricated),
  );
  check(
    "CX7: and a document with no correction contributes nothing",
    !/ZZ_WALK/u.test(fabricated),
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\ncorrections.mjs — ${String(pass)}/${String(pass + fail)} rows`);
process.exit(fail === 0 ? 0 : 1);
