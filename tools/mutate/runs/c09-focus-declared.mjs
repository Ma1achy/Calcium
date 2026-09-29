// C09 I137 — each kind declares its focus shape, and the treatment follows the
// declaration: the shed rows' `row` focus, the pane rule (`paneFocus`), the
// registry seams it reads, and `form`'s control rung. Mutated (C09 T6.189–T6.191).
//
// **The form mutation is the bare ground, not `focusStyle` by name**, for
// `c09-focus-carrier.mjs`'s reason: `form.ts` no longer imports `focusStyle`, so
// naming it would fail every row on a ReferenceError — caught, and for a reason
// that says nothing about focus.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/focus-carrier.test.ts test/contract/shed-target.test.ts " +
  "test/unit/focus-shapes.test.ts test/unit/form.test.ts test/revert/focus-shapes.test.ts";
const PAINT = "src/presentation/blocks/paint.ts";
const SHED = "src/presentation/blocks/shed.ts";
const REGISTRY = "src/presentation/blocks/registry.ts";
const SPLIT = "src/presentation/blocks/kinds/split.ts";
const FORM = "src/presentation/blocks/kinds/form.ts";

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
    file: PAINT,
    from: "  return ground.background === undefined ? { inverse: true } : ground;",
    to: "  return { ...ground, inverse: true };",
    why: "inversion at every depth — T2.229 reads SGR 7 in a 24-bit box or control frame",
  },
  mutations: [
    {
      name: "SHED-GATE: a stale shed-i paints where nothing sheds (T6.189)",
      file: SHED,
      from: "  if (plan() === null) return UNLIT;\n",
      to: "",
      expect: "T1.151",
    },
    {
      name: "SHED-NONE: the shed rows draw no focus (T6.189)",
      file: SHED,
      from: "  if (lit === null) return spans;\n",
      to: "  if (lit === null || lit !== null) return spans;\n",
      expect: "T2.229",
    },
    {
      name: "SHED-WEIGHT: the head's weight dropped",
      file: SHED,
      from: "        ...(lit.head ? { bold: true } : {}),\n",
      to: "",
      expect: "T1.151",
    },
    {
      name: "SHED-SELECTION: the extent stands on the focus ground",
      file: SHED,
      from: "  const behind = (lit.on === \"selection\" ? selectionStyle : focusStyle)(ctx.theme, ctx.capabilities);",
      to: "  const behind = focusStyle(ctx.theme, ctx.capabilities);",
      expect: "T1.151",
    },
    {
      name: "PANE-GROUND: a frame child takes the ground again (T6.190)",
      file: PAINT,
      from: "  if (ctx.focusShapeOf(child) === \"frame\") return { forward: { ...focus, blockId: child.id, rowId: child.id } };\n",
      to: "",
      expect: "T1.152",
    },
    {
      name: "PANE-NO-FORWARD: the container's focus handed down unchanged (T6.190)",
      file: PAINT,
      from: "return { forward: { ...focus, blockId: child.id, rowId: child.id } };",
      to: "return { forward: focus };",
      expect: "T1.152",
    },
    {
      name: "REGISTRY-SHAPE: focusShapeOf answers null for every kind",
      file: REGISTRY,
      from: "  focusShapeOf = (block: Block): FocusShape | null => this.#definitions.get(block.kind)?.focusShape ?? null;",
      to: "  focusShapeOf = (_block: Block): FocusShape | null => null;",
      expect: "T1.152",
    },
    {
      name: "REGISTRY-FOCUS: renderChild drops the forwarded focus",
      file: REGISTRY,
      from: "          ...(focus === undefined ? {} : { focus }),\n",
      to: "",
      expect: "T1.152",
    },
    {
      name: "SPLIT-NO-FORWARD: split does not forward to a frame child (T6.190)",
      file: SPLIT,
      from: "lit !== null && \"forward\" in lit ? lit.forward : undefined);",
      to: "undefined);",
      expect: "T1.152",
    },
    {
      name: "FORM-BARE: form reads the bare ground again (T6.191)",
      file: FORM,
      from: "...focusShapeStyle(ctx.theme, caps) };",
      to: "...(focusShapeStyle(ctx.theme, caps).inverse === true ? {} : focusShapeStyle(ctx.theme, caps)) };",
      expect: "T2.229",
    },
    {
      name: "FORM-UNDECLARED: form's focusShape removed (T6.191)",
      file: FORM,
      from: "  focusShape: \"control\",\n",
      to: "",
      expect: "T2.228",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
