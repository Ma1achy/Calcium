// C16 §2 — xterm's four modifier bits, mutated.
//
// **The subject is a bitfield, and a bitfield's defects are silent by
// construction.** Dropping a bit does not make the decoder emit nothing; it
// makes it emit a *different key that is also correct-looking*. That is why the
// original defect survived every test above the decoder and why the mutations
// below are all "still a well-formed key, wrong one".
//
// The mutation that matters is `meta` dropping bit 8 again — the defect itself,
// restored — and it is caught only by the row that asserts two wire forms decode
// to *different* keys. A row asserting either form alone passes in the broken
// state, which is what `1;16D` being correct by accident demonstrates.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/router-decode.test.ts test/unit/router-dispatch.test.ts";
const DECODE = "src/interaction/router/decode.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const META_LINE = "    meta: (bits & 2) !== 0 || (bits & 8) !== 0,";

const MUTATIONS = [
  {
    // **The defect itself, restored.** Three bits of four. Every sequence still
    // decodes to a real key with a real name, so only the row comparing two wire
    // forms of one keystroke can see it.
    name: "meta drops xterm's bit 8 again",
    file: DECODE,
    from: META_LINE,
    to: "    meta: (bits & 2) !== 0,",
    expect: "T1.3e",
  },
  {
    // **The other direction, and it is the one a careless fix produces.**
    // Reading bit 8 *instead of* bit 2 fixes Meta-sending terminals and breaks
    // Alt-sending ones — which are the majority, and which every existing test
    // was written against.
    name: "meta reads bit 8 instead of bit 2",
    file: DECODE,
    from: META_LINE,
    to: "    meta: (bits & 8) !== 0,",
    expect: "T1.3e",
  },
  {
    // **The bit borrowed from the wrong flag.** `shift` taking bit 8 as well
    // makes `1;9D` a shifted arrow — still a key, still bound, still wrong, and
    // it keeps `meta` correct so a test checking only the meta flag agrees.
    name: "shift claims bit 8 as well",
    file: DECODE,
    from: "    shift: (bits & 1) !== 0,",
    to: "    shift: (bits & 1) !== 0 || (bits & 8) !== 0,",
    expect: "T1.3e",
  },
  {
    // **The off-by-one in the encoding itself.** xterm's parameter is the
    // bitfield *plus one*; dropping the subtraction shifts every modifier by a
    // bit, so a plain `CSI 1;1A` starts reporting shift. The comment above this
    // function states the plus-one and this is the mutation that asks whether
    // the statement constrains anything.
    name: "the parameter is read as the bitfield, not bitfield plus one",
    file: DECODE,
    from: "  const bits = param === undefined ? 0 : Math.max(0, Number(param) - 1);",
    to: "  const bits = param === undefined ? 0 : Math.max(0, Number(param));",
    expect: "T1.3e",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * Empty: every mutation above is expected to be caught. An entry would name a
 * mutation the suite cannot see and why that is acceptable — and the pass fails
 * if a listed mutation is caught after all, so an entry cannot outlive its
 * reason.
 */
const EXPECTED_SURVIVORS = new Map([]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: DECODE,
    from: "  const bits = param === undefined ? 0 : Math.max(0, Number(param) - 1);",
    to: "  const bits = 0;",
    why:
      "no sequence carries any modifier at all — if this survives, nothing in the suite reaches " +
      "a modified key and every kill below is unearned",
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
