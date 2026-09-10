// C04 I114, §5b — a required field that is absent is not one of the wrong type.
//
// **The rows this run exists to distrust are a sweep and three literal
// sentences**, and both shapes fail quietly. A sweep over a corpus is the
// easiest thing here to make vacuous (A03 §2): with nothing to iterate it
// reports *no site conflates the two faults* exactly as loudly as a sweep that
// found forty-two and cleared them. And a literal-string assertion passes for a
// validator that emits one sentence in *both* arms, provided the sentence is
// the one the row happens to name.
//
// So the mutations aim at three different things: the split itself, the test
// that says the split happened, and the **reach** of the sweep — because reading
// `validate.ts` for a shared helper found forty-seven sites and driving the
// corpus found twelve more (§5b). A sweep that only reaches `requireString` is
// green on every one of those twelve.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/view-model.test.ts test/edge/view-model.test.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const UNIT = "test/unit/view-model.test.ts";

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
    // **The state that shipped**: one sentence for both faults, and it is the
    // sentence about a value the reader did not write.
    name: "absent falls through to the wrong-type message",
    file: VALIDATE,
    from: "  if (v === undefined) e.push(absentMessage(subject, want));\n  else if (!ok(v)) e.push(wrongTypeMessage(subject, want, v));",
    to: "  if (!ok(v)) e.push(wrongTypeMessage(subject, want, v));",
    expect: "T1.34",
  },
  {
    // **The other direction, which is `image.digest`'s defect before this ran**:
    // one sentence again, and now it reports a supplied value as missing. It is
    // the half `src/shell/config.ts` warns about and the half a test asserting
    // only *the absent sentence is not "must be a"* would let through.
    name: "a wrongly typed field is reported as absent",
    file: VALIDATE,
    from: "  if (v === undefined) e.push(absentMessage(subject, want));\n  else if (!ok(v)) e.push(wrongTypeMessage(subject, want, v));",
    to: "  if (!ok(v)) e.push(absentMessage(subject, want));",
    expect: "T2.127",
  },
  {
    // **`in` rather than `=== undefined`** — §5b row 1. It reads as the more
    // careful test and it is the one that gives a document two sentences either
    // side of `JSON.stringify`.
    name: "absence is decided by `in`, so a key holding undefined is present",
    file: VALIDATE,
    from: "  const v = b[key];\n  if (v === undefined) e.push(absentMessage(subject, want));",
    to: "  const v = b[key];\n  if (!(key in b)) e.push(absentMessage(subject, want));",
    expect: "T3.80",
  },
  {
    // **`null` folded into absence** — §5b row 2. A far side that spells
    // *nothing* as `null` supplied a value, and telling it the key is missing
    // sends it to the wrong line.
    name: "null takes the absent arm",
    file: VALIDATE,
    from: "  if (v === undefined) e.push(absentMessage(subject, want));",
    to: "  if (v === undefined || v === null) e.push(absentMessage(subject, want));",
    expect: "T3.80",
  },
  {
    // **`typeof null` is `\"object\"`** — the trap `describeType` exists for. The
    // message stays grammatical and names the wrong thing to look for.
    name: "the arrived type is a bare typeof, so null reads as an object",
    file: VALIDATE,
    from: '  if (v === null) return "null";\n  if (isArray(v)) return "an array";',
    to: '  if (isArray(v)) return "an array";',
    expect: "T3.80",
  },
  {
    // **The absent arm keeps the old wording.** It splits — two branches, two
    // call sites — and says the same misleading thing, which is what a row
    // asserting only *the two messages differ* would accept.
    name: "the absent arm still reads `must be a`",
    file: VALIDATE,
    from: "  return `${subject} is required and absent — supply ${want}`;",
    to: "  return `${subject} must be ${want}, and it is absent`;",
    expect: "T2.127",
  },
  {
    // **The split built into one helper only**, which is where it would have
    // stopped if the call sites had not been counted first: `requireString` has
    // 15 and `requireArray` has 15, and a row driving a `notice` reaches none of
    // the second set.
    name: "only the string helper splits; the array helper does not",
    file: VALIDATE,
    from: '  requireField(b, key, isArray, "an array", e, `${at}: "${key}"`);',
    to: '  if (!isArray(b[key])) e.push(`${at}: "${key}" must be an array`);',
    expect: "T1.34",
  },
  {
    // **One of the twelve the corpus found and no grep for a helper reaches.**
    // If the sweep is only as wide as `requireString`, this is invisible.
    name: "a bespoke site is put back — a mosaic's height",
    file: VALIDATE,
    from: '    if (height === undefined) {\n      e.push(\n        `${absentMessage(`${at}: "height"`, "a positive integer")} (C04 I71) — a mosaic with ` +',
    to: '    if (false) {\n      e.push(\n        `${absentMessage(`${at}: "height"`, "a positive integer")} (C04 I71) — a mosaic with ` +',
    expect: "T2.127",
  },
  {
    // **The other bespoke direction** — `terminal.screen`, a vocabulary rather
    // than a type, reached by neither the helper grep nor the enum list.
    name: "a bespoke enum site is put back — a terminal's screen",
    file: VALIDATE,
    from: '    if (screen === undefined) {\n      e.push(`${absentMessage(`${at}: "screen"`, `"lines" or "grid"`)} (C04 I113)`);\n    } else if (screen !== "lines" && screen !== "grid") {',
    to: '    if (screen !== "lines" && screen !== "grid") {',
    expect: "T2.127",
  },
  {
    // **The sweep runs over nothing.** An exit status is one bit and it is the
    // same bit for *clean* and for *did not run*; this is the `toHaveLength(42)`
    // earning its place rather than being a courtesy.
    name: "the corpus sweep iterates an empty set of kinds",
    file: UNIT,
    from: "    for (const kind of ALL_KINDS) {",
    to: "    for (const kind of []) {",
    expect: "T2.127",
  },
  {
    // **The exemption emptied**, which must fail rather than pass: `plot.height`
    // is a real one-sentence site and the list is what says so deliberately. An
    // exemption list compared by equality may only shrink when its subject does.
    name: "the sweep's exemption list is emptied",
    file: UNIT,
    from: '    const EXEMPT = ["plot.height"];',
    to: "    const EXEMPT = [];",
    expect: "T2.127",
  },
  {
    // **The exemption widened by one honest-looking entry.** A list that may
    // grow silently is one where the second entry arrives behind the first
    // unread — and `notice.tone` is F995's own instance.
    name: "the sweep's exemption list gains a site that is not exempt",
    file: UNIT,
    from: '    const EXEMPT = ["plot.height"];',
    to: '    const EXEMPT = ["plot.height", "notice.tone"];',
    expect: "T2.127",
  },
];

/** Survivors with a reason, and a staleness arm. */
const EXPECTED_SURVIVORS = new Map();

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: VALIDATE,
    from: "function absentMessage(",
    to: "function unusedAbsentMessage(",
    why:
      "nothing would be able to build the absent sentence at all — if this survives, no row " +
      "below reaches the split and every kill is unearned",
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
