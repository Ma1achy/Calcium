// C04 I140, C09 I122, C10 §4k.2 row 5 — a field's availability: a disabled
// field stands in the well, is no element and is not submitted; a readonly one
// is not entered. Mutated at each joint (C10 T6.105, C09 T6.141).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/form.test.ts test/contract/theme.test.ts test/contract/view-model.test.ts";
const FORM = "src/presentation/blocks/kinds/form.ts";
const SUBMIT = "src/shell/form-submit.ts";
const CONSTRUCT = "src/data/viewmodel/construct.ts";

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
    file: FORM,
    from: '    if (p.field.availability === "disabled") continue;\n',
    to: "",
    why: "a disabled field listed as an element — T2.135 names the element list",
  },
  mutations: [
    {
      name: "the disabled field drawn without the well (C10 T6.105)",
      file: FORM,
      from: '...background("surface.bgDeep", ctx.theme, caps) };',
      to: "};",
      expect: "T2.47",
    },
    {
      name: "the disabled field painted with an enabled field's styles (C09 T6.141)",
      file: FORM,
      from: '      const disabled = p.field.availability === "disabled";',
      to: "      const disabled = false;",
      expect: "T2.186",
    },
    {
      name: "a disabled field's value submitted",
      file: SUBMIT,
      from: '    .filter((f) => f.availability !== "disabled" && (f.value ?? "") !== "")',
      to: '    .filter((f) => (f.value ?? "") !== "")',
      expect: "T2.135",
    },
    {
      name: "a readonly field entered",
      file: FORM,
      from: '        ...(p.field.availability === "readonly" ? {} : { viewState: true as const }),',
      to: "        viewState: true,",
      expect: "T2.135",
    },
    {
      name: "block() accepts any availability word",
      file: CONSTRUCT,
      from: '        if (field.availability !== undefined && !["enabled", "readonly", "disabled"].includes(field.availability)) {',
      to: "        if (false as boolean) {",
      expect: "T2.134",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
