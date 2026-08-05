// The fixture manifest C05's suite runs against, and the shape an app writes by
// hand (commitment 3).
//
// **The tools here are deliberately generic.** Calcium knows there is a tool
// with typed args and nothing more, so a fixture full of Prism verbs would prove
// the framework general by asserting it rather than by being it.
//
// The one place a domain shows through is `promote`'s positional, and it is the
// readable proof of EX5: a Prism target is `{ type: "pattern", pattern: "^…$" }`,
// **not** a `type: "uuid"` or a `type: "target"`. Read the entry and the argument
// makes itself — the manifest is perfectly legible without the framework knowing
// what a target is, so there is nothing for a `uuid` type to buy. Anyone tempted
// to add one later should change this comment first and see whether they still
// want to.
import { readFileSync } from "node:fs";

import { parseManifest, type Manifest } from "../../src/data/manifest/index.js";

/** A fresh, mutable plain object each call, so a test can break one field. */
export function raw(): Record<string, unknown> {
  return structuredClone(SOURCE) as Record<string, unknown>;
}

/**
 * **The record itself lives in JSON, and is read rather than declared here.**
 *
 * `test/support/fixture.mjs` needs the same manifest for the tier-5 session and
 * cannot import a `.ts` module — it runs from `dist/` in a spawned process. Two
 * copies of a manifest is two things to keep in step, and the drift would show
 * up as a tier-5 row asserting against a tool the tier-1 fixture does not have.
 * One file, two readers.
 */
const SOURCE = JSON.parse(
  readFileSync(new URL("./manifest.fixture.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

/** The parsed fixture. Fails loudly rather than handing tests a null. */
export function fixture(): Manifest {
  const result = parseManifest(raw());
  if (!result.ok) {
    throw new Error(`the fixture manifest must parse: ${result.error.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
  }
  return result.value;
}

/** A tool from the fixture, by name. */
export function toolNamed(name: string): Manifest["tools"][number] {
  const tool = fixture().tools.find((t) => t.name === name);
  if (tool === undefined) throw new Error(`no fixture tool named "${name}"`);
  return tool;
}

/**
 * A manifest of `count` tools, for T3.14. Names are two tokens so the match
 * walk does real work rather than hitting a single-token map on the first try.
 *
 * The summaries are padded because the spec names **10 MB**, and 5,000 terse
 * tools come to a fifth of that. A test that quietly measured a smaller
 * document would report a budget nobody had actually tested against.
 */
const PADDING = "help text that a real tool would carry, several clauses long, ".repeat(25);

export function largeManifest(count: number): Record<string, unknown> {
  const tools = [];
  for (let i = 0; i < count; i++) {
    tools.push({
      name: `group${i % 100} verb${i}`,
      local: false,
      summary: `tool number ${i}: ${PADDING}`,
      args: [{ name: "subject", type: "string", required: false, summary: "what to act on" }],
      flags: [
        { name: "verbose", short: "v", type: "bool", summary: "more output" },
        { name: "mode", type: "enum", values: ["fast", "slow", "careful"], summary: "how" },
        { name: "count", type: "int", summary: "how many" },
      ],
    });
  }
  return { schema: "tui.manifest/1", binary: "widget", version: "2.4.0", tools };
}
