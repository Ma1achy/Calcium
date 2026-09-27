// C25 I24, I25, §3d — a patch line is an element, and focus and selection land
// on it. Mutated (C25 T6.32).
//
// **The window arm is the one the elements found rather than the one they
// were for** (F1259): the forced header a trailing collapse marker draws was
// counted as leading slack, and only a consumer of positions could see it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/patch-focus.test.ts";
const ELEMENTS = "src/presentation/patch/elements.ts";
const LINES = "src/presentation/patch/lines.ts";
const DEFINITION = "src/presentation/patch/definition.ts";
const WINDOW = "src/presentation/patch/window.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
    file: ELEMENTS,
    from: "        copy: `${MARKERS[line.kind]}${line.text}`,",
    to: "        copy: line.text,",
    why: "a line copied without its marker — T1.28 reads the copies as unified diff",
  },
  mutations: [
    {
      name: "the id made positional, the owed attempt's `h0:1` shape",
      file: ELEMENTS,
      from: "    const id = lineId(line);",
      to: "    const id = `h${String(out.length)}`;",
      expect: "T2.16",
    },
    {
      name: "the split right half starting at the separator",
      file: ELEMENTS,
      from: "  const RIGHT = { from: side + 1, to: 2 * side + 1 };",
      to: "  const RIGHT = { from: side, to: 2 * side + 1 };",
      expect: "T1.28",
    },
    {
      name: "selection losing to the diff ground",
      file: LINES,
      from: "  if (mark.selected) return selectionStyle(ctx.theme, ctx.capabilities);",
      to: "  if (mark.selected && SURFACES[kind] === null) return selectionStyle(ctx.theme, ctx.capabilities);",
      expect: "T2.17",
    },
    {
      name: "the head's bold dropped",
      file: LINES,
      from: "  const bold = mark.head;",
      to: "  const bold = false;",
      expect: "T2.17",
    },
    {
      name: "the dim kept beside the bold",
      file: LINES,
      from: "        ...(bold || dim === undefined ? grounded : { ...grounded, dim }),",
      to: "        ...(dim === undefined ? grounded : { ...grounded, dim }),",
      expect: "T2.17",
    },
    {
      name: "the extent filtered by the head's block rather than its own",
      file: DEFINITION,
      from: "  const selected = new Set((focus.selected ?? []).filter((s) => s.blockId === block.id).map((s) => s.rowId));",
      to: "  const selected = new Set((focus.selected ?? []).filter(() => focus.blockId === block.id).map((s) => s.rowId));",
      expect: "T2.17",
    },
    {
      name: "the header a trailing marker forces counted as leading slack (F1259)",
      file: WINDOW,
      from: "    if (markerIn.has(h) && !touched.has(h)) dropRows += 1;",
      to: "    if (markerIn.has(h) && !touched.has(h) && h < 0) dropRows += 1;",
      expect: "T2.16",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
