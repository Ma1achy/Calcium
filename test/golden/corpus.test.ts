/**
 * **`README.md` against the directory it describes** (F163, F1029).
 *
 * The finding this closes is not that the golden corpus was missing a frame. It
 * is that `test/golden/README.md` said *frames* while holding none — a category
 * whose own description names something it does not contain reads as covered for
 * exactly as long as nobody opens it. Adding the missing frame fixes the corpus
 * for a day; what keeps the description honest is a row that fails when it stops
 * being true.
 *
 * **So the table is parsed from the README rather than restated here.** That is
 * `test/contract/capabilities.test.ts` T2.6's idiom and it makes the same trade,
 * stated there in one sentence: *brittle against reformatting that one table, and
 * the alternative is brittle against the spec and the code diverging.* A second
 * copy of the census in TypeScript is a fork, not a check.
 *
 * **The kind is derived, never read from the row.** Otherwise the row asserts
 * itself. `classify` answers from the file's own imports, and the README's kind
 * column has to agree with it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = "test/golden";
const README = join(DIR, "README.md");

type Kind = "frame" | "bytes" | "lines" | "census";

/**
 * What a golden file actually is, from its own imports.
 *
 * **`frame` is not *imports from `src/shell/`***, and F738 is why: a grep for
 * `shell/` over this directory answers three, one of which is a stack-trace
 * string in a fixture, and of the two real ones neither composes a frame —
 * `continuation.test.ts` takes a paint helper and `patch.test.ts` a builder.
 * The property that matters is whether the file drives a **session**, because
 * that is the only thing that reaches `paint`, `compose` and `render-frame`
 * together.
 */
