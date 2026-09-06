/**
 * Drive the plots example through a real PTY, run `/profile`, and render each
 * pane to a PNG.
 *
 * **Every figure in these images is measured off the session that drew them.**
 * The script types `/all` first on purpose: thirty-six forms is real work, so
 * the spans, the counters and the worst-frame table have something in them that
 * a still session would not produce.
 *
 * Three pieces already in the tree, pointed at C28:
 *   `interactivePty`  test/support/pty.ts, which types as a user does and
 *                     applies the edit stream to a screen model rather than
 *                     slicing it (F149).
 *   `styledFrame`     the same painter's per-row SGR, which is the input the
 *                     SVG writer wants.
 *   `catalogue-png`   ansiToSvg then pngFromSvg, and `unparsedSgr` so a code
 *                     neither of them reads is counted rather than dropped.
 *
 *     node tools/profile-shots.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { interactivePty } from "../test/support/pty.ts";
import { ansiToSvg, pngFromSvg, unparsedSgr } from "./catalogue-png.mjs";

const OUT = "out/profiler";
const COLS = 118;
const ROWS = 42;
const CTRL_C = String.fromCharCode(3);

const PANES = ["overview", "frame", "distribution", "memory"];

async function shoot(pty, name) {
  const styled = pty.styledFrame;
  const ansi = styled.join("\n");
  const stray = unparsedSgr(ansi);
  const png = await pngFromSvg(ansiToSvg(ansi), 144);
  const file = join(OUT, name + ".png");
  writeFileSync(file, png);
  return { file, rows: styled.length, bytes: png.length, stray };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const pty = interactivePty(
    "cd examples/plots && NODE_ENV=production node --experimental-strip-types main.ts",
    { cols: COLS, rows: ROWS, env: { LANG: "C.UTF-8" } },
  );

  await pty.waitFor(/\u276f/, 30000);

  pty.type("/all\r");
  await pty.waitForFrame((f) => f.join("").length > 400, 30000);
  pty.type("/mosaic\r");
  await pty.waitForFrame((f) => f.join("").length > 400, 20000);
  pty.type("/rungs\r");
  await pty.waitForFrame((f) => f.join("").length > 400, 20000);

  const shots = [];
  for (const pane of PANES) {
    pty.type("/profile " + pane + "\r");
    await new Promise((r) => setTimeout(r, 1400));
    shots.push(await shoot(pty, pane));
    process.stdout.write(pane + " -> " + shots[shots.length - 1].file + "\n");
  }

  pty.type(CTRL_C);
  pty.type(CTRL_C);
  await new Promise((r) => setTimeout(r, 400));

  for (const s of shots) {
    process.stdout.write(
      s.file + "  " + String(s.rows) + " rows  " + String(Math.round(s.bytes / 1024)) +
      " KiB  stray SGR: " + JSON.stringify(s.stray) + "\n",
    );
  }
  process.exit(0);
}

await main();
