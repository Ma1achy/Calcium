// A kind's copy text — the omission ruling, the two separators and the recursion.
//
// **Every mutation here leaves a copy that works.** Text comes out, it is the
// right text for the right blocks, and a reader watching the count sees nothing
// move. What changes is where the boundaries fall: one newline or two, the
// document's order or the selection's, and whether a kind that declines is
// absent or empty.
//
// The distinction the run exists for is C09 I86's: a declining kind contributes
// **nothing**, not `""`. A blank line is R-SEL-004's entry separator, so a kind
// joining as the empty string forges an entry boundary inside an entry — a
// defect that reads, in the pasted text, as the reader having selected more
// than they did.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/semantic-selection.test.ts test/contract/scroll.test.ts " +
  "test/unit/table.test.ts";
const REGISTRY = "src/presentation/blocks/registry.ts";
const MODEL = "src/shell/semantic-selection.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The omission ruling, inverted** (C09 I86). A declining kind answering
    // `""` is the reading everything else in the tree encourages — an element's
    // `copy` is a string, so absent and empty look interchangeable. They are
    // not: `""` survives the sequence join and lands as a blank line.
    name: "a kind that declines answers the empty string instead of nothing",
    file: REGISTRY,
    from: "      return definition.copy?.(resolved, (child: Block) => this.copyOf(child)) ?? null;",
    to: '      return definition.copy?.(resolved, (child: Block) => this.copyOf(child)) ?? "";',
    expect: "T2.36",
  },
  {
    // **The separator inside an entry becomes the separator between them.**
    // Two newlines between blocks is the spacing a reader might well prefer,
    // and it makes one entry paste as several.
    name: "blocks within an entry are separated by a blank line",
    file: REGISTRY,
    from: "      .filter((t): t is string => t !== null && t !== \"\")\n      .join(\"\\n\");",
    to: "      .filter((t): t is string => t !== null && t !== \"\")\n      .join(\"\\n\\n\");",
    expect: "T1.41i",
  },
  {
    // **The recursion dropped.** A container handed a child seam that always
    // declines still copies its own parts — a panel keeps its title — so the
    // shape of the output is unchanged and only the contents go missing.
    name: "a container's child seam always declines",
    file: REGISTRY,
    from: "      return definition.copy?.(resolved, (child: Block) => this.copyOf(child)) ?? null;",
    to: "      return definition.copy?.(resolved, () => null) ?? null;",
    expect: "T1.41h",
  },
  {
    // **Entries joined as though they were blocks.** One newline between two
    // entries is exactly the separator that says *same entry*, so a two-entry
    // copy pastes as one.
    name: "entries are separated by a single newline",
    file: MODEL,
    from: 'copyParts(mode, loaded, copySequence).join("\\n\\n");',
    to: 'copyParts(mode, loaded, copySequence).join("\\n");',
    expect: "T1.41i",
  },
  {
    // **Selection order for document order** (R-SEL-004). `blocks` is a `Set`
    // and a set is insertion-ordered, so walking it gives a copy that pastes in
    // whichever order the reader happened to choose — which is right for every
    // selection made top to bottom, and that is most of them.
    name: "the join walks the selection rather than the document",
    file: MODEL,
    from: "  const selected = mode.blocks;\n  return loaded\n    .map((e) => copySequence(e.blocks.filter((b) => selected.has(keyOf(e.id, b.id)))))",
    to: "  const selected = mode.blocks;\n  return [...selected]\n    .flatMap((k) => loaded.filter((e) => e.id === entryOf(k)))\n    .map((e) => copySequence(e.blocks.filter((b) => selected.has(keyOf(e.id, b.id)))))",
    expect: "T1.41i",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254). No kind answers at
    // all, so every row that asserts a copy text fails — including the two in
    // `scroll.test.ts` that assert an element's `copy` and the table's own. If
    // this survives, nothing below reaches the seam.
    file: REGISTRY,
    from: "      return definition.copy?.(resolved, (child: Block) => this.copyOf(child)) ?? null;",
    to: "      return null;",
    why:
      "no kind answers a copy text, so every assertion about one fails — " +
      "if this survives, no row reaches the seam and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