export function classify(source: string): Kind {
  const imports = [...source.matchAll(/from "([^"]+)"/gu)].map((m) => m[1]!);
  if (imports.some((i) => i.includes("support/frame-golden.js") || i.includes("support/session.js"))) {
    return "frame";
  }
  if (imports.some((i) => i.includes("../../tools/"))) return "bytes";
  // **A file that renders nothing is not a rendering.** This one is the case:
  // it asserts about the corpus and holds no snapshot, and calling it `lines`
  // would put a row in the count of things that draw.
  //
  // **The call, not the name.** This file is a member of the corpus it
  // classifies, so a bare `toMatchSnapshot` written anywhere in it — in a
  // comment, in a string — makes it classify itself as a rendering. It did.
  if (!/\.toMatchSnapshot\(/u.test(source)) return "census";
  return "lines";
}

/** The `src/shell/` specifiers a file imports, as written, sorted. */
export function shellImports(source: string): readonly string[] {
  return [...new Set(
    [...source.matchAll(/from "([^"]+)"/gu)]
      .map((m) => m[1]!)
      .filter((i) => i.includes("src/shell/"))
      .map((i) => i.slice(i.indexOf("src/shell/") + "src/shell/".length)),
  )].sort();
}

/** Every `*.test.ts` in the directory. */
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

const sources = new Map(files.map((f) => [f, readFileSync(join(DIR, f), "utf8")]));
const readme = readFileSync(README, "utf8");

/** `| \`name.test.ts\` | kind | … | shell imports |` — the four-column rows only. */
export function parseTable(md: string): Map<string, { kind: string; shell: string }> {
  const out = new Map<string, { kind: string; shell: string }>();
  for (const line of md.split("\n")) {
    const cells = line.split(/(?<!\\)\|/u).map((c) => c.trim());
    // Two empty edges plus four cells.
    if (cells.length !== 6) continue;
    const [, file, kind, , shell] = cells;
    if (file === undefined || kind === undefined || shell === undefined) continue;
    if (file === "file" || /^-+$/u.test(file)) continue;
    const name = file.replaceAll("`", "");
    if (!name.endsWith(".test.ts")) continue;
    out.set(name, { kind: kind.replaceAll("*", ""), shell });
  }
  return out;
}

const table = parseTable(readme);

describe("the golden corpus, against its own README", () => {
  it("GC1: the README's table and the directory are the same set, both ways", () => {
    // **Equality, not containment.** A subset check passes for a corpus that has
    // quietly shrunk, and *a file stopped being run* is one of the two things
    // this row exists to refuse.
    expect([...table.keys()].sort(), "rows in README.md").toEqual(files);
    expect(table.size, "the table parsed at all").toBeGreaterThan(0); // cells-ok — a count
  });

  it("GC2: every row's kind is the kind its file's imports say it is", () => {
    for (const [name, row] of table) {
      expect(classify(sources.get(name)!), `${name} in README.md`).toBe(row.kind);
    }
  });

  it("GC3: the README's own counts are the directory's", () => {
    // **The headline sentence, parsed.** A count written into prose is a belief
    // the moment the thing it counts changes, and this directory has been the
    // measured case twice: the entry that opened F163 said *four files*, and by
    // the time it was re-measured there were twelve (F738).
    const m = /\*\*(\d+) test files — (\d+) frame, (\d+) byte corpora, (\d+) renderings/u.exec(readme);
    expect(m, "the census sentence at the top of README.md").not.toBeNull();
    const [, total, frame, bytes, lines] = m!.map(Number) as [number, number, number, number, number];
    const kinds = files.map((f) => classify(sources.get(f)!));
    expect(total, "test files").toBe(files.length);
    expect(frame, "files composing a frame").toBe(kinds.filter((k) => k === "frame").length);
    expect(bytes, "byte corpora").toBe(kinds.filter((k) => k === "bytes").length);
    expect(lines, "block renderings").toBe(kinds.filter((k) => k === "lines").length);
  });

  it("GC4: the fourth column is the `src/shell/` each file imports, and it is measured", () => {
    // **The column F738 exists for.** `grep -l "shell/"` says three files, one of
    // them a stack-trace string in a fixture; the imports say two, and neither is
    // paint's caller. Writing the specifiers down where a reader sees them is
    // what stops the next count being taken with a grep.
    for (const [name, row] of table) {
      const measured = shellImports(sources.get(name)!);
      const declared =
        row.shell === "—"
          ? []
          : row.shell.includes("through")
            ? measured // the frame file reaches L4 through a support module, named in the row
            : [...row.shell.matchAll(/`([^`]+)`/gu)].map((m) => m[1]!).sort();
      expect(declared, `${name}'s src/shell/ imports`).toEqual(measured);
    }
  });

  it("GC5: the classifier responds — a control, and a fabricated violation", () => {
    // **Non-empty in every kind.** A classifier that answered `lines` for
    // everything would pass GC2 and GC3 the day the corpus happened to be all
    // lines, and would pass them silently forever after.
    const kinds = new Set(files.map((f) => classify(sources.get(f)!)));
    expect(kinds, "every kind is populated").toEqual(
      new Set(["frame", "bytes", "lines", "census"]),
    );

    // **The violation.** Take the one file that composes a frame and remove the
    // import that makes it one: the classifier must stop saying `frame`. Without
    // this the rule is satisfied by a function that returns the README's own
    // answer, which is the shape an absence assertion fails in silently.
    const frameFile = files.find((f) => classify(sources.get(f)!) === "frame")!;
    const stripped = sources
      .get(frameFile)!
      .replaceAll("support/frame-golden.js", "support/render.js")
      .replaceAll("support/session.js", "support/render.js");
    expect(stripped, "the fabricated source actually differs").not.toBe(sources.get(frameFile));
    expect(classify(stripped), `${frameFile} with its session import removed`).not.toBe("frame");

    // And the reverse: a file that is `lines` becomes `frame` when it takes one.
    //
    // **The specifier is assembled rather than written**, because this file is
    // itself in the corpus it classifies: a literal `from "…frame-golden.js"`
    // anywhere in this source — inside a template, inside a comment — makes
    // `classify` answer `frame` about the census, and GC2 would then be asserting
    // a fact this row created. It did, on the first run.
    const linesFile = files.find((f) => classify(sources.get(f)!) === "lines")!;
    const spec = JSON.stringify("../support/frame-golden.js");
    const promoted = `${sources.get(linesFile)!}\nimport { readFrame } from ${spec};\n`;
    expect(classify(promoted), `${linesFile} given a session import`).toBe("frame");
  });
});
