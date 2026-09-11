// Every value a `tools/**` module exports is named by its `.d.mts`, or exempted
// with a reason.
//
// **Found by a build, not by a reader** (F1114). `mutate.d.mts` has declared
// `Mutation` since the harness was written and never declared its `also` field,
// which `editsOf` has read since F227. Nothing noticed for as long as the only
// callers were the run files — they are `.mjs` and unchecked — and the first
// typed caller was a fixture row written months later, which failed `make
// check` after two passes and a green suite had already been read.
//
// **A `.d.mts` beside a `.mjs` is a second record of one fact**, and this repo's
// rule for those is equality in both directions. What made this one drift
// invisibly is that the module is the record everything *runs* and the
// declaration is the record only TypeScript reads: a missing name costs nothing
// until someone reaches for it from a `.ts` file, and by then the module has
// been right for a year.
//
// **The exemption is real and it is the reason this is not a blanket rule.**
// `capture-foreign.d.mts` declares three of five on purpose and says so: the
// rest of the file is a driver — `node-pty`, `sharp`, argument parsing — and
// declaring it would invite a test to import the driver, which is *an entry
// that starts on import is untestable*. So the list is an exemption with a
// reason, compared by equality, and not a subset check.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Names exported as **values**, by the four forms these files use.
 *
 * **`async` is in the alternation because leaving it out is how the first sweep
 * for this rule reported a clean tree** (F1114). `export async function` is ten
 * of the corpus's exports, and `capture-foreign.mjs`'s two missing names are
 * both of that form — so the instrument written to find the class was blind to
 * a fifth of it and said `none` for the one file that had the most. A matcher
 * that sees one encoding reports absence when the value changes form.
 */
const exportsOf = (src: string): readonly string[] => [
  ...new Set(
    [...src.matchAll(/^export (?:declare )?(?:async )?(?:function|class|const|let) ([A-Za-z_$][\w$]*)/gmu)].map(
      ([, name]) => name as string,
    ),
  ),
].sort();

/** Every `.mjs` under `tools/` that has a `.d.mts` beside it. */
const pairs = (dir = "tools"): readonly { mjs: string; dmts: string }[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return pairs(path);
    if (!e.name.endsWith(".d.mts")) return [];
    return [{ mjs: `${path.slice(0, -".d.mts".length)}.mjs`, dmts: path }];
  });

/**
 * Exports a `.d.mts` leaves out **on purpose**, with the reason.
 *
 * A debt list's opposite: these are not owed, and an entry that starts being
 * declared is a failure exactly as an undeclared export is — a list nobody
 * prunes outlives its reason unread.
 */
const UNDECLARED_ON_PURPOSE: Readonly<Record<string, readonly string[]>> = {
  // The file's own header: *only the three*. The rest is a driver, and a
  // declaration would invite a test to import it.
  "tools/capture-foreign.mjs": ["capture", "fromRaw"],
};

describe("tools — a module and its declarations are one record", () => {
  it("TD-D1: the walk has a corpus, and it is the pairs on disk", () => {
    // **The corpus, before the absence.** A walk that found nothing would pass
    // every assertion below, and pass hardest the day a declaration goes
    // missing.
    const found = pairs();
    expect(found.length, "every .d.mts with a .mjs beside it").toBeGreaterThanOrEqual(16);
    for (const { mjs } of found) {
      expect(readFileSync(mjs, "utf8").length, `${mjs} is readable`).toBeGreaterThan(0);
    }
    const total = found.reduce((n, p) => n + exportsOf(readFileSync(p.mjs, "utf8")).length, 0);
    expect(total, "and the reader sees the exports, not zero of them").toBeGreaterThan(150);
  });

  it("TD-D2 (F1114): every exported value is declared, or exempted by name", () => {
    const undeclared: string[] = [];
    for (const { mjs, dmts } of pairs()) {
      const declared = new Set(exportsOf(readFileSync(dmts, "utf8")));
      const exempt = new Set(UNDECLARED_ON_PURPOSE[mjs] ?? []);
      for (const name of exportsOf(readFileSync(mjs, "utf8"))) {
        if (!declared.has(name) && !exempt.has(name)) undeclared.push(`${mjs} · ${name}`);
      }
    }
    expect(undeclared, "a `.ts` caller cannot name these").toEqual([]);
  });

  it("TD-D3: the exemptions are compared by equality — a declared one is a failure too", () => {
    for (const [mjs, names] of Object.entries(UNDECLARED_ON_PURPOSE)) {
      const exported = new Set(exportsOf(readFileSync(mjs, "utf8")));
      const declared = new Set(exportsOf(readFileSync(`${mjs.slice(0, -".mjs".length)}.d.mts`, "utf8")));
      for (const name of names) {
        expect(exported.has(name), `${mjs} still exports ${name}`).toBe(true);
        expect(declared.has(name), `${mjs}'s ${name} is declared now — take it off the list`).toBe(false);
      }
    }
  });

  it("TD-D4: fabricated violations — an undeclared export, and the `async` form that got past the first sweep", () => {
    const check = (mjs: string, dmts: string): readonly string[] => {
      const declared = new Set(exportsOf(dmts));
      return exportsOf(mjs).filter((n) => !declared.has(n));
    };

    // The control: a pair that agrees reports nothing.
    expect(
      check("export function a() {}\nexport const b = 1;\n", "export declare function a(): void;\nexport declare const b: number;\n"),
      "a pair that agrees",
    ).toEqual([]);

    // A plain function left out.
    expect(check("export function a() {}\nexport function b() {}\n", "export declare function a(): void;\n")).toEqual(["b"]);

    // **The form the first sweep could not see.** `capture` and `fromRaw` are
    // both `export async function`, and a matcher without the `async`
    // alternative reports this pair clean.
    expect(check("export async function a() {}\n", ""), "an async function is an export").toEqual(["a"]);
    expect(check("", "export declare function a(): Promise<void>;\n"), "and it is declarable").toEqual([]);

    // A `class`, which is three of the corpus and the one non-function form.
    expect(check("export class E extends Error {}\n", "")).toEqual(["E"]);
  });
});
