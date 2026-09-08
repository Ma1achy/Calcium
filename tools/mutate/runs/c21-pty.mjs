// C21 I15–I18 — the PTY port, mutated.
//
// **The port's whole claim is about a party this repo does not contain.** A
// consumer injects `node-pty`; every test here injects a fake. So the mutations
// split in two: those a fake can catch — the geometry and env a child cannot
// recover from, the after-exit rulings — and those only a *type* can, which is
// why `ARGS-READONLY` mutates a declaration and is killed by a source row with
// `tsc` holding the same claim one gate over (F920).
//
// The refusal mutations are the ones to read twice. `spawnPty` has no fallback
// (I16), and a fallback is the change a reader makes when a throw looks
// unhelpful: it is one line, it makes a failing session run, and the child it
// produces is a pipe with none of the colours the caller asked for and no cause
// anywhere.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/emulator.test.ts test/contract/emulator.test.ts test/edge/emulator.test.ts test/revert/emulator.test.ts";
const RUNNER = "src/data/process/runner.ts";
const TYPES = "src/data/process/types.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: RUNNER,
    from: "    get hasPty(): boolean {\n      return deps.pty !== undefined;\n    },",
    to: "    get hasPty(): boolean {\n      return false;\n    },",
    why: "hasPty constant-false fails T1.13's injected arm; a run where this survives is not executing the PTY rows at all",
  },
  mutations: [
    {
      // **The fallback.** One line, and it turns a configuration error into a
      // child that quietly lost its colours. `live` is where it shows.
      name: "no factory falls back to a pipe",
      file: RUNNER,
      from: '        throw new Error(\n          "spawnPty() with no PTY factory injected — pass one as `TuiConfig.pty` " +',
      to: '        return start({ command: resolveShell(), args: ["-c", command] }, opts);\n        throw new Error(\n          "spawnPty() with no PTY factory injected — pass one as `TuiConfig.pty` " +',
      expect: "T6.15",
    },
    {
      // The message names the state instead of the field. Both sentences are
      // true; only one tells the reader what to do.
      name: "the refusal names no field",
      file: RUNNER,
      from: '"spawnPty() with no PTY factory injected — pass one as `TuiConfig.pty` "',
      to: '"spawnPty() with no PTY factory injected "',
      expect: "T1.11",
    },
    {
      // The call's own env should win — it is the one the caller set for this
      // child. Reversed, a `TERM` override is silently the session's.
      name: "the runner's env overrides the call's",
      file: RUNNER,
      from: "env: { ...deps.env, ...opts.env },",
      to: "env: { ...opts.env, ...deps.env },",
      expect: "T1.11",
    },
    {
      // **The half a child cannot recover from.** A shell told the wrong `cols`
      // wraps its own output, and no later resize un-wraps what it printed.
      name: "the geometry is passed transposed",
      file: RUNNER,
      from: "        cols: opts.cols,\n        rows: opts.rows,",
      to: "        cols: opts.rows,\n        rows: opts.cols,",
      expect: "T1.11",
    },
    {
      // C18 §5 — the string is the user's and nothing assembles it. Dropping
      // `-c` runs the whole command line as a file name.
      name: "the shell loses its -c",
      file: RUNNER,
      from: 'factory.spawn(resolveShell(), ["-c", command], {',
      to: "factory.spawn(resolveShell(), [command], {",
      expect: "T1.11",
    },
    {
      // C21 §7 — a child may exit between the keystroke and its delivery, so a
      // write after exit is ignored. Unguarded it reaches a closed fd.
      name: "a write after exit reaches the child",
      file: RUNNER,
      from: "if (running) child.write(data);",
      to: "child.write(data);",
      expect: "T1.12",
    },
    {
      name: "a resize after exit reaches the child",
      file: RUNNER,
      from: "if (running) child.resize(cols, rows);",
      to: "child.resize(cols, rows);",
      expect: "T1.12",
    },
    {
      // The one that must *answer* rather than be ignored: a caller cancelling
      // wants to know whether anything was cancelled.
      name: "signalling an exited child answers true",
      file: RUNNER,
      from: "if (!running) return false;\n          child.kill(sig);",
      to: "child.kill(sig);",
      expect: "T1.12",
    },
    {
      // A factory that fails after building its child — `openpty` out of
      // devices. Wrapping loses the cause the consumer's own package gave.
      name: "the factory's error is wrapped",
      file: RUNNER,
      from:
        '      const child = factory.spawn(resolveShell(), ["-c", command], {\n' +
        "        cols: opts.cols,\n" +
        "        rows: opts.rows,\n" +
        "        cwd: opts.cwd(),\n" +
        "        env: { ...deps.env, ...opts.env },\n" +
        "      });",
      to:
        "      let child;\n" +
        "      try {\n" +
        '        child = factory.spawn(resolveShell(), ["-c", command], {\n' +
        "          cols: opts.cols,\n" +
        "          rows: opts.rows,\n" +
        "          cwd: opts.cwd(),\n" +
        "          env: { ...deps.env, ...opts.env },\n" +
        "        });\n" +
        "      } catch (e) {\n" +
        "        throw new Error(`spawnPty failed: ${String(e)}`);\n" +
        "      }",
      expect: "T3.19",
    },
    {
      // I15's other half: the package must not become a runtime dependency by
      // an import nobody reads twice. It is a devDependency with no Linux
      // prebuild, so this is F840's requirement failing on every consumer.
      name: "runner.ts imports node-pty",
      file: RUNNER,
      from: 'import { spawn as nodeSpawn } from "node:child_process";',
      to: 'import { spawn as nodeSpawn } from "node:child_process";\nimport { spawn as ptySpawn } from "node-pty";\nvoid ptySpawn;',
      expect: "T2.8",
    },
    {
      // I18 — the seam C23 reads before choosing an arm. Constant-true sends
      // the route down the PTY arm on a runner that cannot spawn one.
      name: "hasPty is hard-coded true",
      file: RUNNER,
      from: "    get hasPty(): boolean {\n      return deps.pty !== undefined;\n    },",
      to: "    get hasPty(): boolean {\n      return true;\n    },",
      expect: "T6.17",
    },
    {
      // **The one no fake can catch** (F920). Restoring the modifier makes the
      // port refuse `node-pty` — `Readonly<>` rewrites the method into a
      // function-typed property, so `strictFunctionTypes` applies and
      // `readonly string[]` fails against `string[] | string`. Every test in
      // this repo keeps passing, because each builds a fresh array; the source
      // row and `tsc` in T2.8 are what see it.
      name: "PtyFactory.spawn's args goes readonly again",
      file: TYPES,
      from: "    args: string[],",
      to: "    args: readonly string[],",
      expect: "T6.18",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
