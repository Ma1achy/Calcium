// C09 I38, I73 — T2.144's `img-fault` reaches the fault arm in a whole-file
// run (F1473).
//
// **The run the fixture could not pass before.** `img-fault` kept the corpus
// image's digest, so in a whole-file run the decode cache handed it the corpus
// picture and the fault arm was never drawn: every mutation below failed
// nothing there and failed T2.144 only when the row ran alone. With a digest of
// its own the row draws the fault in both, so the run is the whole file on
// purpose — the file is the condition the finding was about.
//
// **Three ways to break the arm, one per part of what it draws**: the caption
// dropped, the reason replaced by the caption, and the box dropped so the arm
// is F410's alt alone as it shipped.
//
// **The verdict is read from the FAIL lines as well as from the report**
// (F1472): `byNamedTest` is a substring over the whole output, so every
// mutation's failing rows are printed here and checked by eye.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const IMAGE = "src/presentation/blocks/kinds/image.ts";
const FILES = "test/contract/rows-arm.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    if (e.killed === true) out = `${out}\nTIMED OUT after 600000ms`;
  }
  // The rows that really failed, and the first assertion message under each.
  const plain = out.replace(/\x1b\[[0-9;]*m/g, "").split("\n");
  const fails = plain.filter((l) => /^\s*FAIL\s/.test(l) || /^AssertionError/.test(l));
  console.error(`  -- FAIL lines: ${fails.length === 0 ? "none" : `\n${fails.map((l) => l.slice(0, 200)).join("\n")}`}`);
  return out;
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see** (F1254): the half-block rung draws `#`,
    // so the corpus picture moves in every capture of it.
    file: IMAGE,
    from: "paint(line.map((cell) => ({ text: HALF_BLOCK, style:",
    to: "paint(line.map((cell) => ({ text: \"#\", style:",
    why:
      "every half-block picture draws `#` — if this survives, the rows are not reading the image kind",
  },
  mutations: [
    {
      name: "F1473: the fault arm drops its caption",
      file: IMAGE,
      from: "      if (rows < 2) return box;",
      to: "      if (rows < 99) return box;",
      expect: "T2.144",
    },
    {
      name: "F1473: the box says the caption rather than the decoder's reason",
      file: IMAGE,
      from: "faultStatus(block, fault, boxRows)",
      to: "faultStatus(block, block.alt, boxRows)",
      expect: "T2.144",
    },
    {
      // **F410 as it shipped**: the refusal drew the alt and nothing else.
      name: "F1473: the fault arm draws the alt alone",
      file: IMAGE,
      from: "      return [...box, paint([{ text: alt, style: { dim: true } }])];",
      to: "      return [paint([{ text: alt, style: { dim: true } }])];",
      expect: "T2.144",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
