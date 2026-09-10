// C07 I23, §7a — the notice names the layer that actually failed.
//
// **The row under test is a four-cell table and the finding got the axis
// wrong**, so most of the pressure here is on the axis rather than on the
// split. F152 proposed suppressing the notice when the mapped outcome is an
// error; it was inferred from two instances that were both far-side failures
// with nothing on stdout, and it is wrong at the two cells nobody measured — a
// silent success is `ok`, and a failing command that still emits a payload is
// `error`. Three of the mutations below are that remedy and its neighbours,
// written out so the run says *which* cell each one breaks.
//
// **The second thing being distrusted is the row's shape, and the run corrected
// the reason it was given.** This header said a per-cell assertion cannot say
// *exactly these two moved*; converting the set to two membership checks
// survived, because the complement is asserted as well and the four cells are
// pinned either way. What the set form actually buys is the **fifth** cell — a
// case added to the table is constrained the moment it exists, and under
// membership checks it is constrained by nothing. There is a mutation for that
// and it is caught, so the reason is checked rather than stated.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/adapter-registry.test.ts";
const REGISTRY = "src/data/adapters/registry.ts";
const UNIT = "test/unit/adapter-registry.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The state that shipped**: one sentence for both subjects, and it is the
    // one that sends the reader to the wrong file.
    name: "the split is removed and every failure blames the adapter",
    file: REGISTRY,
    from: '  const nothingToAdapt = raw.stdoutRaw.trim() === "";',
    to: "  const nothingToAdapt = false;",
    expect: "T1.22",
  },
  {
    // **The other direction**: every contained failure reported as no output,
    // including the adapter that was handed bytes and choked on them. A row
    // asserting only *the empty cells say NOTHING* would pass this.
    name: "every failure is reported as no output",
    file: REGISTRY,
    from: '  const nothingToAdapt = raw.stdoutRaw.trim() === "";',
    to: "  const nothingToAdapt = true;",
    expect: "T1.22",
  },
  {
    // **F152's own remedy, as proposed.** It is right at the two cells the
    // finding measured and wrong at the two it did not.
    name: "the axis is the mapped status, as F152 proposed",
    file: REGISTRY,
    from: '  const nothingToAdapt = raw.stdoutRaw.trim() === "";',
    to: "  const nothingToAdapt = raw.exitCode !== 0;",
    expect: "T1.22",
  },
  {
    // **`stdout === undefined` instead of `stdoutRaw`** — the near miss, and the
    // one a reader would call equivalent. It reads *there was no parsed
    // payload*, which is also true of `"{"`.
    name: "the axis is the parsed payload rather than the bytes",
    file: REGISTRY,
    from: '  const nothingToAdapt = raw.stdoutRaw.trim() === "";',
    to: "  const nothingToAdapt = raw.stdout === undefined;",
    expect: "T3.21",
  },
  {
    // **The trim dropped.** A far side that wrote a bare newline produced
    // nothing to render, and this is the arm T3.21 exists for.
    name: "whitespace on stdout counts as something to adapt",
    file: REGISTRY,
    from: '  const nothingToAdapt = raw.stdoutRaw.trim() === "";',
    to: '  const nothingToAdapt = raw.stdoutRaw === "";',
    expect: "T3.21",
  },
  {
    // **The sentence names the adapter first.** Both clauses are still true and
    // the reader's next action is decided by the first one, which is why the
    // row asserts the whole sentence rather than matching `/no output/`.
    name: "the new sentence leads with the adapter instead of the command",
    file: REGISTRY,
    from: '      ? `The command produced no output, so the "${verb}" adapter had nothing to render.`',
    to: '      ? `The "${verb}" adapter had nothing to render: the command produced no output.`',
    expect: "T1.22",
  },
  {
    // **A fifth case joins the table and nobody asserts it.** This is what the
    // set form buys over four per-cell assertions, and it is the fabricated
    // violation behind the exemption below: with the set, a cell added to the
    // object is constrained the moment it exists; with membership checks it is
    // constrained by nothing.
    name: "a fifth case is added to the table and asserted by nobody",
    file: UNIT,
    from: '      "error + payload": notice({ exitCode: 13, stdoutRaw: \'{"rows":\', stdout: undefined, stderr: "svc: partial" }),',
    to: '      "error + payload": notice({ exitCode: 13, stdoutRaw: \'{"rows":\', stdout: undefined, stderr: "svc: partial" }),\n      "cancelled + empty": notice({ cancelled: true, stdoutRaw: "", stdout: undefined }),',
    expect: "T1.22",
  },
  {
    // **The set assertion turned into two membership checks.** Expected to
    // survive: with all four cells asserted, the two forms constrain the same
    // thing. The mutation above is what says the difference is real.
    name: "the row checks that the two empty cells are among those that moved",
    file: UNIT,
    from: '    expect(Object.keys(cells).filter((k) => cells[k as keyof typeof cells] === NOTHING)).toEqual([\n      "ok + empty",\n      "error + empty",\n    ]);',
    to: '    expect(cells["ok + empty"]).toBe(NOTHING);\n    expect(cells["error + empty"]).toBe(NOTHING);',
    expect: "T1.22",
  },
  {
    // **The cancelled arm dropped from the row.** `mapResult` returns `partial`
    // there, so it is the third direction a status test misses and the only
    // assertion that reaches it.
    name: "the row stops driving the cancelled case",
    file: UNIT,
    from: '    expect(notice({ cancelled: true, stdoutRaw: "", stdout: undefined })).toBe(NOTHING);',
    to: "",
    expect: "T1.22",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * **Both are findings about the row's shape rather than gaps in it**, and both
 * have a mutation above that makes the reason checkable rather than asserted.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "the row checks that the two empty cells are among those that moved",
    "**the mutation is not expressible as a defect of the four cells that exist**, and finding " +
      "that out is what the survivor is worth. All four are asserted — two against the exact " +
      "sentence, two against the pattern — so a set assertion and two membership checks " +
      "constrain the same thing, and the comment that first justified the set form (*a per-cell " +
      "assertion cannot say exactly these two*) was wrong: with the complement asserted, it " +
      "can. **What the set form actually buys is the fifth cell**, and the mutation above is " +
      "the fabricated violation that says so — a case added to the table is constrained the " +
      "moment it exists under the set form and by nothing at all under membership checks. The " +
      "form stays for that reason and not for the one originally given",
  ],
  [
    "the row stops driving the cancelled case",
    "the four-cell table already drives both empty cells, so removing the `cancelled` line " +
      "leaves the sentence assertions intact and nothing goes red. **That is what the line is " +
      "for and why it stays**: `mapResult` maps a cancelled invocation to `partial`, which is " +
      "neither of the two statuses a status-based axis would test, so this is the assertion " +
      "that would catch a future axis moving back to `outcome.status` in the one direction " +
      "the other three mutations here cannot reach. A row kept for a hazard no current " +
      "mutation expresses is a deliberate choice, not a gap",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: REGISTRY,
    from: "function adapterFailureNotice(",
    to: "function unusedAdapterFailureNotice(",
    why:
      "no contained failure could be recorded at all — if this survives, no row below reaches " +
      "the notice and every kill is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
