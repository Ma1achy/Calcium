// The fixture manifest C05's suite runs against, and the shape an app writes by
// hand (commitment 3).
//
// **The tools here are deliberately generic.** `tui-kit` knows there is a tool
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
import { parseManifest, type Manifest } from "../../src/data/manifest/index.js";

/** A fresh, mutable plain object each call, so a test can break one field. */
export function raw(): Record<string, unknown> {
  return structuredClone(SOURCE) as Record<string, unknown>;
}

const SOURCE = {
  schema: "tui.manifest/1",
  binary: "widget",
  version: "2.4.0",
  tools: [
    {
      name: "ps",
      local: false,
      summary: "list processes",
      args: [],
      flags: [
        {
          name: "status",
          type: "enum",
          values: ["running", "failed", "queued"],
          summary: "filter by status",
        },
        { name: "mine", short: "m", type: "bool", summary: "only mine" },
        { name: "limit", short: "n", type: "int", summary: "how many" },
        { name: "search", short: "s", type: "string", summary: "substring match" },
        { name: "since", type: "duration", summary: "only newer than" },
        { name: "open-mr", type: "bool", summary: "open the merge request" },
        { name: "quiet", short: "q", type: "bool", summary: "less output" },
        { name: "label", type: "string", repeatable: true, summary: "repeatable label" },
      ],
    },
    {
      name: "serving",
      local: false,
      summary: "serving overview",
      args: [],
      flags: [],
    },
    {
      // The sub-verb, and the reason findTool takes tokens. T1.9 is the test
      // that matters: both this and `serving` exist, and the longer one wins.
      name: "serving scale",
      local: false,
      summary: "scale a service",
      args: [
        { name: "service", type: "string", required: true, summary: "which service" },
        { name: "replicas", type: "int", required: true, summary: "how many" },
      ],
      flags: [
        { name: "to", type: "enum", values: ["canary", "stable"], summary: "which track" },
        { name: "traffic", type: "int", requires: ["to"], summary: "percent of traffic" },
        { name: "side-by-side", type: "bool", conflicts: ["overlay"], summary: "two columns" },
        { name: "overlay", type: "bool", summary: "one column" },
        { name: "config", type: "path", summary: "config file" },
      ],
    },
    {
      name: "promote",
      local: false,
      summary: "promote a candidate",
      args: [
        {
          // EX5, in the only form the framework understands: a shape it can
          // check without knowing what it means.
          name: "target",
          type: "pattern",
          pattern: "^[\\w.]+:[\\w]+$",
          required: true,
          summary: "family:name",
        },
      ],
      flags: [],
    },
    {
      name: "tail",
      local: false,
      streams: true,
      summary: "follow output",
      args: [{ name: "paths", type: "path", required: false, variadic: true, summary: "what to follow" }],
      flags: [],
    },
    {
      name: "dashboard",
      local: false,
      oneShot: true,
      summary: "one frame to stdout",
      args: [],
      flags: [{ name: "once", type: "bool", summary: "write one frame and exit" }],
    },
    {
      name: "help",
      local: true,
      summary: "in-process help",
      args: [],
      flags: [],
    },
    {
      name: "debug dump",
      local: true,
      hidden: true,
      summary: "internal state",
      args: [],
      flags: [],
    },
  ],
} as const satisfies Record<string, unknown>;

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
