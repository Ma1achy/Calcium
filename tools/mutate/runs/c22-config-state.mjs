// C22 §2 and §5 — config resolution and the session store.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = "test/unit/session-config.test.ts test/unit/session-state.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`npx vitest run ${SUITE} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/shell/state.ts",
    from: "    cwd: () => state.cwd,",
    to: '    cwd: () => "/nowhere",',
    why: "T1.12 asserts cwd() returns the session's directory",
  },
  mutations: [
    {
      name: "state: drop the freeze, keep the copy",
      file: "src/shell/state.ts",
      from: "    state = Object.freeze({ ...state, ...patch });",
      to: "    state = { ...state, ...patch };",
      expect: "T1.11e",
    },
    {
      name: "state: true in-place mutation, no copy at all",
      file: "src/shell/state.ts",
      from: "    state = Object.freeze({ ...state, ...patch });",
      to: "    state = Object.assign({ ...state }, patch) && Object.assign(state, patch);",
      expect: "T1.11d",
    },
    {
      name: "state: cwd as a captured value, not a function",
      file: "src/shell/state.ts",
      from: "    cwd: () => state.cwd,",
      to: "    cwd: (() => { const v = state.cwd; return () => v; })(),",
      expect: "T1.12",
    },
    {
      name: "state: give cluster a writer",
      file: "src/shell/state.ts",
      from: "      setHealth: (health) => set({ health }),",
      to: '      setHealth: (health) => set({ health, cluster: "drifted" }),',
      expect: "T1.11c",
    },
    {
      name: "state: setEnv replaces rather than merges",
      file: "src/shell/state.ts",
      from: "      setEnv: (key, value) => set({ env: Object.freeze({ ...state.env, [key]: value }) }),",
      to: "      setEnv: (key, value) => set({ env: Object.freeze({ [key]: value }) }),",
      expect: "T1.13",
    },
    {
      name: "config: debug:{} no longer means on-with-the-default",
      file: "src/shell/config.ts",
      from: "    retainPayloads: config.debug === undefined ? 0 : (retain ?? DEFAULT_RETAIN_PAYLOADS),",
      to: "    retainPayloads: retain ?? 0,",
      expect: "T1.5c",
    },
    {
      name: "config: validate by truthiness",
      file: "src/shell/config.ts",
      from: "    if (config[field] === undefined || config[field] === null) throw new ConfigError(field);",
      to: "    if (!config[field]) throw new ConfigError(field);",
      expect: "T2.7c",
    },
    {
      name: "config: a fifth required field",
      file: "src/shell/config.ts",
      from: 'const REQUIRED = ["name", "binary", "manifest", "theme"] as const;',
      to: 'const REQUIRED = ["name", "binary", "manifest", "theme", "stateDir"] as const;',
      expect: "T2.7b",
    },
    {
      name: "config: ignore the injected clock",
      file: "src/shell/config.ts",
      from: "    clock: config.clock ?? systemClock,",
      to: "    clock: systemClock,",
      expect: "T1.5b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
