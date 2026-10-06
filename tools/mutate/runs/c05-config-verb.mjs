// `/config`, the ninth framework verb, mutated (C05 §3, C23 I80, ruling 43).
//
// **The verb is three joints and each can come apart alone**: the row in
// `FRAMEWORK_TOOLS`, the name's move off `RESERVED_VERBS`, and the handler's
// read of the record the session was built from. A mutation per joint, each
// expected at C05 T4.9.
//
// The control throws from the handler, so `/config` appends an error entry
// instead of the table: if that survives, nothing here submits the verb.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/manifest.test.ts test/unit/manifest.test.ts test/unit/local-profile.test.ts";
const HANDLERS = "src/shell/local/handlers.ts";
const EXECUTION = "src/shell/execution.ts";
const FRAMEWORK = "src/data/manifest/framework.ts";

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
    file: HANDLERS,
    from: '    config: () => doc("/config", [configBlock(deps.settings(), blockId("config"))]),',
    to: '    config: () => {\n      throw new Error("control");\n    },',
    why: "`/config` answers an error entry and no table — a run where this survives never submits the verb",
  },
  mutations: [
    {
      // **The record not handed down** — the verb draws an empty table, which
      // is a table, and an assertion about the block's kind agrees with it.
      name: "the handler is handed no settings",
      file: EXECUTION,
      from: "      settings: () => deps.settings,",
      to: "      settings: () => [],",
      expect: "T4.9",
    },
    {
      // **Defaults drawn instead of the resolved record** — every row but the
      // one the session changed agrees, which is why T4.9 builds `reduced`.
      name: "the handler draws motion's framework default",
      file: HANDLERS,
      from: '    config: () => doc("/config", [configBlock(deps.settings(), blockId("config"))]),',
      to: '    config: () => doc("/config", [configBlock(deps.settings().map((s) => (s.key === "motion" ? { ...s, value: "full" } : s)), blockId("config"))]),',
      expect: "T4.9",
    },
    {
      // **Built and still reserved** — the name on both lists, so an app
      // declaring `config` is told the verb is not built while it is.
      name: "config stays on RESERVED_VERBS after it is built",
      file: FRAMEWORK,
      // Re-anchored when ruling 50 emptied the record: the mutation is the
      // same one-entry reservation, now the record's only entry.
      from: "  // `unwatch` when §085's were. The next ruled verb is reserved here first.\n});",
      to: "  // `unwatch` when §085's were. The next ruled verb is reserved here first.\n  config: \"ruling 43, §075\",\n});",
      expect: "T4.9",
    },
  ],
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
