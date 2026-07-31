// C22 §3 — the construction order, and the cycle §3a found.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = [
  "test/unit/session-construct.test.ts",
  "test/integration/lifecycle.test.ts",
  "test/integration/viewport.test.ts",
].join(" ");

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
    file: "src/shell/construct.ts",
    from: '  "capabilities",\n  "registries",',
    to: '  "registries",\n  "capabilities",',
    why: "T1.1 compares the log against STEPS, so reordering STEPS cannot pass",
  },
  mutations: [
    {
      // Seam 4's C22 rows: the shell pushes, the component never reaches.
      name: "wire the resize after the router instead of at 8a",
      file: "src/shell/construct.ts",
      from: '  at("resize", () => {\n    lifecycle.onResize',
      to: '  at("router", () => undefined);\n  at("resize", () => {\n    lifecycle.onResize',
      expect: "T1.1",
    },
    {
      name: "let C14 hear the resize itself instead of being handed it",
      file: "src/shell/construct.ts",
      from: "      stores.viewport.resize({ width: size.columns, height: size.rows });",
      to: "      // the viewport is left to find out on its own",
      expect: "T4.6",
    },
    {
      name: "commit the scroll from nowhere — C14 moves and nothing paints",
      file: "src/shell/construct.ts",
      from: "      move(stores.viewport);\n      scheduler.commit(\"input\");",
      to: "      move(stores.viewport);",
      expect: "T4.8",
    },
    {
      // **The mutation the 9/10/11 split exists for.** Registration moves back
      // in with the router, as the spec had it, and the submit handler closes
      // over a `pipeline` that is still in its temporal dead zone.
      name: "register the submit handler at step 9, with the router",
      file: "src/shell/construct.ts",
      from: `  at("register", () => {
    router.register("prompt", (e) => {`,
      to: `  ((): void => {
    router.register("prompt", (e) => {`,
      expect: "T1.4b",
    },
    {
      name: "construct the lifecycle before the stores (I1)",
      file: "src/shell/construct.ts",
      from: '  const runner = at("runner", () =>',
      to: '  const runner = atLate("runner", () =>',
      expect: "T1.2",
    },
    {
      name: "seal after registration (I3)",
      file: "src/shell/construct.ts",
      from: `  at("seal", () => {
    built.blocks.seal();`,
      to: `  queueMicrotask(() => {
    built.blocks.seal();`,
      expect: "T1.4",
    },
    {
      name: "detect capabilities after the registries are built",
      file: "src/shell/construct.ts",
      from: '  const detection = at("capabilities", () => detectCapabilities(config.env));',
      to: "  const detection = detectCapabilities(config.env);",
      expect: "T1.1",
    },
    {
      name: "give the viewport a placeholder size, corrected later",
      file: "src/shell/construct.ts",
      from: "  const size = terminalSize(config.stdout);",
      to: "  const size = { columns: 80, rows: 24 };",
      expect: "T1.14",
    },
    {
      name: "acquire the terminal during construction (I2)",
      file: "src/shell/construct.ts",
      from: '  const scheduler = at("scheduler", () =>',
      to: '  lifecycle.acquire();\n  const scheduler = at("scheduler", () =>',
      expect: "T1.3",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
