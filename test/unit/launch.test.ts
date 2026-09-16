// C24 I37 — `@fmx/calcium/launch` narrows Ink's es-toolkit import to the one
// module it binds, exactly or not at all (F1192).
import { describe, expect, it } from "vitest";
import { INK_IMPORT_LINE, armsOn, narrowedUrl } from "../../src/launch.js";

const BARREL = "file:///app/node_modules/es-toolkit/dist/compat/index.mjs";
const NARROW = "file:///app/node_modules/es-toolkit/dist/compat/function/throttle.mjs";

describe("C24 I37 — prepareLaunch's arming predicate and URL rewrite", () => {
  it("T1.12 (C24 I37, F1192): the exact line arms; a two-name import, double quotes or an absent line do not; the barrel URL maps to throttle.mjs when it exists and to itself otherwise, and any other URL to itself", () => {
    // **Arming.** The line as Ink 7.1 ships it, inside surrounding source.
    const ink = `import process from 'node:process';\n${INK_IMPORT_LINE}\nimport React from 'react';\n`;
    expect(armsOn(ink), "Ink's line, byte for byte").toBe(true);
    // The three ways the line stops being the line. The two-name form is the
    // one that matters: a redirect armed on it links `debounce` against a file
    // exporting `throttle` (T6.20).
    expect(armsOn(ink.replace(INK_IMPORT_LINE, "import { throttle, debounce } from 'es-toolkit/compat';")), "two names").toBe(false);
    expect(armsOn(ink.replace(INK_IMPORT_LINE, 'import { throttle } from "es-toolkit/compat";')), "double quotes").toBe(false);
    expect(armsOn(ink.replace(INK_IMPORT_LINE, "")), "no line").toBe(false);
    expect(armsOn(ink.replace(INK_IMPORT_LINE, "import { throttle } from 'es-toolkit/compat/function/throttle';")), "already narrow").toBe(false);

    // **The rewrite.** The barrel's resolved URL, with the narrow file present.
    const seen: string[] = [];
    const present = (p: string): boolean => { seen.push(p); return true; };
    expect(narrowedUrl(BARREL, present)).toBe(NARROW);
    expect(seen, "the existence check is made on the narrow file's path").toEqual(["/app/node_modules/es-toolkit/dist/compat/function/throttle.mjs"]);
    // The fallback arm: the layout is not the one the hook knows, so the barrel stays.
    expect(narrowedUrl(BARREL, () => false), "narrow file absent → the barrel").toBe(BARREL);
    // Any other URL is itself, and the disk is not asked.
    const asked: string[] = [];
    const record = (p: string): boolean => { asked.push(p); return true; };
    for (const other of [
      "file:///app/node_modules/other/dist/index.mjs",
      "file:///app/node_modules/es-toolkit/dist/index.mjs",
      "file:///app/node_modules/es-toolkit/dist/compat/index.js",
      NARROW,
    ]) expect(narrowedUrl(other, record), other).toBe(other);
    expect(asked, "no existence check for a URL that is not the barrel").toEqual([]);
  });
});
