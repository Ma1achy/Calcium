// Every instrument's fixture, and the inventory compared by equality.
//
//     node tools/instruments.mjs        # or `make tools-test`
//
// **The runner is group 9's deliverable, not the fixtures.** Eleven fixtures
// with no runner is eleven things nobody runs — which is `VERIFYING.md`'s fifth
// class, *a gate nobody reports*, arriving inside the gate built to answer it.
// `make all` ran six targets and two were red for four commits for exactly that
// reason.
//
// **And the inventory is derived and compared, not listed.** A runner over a
// hand-written eleven closes eleven files; the day a twelfth instrument lands it
// is uncovered and nothing says so. So the instrument files are read off the
// filesystem, the covered ones are read off this table, and the two sets are
// compared **by equality** — A03's discipline for its own rules, and SP6's for
// the triage. An instrument added without a fixture fails this target.
//
// **The eleven were a hand-list and were short by four.** `CALCIUM_COVERAGE_AUDIT_2`
// named nine tools plus `tools/mutate` and `tools/proof.sh`; the three benches
// were not in it, and the waiter did not exist as a file at all. That is the
// argument for deriving it in one line rather than for counting more carefully.
//
// **A fixture that reports zero rows fails.** An exit status is one bit and it
// is the same bit for *clean* and for *the case list was empty* — the mistake
// three instruments made in one session, each reporting a completion it never
// observed. Every fixture prints `name — n/m rows`; this reads the counter.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/**
 * instrument → how its fixture is run.
 *
 * `vitest` rows are already in `npm test`; they are listed and run here anyway,
 * because the question this target answers is *does every instrument have a
 * fixture* and an answer assembled from two places is not one anybody reads.
 */
const COVERED = [
  ["tools/bench/frame.mjs", ["npx", "vitest", "run", "test/unit/bench-liveness.test.ts"]],
  ["tools/bench/pollers.mjs", null], // same fixture as frame.mjs — the shared guard
  ["tools/bench/patch-window.mjs", null], // same fixture — `gutter`
  ["tools/bench/liveness.mjs", null], // the guard itself, covered by its own rows
  ["tools/waitfor.mjs", ["npx", "vitest", "run", "test/unit/waitfor.test.ts"]],
  // **This target caught it on the day it landed**, which is the claim the
  // equality comparison above makes and this is the first time it has been paid
  // out: `scan-cost.mjs` was added, `make instruments` went from 16/16 to
  // 17 found, 16 with a fixture, and named the file.
  ["tools/scan-cost.mjs", ["npx", "vitest", "run", "test/unit/scan-cost.test.ts"]],
  // The Order column's verifier. **It caught this target's own claim a second
  // time**: `make instruments` went 19 found / 18 with a fixture and named the
  // file, which is the equality comparison paying out on the day the instrument
  // landed rather than the day someone noticed.
  //
  // Its `--file` flag is corrections.mjs's `--root` for the same reason — RS2's
  // fabricated wrong-file citation could not be written without pointing the tool
  // at a fabricated roadmap, and a row that cannot be written is how the other
  // nine end up certifying a tool that prints a hard-coded answer.
  ["tools/roadmap-status.mjs", ["npx", "vitest", "run", "test/unit/roadmap-status.test.ts"]],
  ["tools/mutate/mutate.mjs", ["npx", "vitest", "run", "test/unit/mutate-harness.test.ts"]],
  // **The exemption below leaves the inputs unwatched, and this is what watched
  // them.** `tools/mutate/runs` is exempted as *configurations, not
  // instruments*, which is true — and every one of them carries anchors into
  // source that moves. Eighteen had rotted when the sweep was first run, one of
  // them a **control**, which makes its whole run unstartable.
  ["tools/mutate/anchors.mjs", ["npx", "vitest", "run", "test/unit/mutate-anchors.test.ts"]],
  ["tools/proof.sh", ["npx", "vitest", "run", "test/unit/proof-guards.test.ts"]],
  // **Both landed without a fixture and this target was not run**, so the gate
  // that exists to catch exactly that sat red for three commits. `catalogue-png`
  // shares the file because the two are one pipeline — frames out, images in —
  // and splitting the answer across two files is what the header argues against.
  ["tools/plot-catalogue.mjs", ["npx", "vitest", "run", "test/unit/plot-catalogue.test.ts"]],
  ["tools/catalogue-png.mjs", null], // same fixture — the catalogue pipeline
  // Covered by that same fixture all along — `plot-catalogue.test.ts` imports
  // `CATALOGUE_FORMS` and compares it against `ALL_FORMS` by equality. It was
  // simply not *seen*, being a `.ts`. See the note on `SUFFIX`.
  ["tools/catalogue-forms.ts", null],
  // **The equality comparison paid out a third time.** `tools/refdiff/` landed
  // as two files and `make instruments` went 24 found / 22 with a fixture,
  // naming both — on the day they landed, not the day someone noticed.
  ["tools/refdiff/pair.mjs", ["npx", "vitest", "run", "test/unit/refdiff.test.ts"]],
  ["tools/refdiff/reference.py", null], // same fixture — the two halves of one grid
  ["tools/refdiff/export-fixtures.ts", null], // same fixture — our half and the grid
  ["examples/docker/tools/screen.py", ["python3", "examples/docker/tools/screen_test.py"]],
  ["examples/docker/tools/beats.py", ["python3", "examples/docker/tools/beats_test.py"]],
  ["examples/docker/tools/capture.py", ["python3", "examples/docker/tools/capture_test.py"]],
  ["examples/docker/tools/screencast.py", ["python3", "examples/docker/tools/screencast_test.py"]],
  ["examples/docker/tools/media.py", ["python3", "examples/docker/tools/media_test.py"]],
  ["examples/docker/tools/s3_esc.py", ["python3", "examples/docker/tools/s3_esc_test.py"]],
  ["examples/docker/tools/gap-check.mjs", ["node", "examples/docker/tools/probes_test.mjs"]],
  // F11's corrections index. Its `--root` flag exists because CX6 — *a
  // fabricated correction in a new document is found* — could not otherwise be
  // written, and without that row the other six pass on a tool printing a
  // hard-coded list, which is the failure a derived index removes.
  ["examples/docker/tools/corrections.mjs", ["node", "examples/docker/tools/corrections_test.mjs"]],
  ["examples/docker/tools/measure-raw.mjs", null], // same fixture — the shared registry
  ["examples/docker/tools/measure-s3.mjs", null], // same fixture
];

