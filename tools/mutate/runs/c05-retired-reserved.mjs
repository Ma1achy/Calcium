// A retired key and a reserved name, mutated (C05 I27, I28; M9 item 7, ruling 50).
//
// **Both refusals are parse-time and both used to be silence.** `view` was
// dropped as an unknown key, and a reserved verb's name was simply not on the
// collision list — so each mutation below puts one of the silences back, and a
// row that survives it is a row asserting something other than the refusal.
//
// The control refuses `view` on every tool whether or not it is declared, so
// the untouched fixture stops parsing: if that survives, nothing here can see a
// kill.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/manifest.test.ts test/revert/manifest.test.ts";
const PARSE = "src/data/manifest/parse.ts";

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
    file: PARSE,
    from: '  if (src["view"] === undefined) return;',
    to: "  if (false) return;",
    why: "every tool and flag is refused as declaring `view`, so the fixture itself stops parsing — a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The drop restored on the tool** — the state that shipped: a
      // manifest declaring a pushed view parsed into an ordinary verb.
      name: "a tool's `view` is dropped again",
      file: PARSE,
      from: "unknown key, it gave an author still declaring it no signal at all.\n  refuseRetired(raw, e, at);",
      to: "unknown key, it gave an author still declaring it no signal at all.",
      expect: "T1.24",
    },
    {
      // **The drop restored on a flag** — C05 I24's lesson: a refusal that reads
      // one of the two declaration sites covers half the ways to write it.
      name: "a flag's `view` is dropped again",
      file: PARSE,
      from: '  const interactive = takeOptionalBoolean(raw, "interactive", e, at);\n  refuseRetired(raw, e, at);',
      to: '  const interactive = takeOptionalBoolean(raw, "interactive", e, at);',
      expect: "T1.24",
    },
    {
      // **The value refused instead of the key.** `view: false` states a tier
      // choice there is no tier to make, and a check on `true` lets it parse.
      name: "only `view: true` is refused",
      file: PARSE,
      from: '  if (src["view"] === undefined) return;',
      to: '  if (src["view"] !== true) return;',
      expect: "T1.24",
    },
    {
      // **C05 I3's leniency broken in the other direction**: every key that starts
      // like the retired one is refused, which T1.24's `viewport` control is
      // there to catch.
      name: "a key merely resembling `view` is refused",
      file: PARSE,
      from: '  if (src["view"] === undefined) return;',
      to: '  if (src["view"] === undefined && !Object.keys(src).some((k) => k.startsWith("view"))) return;',
      expect: "T1.24",
    },
    {
      // **The reservation dropped** — `watch` parses, and the day `/watch`
      // ships the app stops starting.
      name: "a reserved name is not looked up",
      file: PARSE,
      from: "      const reserved = Object.hasOwn(RESERVED_VERBS, parsed.name) ? RESERVED_VERBS[parsed.name] : undefined;",
      to: "      const reserved = undefined as string | undefined;",
      expect: "T1.25",
    },
    {
      // **The prototype read as a ruling.** A tool named `constructor` is
      // refused as reserved, by a name nothing reserved.
      name: "the lookup reads the record's prototype",
      file: PARSE,
      from: "      const reserved = Object.hasOwn(RESERVED_VERBS, parsed.name) ? RESERVED_VERBS[parsed.name] : undefined;",
      to: "      const reserved = (RESERVED_VERBS as Record<string, unknown>)[parsed.name] === undefined ? undefined : String(parsed.name);",
      expect: "T1.25",
    },
    {
      // **Reserved names folded into the shipped-verb collision.** The refusal
      // fires and says the wrong thing — *a verb Calcium ships* — which sends
      // the author looking in `/help` for a verb that is not there.
      name: "a reserved name is reported as a shipped verb",
      file: PARSE,
      from: "    const framework = new Set(FRAMEWORK_NAMES);",
      to: "    const framework = new Set([...FRAMEWORK_NAMES, ...Object.keys(RESERVED_VERBS)]);",
      also: [
        {
          file: PARSE,
          from: "      const reserved = Object.hasOwn(RESERVED_VERBS, parsed.name) ? RESERVED_VERBS[parsed.name] : undefined;",
          to: "      const reserved = undefined as string | undefined;",
        },
      ],
      expect: "T1.25",
    },
  ],
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
