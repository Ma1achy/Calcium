// C25 §3's ASCII fallback, mutated (C25 T6.33, F1313): every glyph a patch
// draws is C09's table's, so the split separator and the header rule degrade
// with every other rule on the screen.
//
// **Two assertions, and each has a mutation only it sees.** T4.13's sweep over
// code points catches any non-ASCII glyph at the rung; the separator column
// catches an ASCII character that is not the table's — which the sweep passes.
//
// The control draws no separator at all, so the Unicode render has no split
// rows to read: if that survives, the row's own control is not reaching the
// frame.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/patch.test.ts";
const DEFINITION = "src/presentation/patch/definition.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: DEFINITION,
    from: "const separator = (ctx: RenderContext): string => glyphs(ctx.capabilities).vertical;",
    to: "const separator = (_ctx: RenderContext): string => \" \";",
    why: "no separator at either rung — T4.13 finds no split row in the Unicode render",
  },
  mutations: [
    {
      // **F1313 restored** — the literal, at every rung.
      name: "the separator is a literal U+2502 again",
      file: DEFINITION,
      from: "const separator = (ctx: RenderContext): string => glyphs(ctx.capabilities).vertical;",
      to: "const separator = (_ctx: RenderContext): string => \"\\u2502\";",
      expect: "T4.13",
    },
    {
      // **ASCII, and not the table's** — the sweep passes it; only the column
      // read sees a separator that is some other character.
      name: "the separator is an ASCII character the table does not name",
      file: DEFINITION,
      from: "const separator = (ctx: RenderContext): string => glyphs(ctx.capabilities).vertical;",
      to: "const separator = (ctx: RenderContext): string => (ctx.capabilities.unicode === \"ascii\" ? \"!\" : glyphs(ctx.capabilities).vertical);",
      expect: "T4.13",
    },
    {
      // **The rule from the Unicode set whatever the rung** — the header row
      // is not a split row, so only the sweep reaches it.
      name: "the header rule ignores the rung",
      file: DEFINITION,
      from: "  const rule = glyphs(ctx.capabilities).horizontal;",
      to: "  const rule = \"\\u2500\";",
      expect: "T4.13",
    },
  ],
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