/**
 * Not instruments, and each says why. **Counted rather than excluded** — a
 * silent glob stops seeing new files, and an exemption with no reason beside it
 * outlives the reason.
 */
const NOT_INSTRUMENTS = {
  "tools/enforce": "the enforcement suite — gated by `make enforce`, with five fixtures of its own under test/unit/enforce-*",
  "tools/mutate/runs": "mutation configurations, not instruments: each is an input to `mutate.mjs`, which is covered — and their anchors are swept by `tools/mutate/anchors.mjs`, because *not an instrument* left them unwatched",
  "tools/instruments.mjs": "this runner",
  "examples/docker/tools/_fixture.py": "the fixtures' own four-line harness",
  "examples/docker/tools/registry.mjs": "the shared registry, covered by probes_test.mjs",
  "examples/docker/tools/__pycache__": "not a file",
};

// **`.ts` was missing, and the omission has a history worth keeping.**
// `tools/catalogue-forms.ts` was moved out of a `.mjs` *precisely* to get it
// type-checked, after an untyped literal drifted and left eight plot forms in
// no rendered frame at all. That move took it out of this inventory — the
// remedy for one gate opened a hole in another, and the hole is the same shape:
// a file outside the checked set. Found when `tools/refdiff/export-fixtures.ts`
// landed and could not be listed as covered because it was not seen as present.
const SUFFIX = /\.(mjs|py|sh|ts)$/;

/** Every instrument file under the two tool directories. */
function inventory() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (Object.hasOwn(NOT_INSTRUMENTS, rel)) continue;
      if (statSync(join(ROOT, rel)).isDirectory()) {
        walk(rel);
        continue;
      }
      // A fixture is not an instrument; `_fixture.py` is exempted by name above
      // because it does not carry the suffix.
      if (!SUFFIX.test(name) || /_test\.(py|mjs)$/.test(name) || name.endsWith(".d.mts")) continue;
      found.push(rel);
    }
  };
  walk("tools");
  walk("examples/docker/tools");
  return found;
}

const files = inventory();
const covered = new Set(COVERED.map(([f]) => f));
const missing = files.filter((f) => !covered.has(f));
const stale = [...covered].filter((f) => !files.includes(f));

console.log(`instruments — ${String(files.length)} found, ${String(covered.size)} with a fixture\n`);

if (missing.length > 0 || stale.length > 0) {
  for (const f of missing) console.error(`  NO FIXTURE   ${f}`);
  for (const f of stale) console.error(`  NOT PRESENT  ${f} — listed as covered and not on disk`);
  console.error(
    "\nThe inventory is compared by equality, so this is the whole of it: an " +
      "instrument added without a fixture fails here on the day it lands.",
  );
  process.exit(1);
}

let failed = 0;
let rowsTotal = 0;
for (const [file, cmd] of COVERED) {
  if (cmd === null) continue;
  const [bin, ...args] = cmd;
  let out = "";
  let ok = true;
  try {
    out = execFileSync(bin, args, { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    ok = false;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  // **The counter, not the status.** A python fixture prints `name — n/m rows`;
  // vitest prints `Tests  n passed`. Zero of either is a fixture that ran
  // nothing, which exits 0 and reads as clean.
  const py = /— (\d+)\/(\d+) rows/.exec(out);
  // The ESC byte itself, not only the `[2m` after it: vitest writes
  // `ESC[2m Tests ESC[22m ESC[1mESC[32m9 passed`, and leaving the escapes in
  // place is what made the first run of this file report `0 rows` for four
  // fixtures that had just passed. The same reading defect the mutation harness
  // shipped, in the runner written to catch reading defects.
  const clean = out.replace(/\u001b\[[0-9;]*m/g, "");
  const ts = /Tests\s+(\d+) passed/.exec(clean);
  const rows = py !== null ? Number(py[2]) : ts !== null ? Number(ts[1]) : 0;
  rowsTotal += rows;
  const bad = !ok || rows === 0;
  if (bad) failed += 1;
  console.log(
    `  ${bad ? "FAIL" : "ok  "}  ${String(rows).padStart(3)} rows  ${file}` +
      (rows === 0 ? "   ← reported no rows at all" : ""),
  );
  if (bad) console.log(out.split("\n").slice(-25).join("\n"));
}

console.log(
  `\n${String(files.length)} instruments, every one with a fixture · ` +
    `${String(rowsTotal)} rows · ${failed === 0 ? "all green" : `${String(failed)} FAILING`}`,
);
process.exit(failed === 0 ? 0 : 1);
