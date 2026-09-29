// C22 I148 — a field is written with `resolved`, and a value holding a line
// break is refused (F1395; review batch 4, shell lane).
//
// **The control** is the finding restored at `⏎`: the write takes
// `stores.editor.text`, and T4.119's one-line arm reads a private-use
// character where it wanted `db.local`.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONSTRUCT = "src/shell/construct.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync("npx vitest run test/integration/form.test.ts 2>&1", { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // T6.149 (I148).
    file: CONSTRUCT,
    from: "    const value = stores.editor.resolved;\n    if (!/[\\r\\n]/u.test(value)) return value;",
    to: "    const value = stores.editor.text;\n    if (!/[\\r\\n]/u.test(value)) return value;",
    why: "T6.149 — F1395 restored: the field writes the sentinel, and T4.119's one-line arm fails",
  },
  mutations: [
    {
      // T6.149 — the blur path alone.
      name: "the blur write takes `text`",
      file: CONSTRUCT,
      from: "    if (value !== null) writeField(b.entryId, b.formId, b.fieldId, value);",
      to: "    if (value !== null) writeField(b.entryId, b.formId, b.fieldId, stores.editor.text);",
      expect: "T4.119",
    },
    {
      // T6.149 — the `⏎` path alone.
      name: "the ⏎ write takes `text`",
      file: CONSTRUCT,
      from: "    if (value === null) return;\n    writeField(b.entryId, b.formId, b.fieldId, value);",
      to: "    if (value === null) return;\n    writeField(b.entryId, b.formId, b.fieldId, stores.editor.text);",
      expect: "T4.119",
    },
    {
      // T6.149 — F9's rule dropped at the write.
      name: "a value holding a line break is written",
      file: CONSTRUCT,
      from: "    if (!/[\\r\\n]/u.test(value)) return value;",
      to: "    if (true) return value;",
      expect: "T4.119",
    },
    {
      name: "the refusal is silent",
      file: CONSTRUCT,
      from: '    pipeline.refuse(entryId, "A field is one line, and its value held a line break — nothing was written.");\n',
      to: "",
      expect: "T4.119",
    },
    {
      name: "a refused ⏎ ends the borrow anyway",
      file: CONSTRUCT,
      from: "    const value = fieldValue(b.entryId);\n    if (value === null) return;",
      to: "    const value = fieldValue(b.entryId);\n    if (value === null) { endField(false); return; }",
      expect: "T4.119",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
