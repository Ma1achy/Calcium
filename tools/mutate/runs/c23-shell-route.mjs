// C23 I63–I67 — the shell route as a live screen, mutated.
//
// **Five of the six are correct on screen.** That is what makes this route the
// one worth mutating: a snapshot per chunk draws the right picture and writes a
// two-thousand-line value into C13 a hundred times; a missing cancel leaves the
// lines, the card and the frame exactly right and only the keypress does
// nothing; a kept cursor is one inverse cell. None of them is visible in a
// screenshot, and each is a real defect this repo has shipped or nearly did.
//
// **The one that is not here is an ordering claim.** C23 I65 rules it vacuous —
// the child's repaint arrives on the write queue, which resolves after both
// calls return, so no write lands between them however they are sequenced, and
// three ordering mutations survived the row written to catch them (F852). What
// replaces it is `WIDTH-IS-THE-REGIONS`, which moves the figure by
// `BODY_INDENT` and is caught by two spies that have to agree.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/emulator.test.ts test/contract/emulator.test.ts test/edge/emulator.test.ts test/revert/emulator.test.ts";
const EXEC = "src/shell/execution.ts";

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
    file: EXEC,
    from: "      const usePty = deps.runner.hasPty;",
    to: "      const usePty = false;",
    why: "T1.52's PTY arm and T3.63 both fail; a run where this survives is not executing the shell route at all",
  },
  mutations: [
    {
      // The cost C03 exists to prevent. The screen is identical either way —
      // only the store's write count moves, from one per window to one per
      // chunk, carrying the whole screen each time.
      name: "a snapshot per chunk",
      file: EXEC,
      from: "        if (!deps.scheduler.pending) draw();",
      to: "        draw();",
      expect: "T6.93",
    },
    {
      // The figure, not the order (C23 I65, F852). Four columns of drift puts every
      // line after the first in the wrong place, and only in a box narrower
      // than the region — which is every box.
      name: "the child is told the region's width",
      file: EXEC,
      from: "          const next = Math.max(20, deps.region().width - BODY_INDENT);",
      to: "          const next = Math.max(20, deps.region().width);",
      expect: "T6.94",
    },
    {
      // F844's shipped defect: the rung finds nothing to call, and everything
      // else about the screen is right.
      name: "the PTY arm registers no cancel",
      file: EXEC,
      from:
        "        dropResize = onResize((c, r) => child.resize(c, r));\n" +
        "        cancelInFlight = (): void => {\n" +
        "          cancelled = true;\n" +
        '          child.signal("SIGINT");\n' +
        "        };",
      to: "        dropResize = onResize((c, r) => child.resize(c, r));",
      expect: "T6.95",
    },
    {
      // **Not `final.cursor = undefined`**, which C04 I85 refuses as an unknown
      // key — this is the defect as a reader would write it, by leaving the
      // snapshot alone.
      name: "the settle keeps the cursor",
      file: EXEC,
      from: "      delete final.cursor;",
      to: "",
      expect: "T6.96",
    },
    {
      // The fallback I63 forbids, one layer up from C21 I16's. It makes a
      // failing session run, which is why someone writes it.
      name: "a throwing spawnPty falls back to the pipe arm",
      file: EXEC,
      from: "        const child = deps.runner.spawnPty(command, { cwd: () => deps.session().cwd, env, cols, rows });",
      to:
        "        let child;\n" +
        "        try {\n" +
        "          child = deps.runner.spawnPty(command, { cwd: () => deps.session().cwd, env, cols, rows });\n" +
        "        } catch {\n" +
        "          const piped = deps.runner.spawnShell(command, { cwd: () => deps.session().cwd, env });\n" +
        "          child = { ...piped, onData: () => undefined, resize: () => undefined, write: () => undefined };\n" +
        "        }",
      expect: "T6.97",
    },
    {
      // The backstop for a quiet tail. Correct until a child stops writing,
      // which is the last thing every child does.
      name: "no readout is registered",
      file: EXEC,
      from: "    refresh.readout(pendingId, scrollId, () => snapshot());",
      to: "",
      expect: "T6.98",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
