// C22 I107 — the card body is derived once per blocks array, and every call of
// the layout over the same array hands out the same body objects. Mutated
// (T6.122, F1203).
//
// **Identity is the property**, and two rows read it from either side: T1.62
// asks the layout directly — same array, same object; fresh array, fresh
// object; a nested card the same — and T4.91 reads the consequence through the
// session's measure memo, which is keyed on that identity: a still card
// measures on its first frame and not after.
//
// **The control is the hold never read** — a body derived on every call, which
// is the tree before I107. T1.62 fails on identity and T4.91 counts one measure
// per frame.
//
// **Blind spot, stated.** The form hold (C09 I76) and the patch plan (C25 I22)
// benefit through the same identity and are not read here: T4.91's memo is the
// one counter the harness exposes, and the bench carries the rest.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/tool-call.test.ts test/integration/render-cache.test.ts";
const EL = "src/shell/entry-layout.ts";

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
    file: EL,
    from: "  let body = CARD_BODIES.get(blocks);\n  if (body === undefined) {",
    to: "  let body: readonly Block[] | undefined = undefined;\n  if (body === undefined) {",
    why: "the hold is never read: a body per call, a new key per frame — T1.62's identity and T4.91's still frames both fail",
  },
  mutations: [
    {
      // **Keyed on the head block rather than the array.** A replaced document
      // sharing its head object is served the previous body — derived from
      // blocks that are no longer the document's.
      name: "HEAD-KEYED: the hold keyed on blocks[0], not on the array",
      file: EL,
      from: "  let body = CARD_BODIES.get(blocks);",
      to: "  let body = CARD_BODIES.get((blocks[0] ?? blocks) as unknown as readonly Block[]);",
      also: [
        {
          file: EL,
          from: "    CARD_BODIES.set(blocks, body);",
          to: "    CARD_BODIES.set((blocks[0] ?? blocks) as unknown as readonly Block[], body);",
        },
      ],
      expect: "T1.62",
    },
    {
      // **A nested card's body not held**: the top card holds and the child
      // rebuilds per call, so a nested identity-keyed store misses as before.
      name: "NESTED-UNHELD: the nested card's body derived per call",
      file: EL,
      from: "      runs.push(...bodyRuns(heldBody(card.children), width, [...outer, through], depth + 1));",
      to: "      runs.push(...bodyRuns(cardBody(card.children.slice(1)), width, [...outer, through], depth + 1));",
      expect: "T1.62",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
