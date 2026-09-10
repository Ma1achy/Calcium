/**
 * C09 T5.5 — the two kitty protocol readings the arm rests on, in a real kitty.
 *
 * **F421 found them asserted five times in five of our own files and measured in
 * none**, and the reason nobody had read them was a belief that *which picture is
 * displayed* needs a human in front of the terminal. It does not: it is a pixel
 * count. This drives a real kitty under Xvfb, screenshots the root window with
 * ImageMagick's `import`, and counts strongly-red, strongly-green and
 * strongly-blue pixels. Repetition across documents is not corroboration
 * (F1036).
 *
 * **What is asserted, and each is what a design decision rests on:**
 *
 *   1  `a=T` at a live id replaces the picture, and the screen follows **with no
 *      placeholder cell rewritten** — which is the whole of C09 I66: the
 *      placement rows are byte-identical across frames and the row diff skips
 *      them, so a frame of an animation is one transmission and nothing else
 *   2  `v=1` on `a=a` loops for ever, and a later `a=T` at that id **discards**
 *      the frames the earlier `a=f`s uploaded (C09 I39, §4c)
 *   3  a transmission no placeholder addresses is accepted, draws nothing and
 *      **stays resident** — the cost the refusal path was paying every frame
 *      until C09 I67 stopped writing it (§8b G14, F1026)
 *
 * **The animation bytes are the shipped `transmitAnimation` and `transmitRgba`
 * unchanged.** Only the still-replace pair rewrites `q=2` to `q=0`, to read the
 * replies, and the rewrite is asserted rather than assumed.
 *
 * **Every read window carries a control.** The first draft of this probe
 * backgrounded its reader and read zero bytes in every case *including* the
 * controls, which is a broken reader and not a quiet terminal — so a `CSI c` is
 * written into each window and its `CSI ?62;c` answer is asserted. The screen
 * side has its own control: a picture at a fresh id must appear, or a run that
 * saw no change would read as a replace.
 *
 * **The stated limit**: kitty 0.41.1 is the protocol's reference implementation
 * and not the population. Ghostty implements no animation extension, so reading
 * 2 there is expected to differ and is not covered here.
 */
import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  payload,
  placeholderCell,
  transmit,
  transmitAnimation,
  transmitRgba,
} from "../../src/presentation/image/kitty.js";
import { emulatorMissing, sleep } from "../support/x-emulator.js";
import { rgbPng } from "../support/png.js";
import type { Pixels } from "../../src/presentation/image/index.js";

const ID = 911;
const SPARE = 912;
const COLS = 20;
const ROWS = 6;

/** The shipped escape with its reply suppression lifted — one substitution, asserted. */
function loud(escape: string): string {
  const out = escape.split("q=2").join("q=0");
  if (out === escape) throw new Error("the shipped transmission no longer carries q=2");
  return out;
}

function grid(id: number, cols: number, rows: number): string {
  let out = "";
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) out += placeholderCell(id, r, c);
    out += "\r\n";
  }
  return out;
}

function solid(r: number, g: number, b: number): Pixels {
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: 16, height: 16, data };
}

type Ink = Readonly<{ red: number; green: number; blue: number }>;

/** Strongly-red, strongly-green and strongly-blue pixels in a screenshot. */
function tally(png: string): Ink {
  const txt = spawnSync("convert", [png, "-format", "%c", "histogram:info:-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const line of (txt.stdout ?? "").split("\n")) {
    const m = /^\s*(\d+):\s*\(\s*(\d+),\s*(\d+),\s*(\d+)/u.exec(line);
    if (m === null) continue;
    const n = Number(m[1]);
    const r = Number(m[2]);
    const g = Number(m[3]);
    const b = Number(m[4]);
    if (r > 180 && g < 80 && b < 80) red += n;
    if (g > 180 && r < 80 && b < 80) green += n;
    if (b > 180 && r < 80 && g < 80) blue += n;
  }
  return { red, green, blue };
}

type Step = Readonly<{ bytes: string; shots: number; gap: number }>;
type Result = Readonly<{ inks: readonly (readonly Ink[])[]; replies: readonly string[] }>;

/**
 * Write each step's bytes into a real kitty, screenshotting after each.
 *
 * One display per run, never reused — `x-emulator.ts`'s own rule, for its own
 * reason: a second run's server would race the first's shutdown for the socket.
 */
async function drive(steps: readonly Step[]): Promise<Result> {
  const work = mkdtempSync(join(tmpdir(), "c09-kitty-"));
  const display = `:${String(700 + (process.pid % 200))}`;
  const env = { ...process.env, DISPLAY: display, LIBGL_ALWAYS_SOFTWARE: "1", LANG: "C.UTF-8" };
  // **UTF-8, because the placeholder is U+10EEEE**: a latin1 write turns every
  // cell into `?`, and the first run of this probe read zero coloured pixels in
  // every case including the controls.
  steps.forEach((s, i) => {
    writeFileSync(join(work, `s${String(i)}.bin`), s.bytes, "utf8");
  });
  writeFileSync(
    join(work, "inner.sh"),
    [
      "stty raw -echo",
      "printf '\\ec'",
      ...steps.map((_s, i) =>
        [
          `cat ${join(work, `s${String(i)}.bin`)}`,
          "printf '\\e[c'",
          // **In the foreground.** A `&` here is a background tty read and stops
          // on SIGTTIN, which is *no reader* wearing *no report*'s clothes.
          `timeout --foreground 2 cat > ${join(work, `r${String(i)}.bin`)}`,
          `touch ${join(work, `ready${String(i)}`)}`,
          `while [ ! -e ${join(work, `done${String(i)}`)} ]; do sleep 0.2; done`,
        ].join("\n"),
      ),
      "sleep 1",
      "",
    ].join("\n"),
  );

  const xvfbLog = openSync(join(work, "xvfb.log"), "w");
  const termLog = openSync(join(work, "term.log"), "w");
  const xvfb = spawn("Xvfb", [display, "-screen", "0", "1024x768x24"], {
    stdio: ["ignore", xvfbLog, xvfbLog],
  });
  const inks: Ink[][] = [];
  const replies: string[] = [];
  try {
    for (let i = 0; i < 40; i += 1) {
      if (spawnSync("xdotool", ["getdisplaygeometry"], { env, stdio: "ignore" }).status === 0) break;
      await sleep(100);
    }
    const term = spawn("kitty", ["-o", "allow_remote_control=no", "bash", join(work, "inner.sh")], {
      env,
      stdio: ["ignore", termLog, termLog],
    });
    let gone = false;
    const exited = new Promise<void>((r) => {
      term.on("exit", () => {
        gone = true;
        r();
      });
    });
    let window = "";
    for (let i = 0; i < 300 && window === "" && !gone; i += 1) {
      const found = spawnSync("xdotool", ["search", "--onlyvisible", "--class", "kitty"], {
        env,
        encoding: "utf8",
      });
      window = (found.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
      if (window === "") await sleep(100);
    }
    if (window === "") {
      throw new Error(
        `kitty opened no window on ${display} (${gone ? "exited" : "still running"})\n` +
          `--- kitty stderr\n${readFileSync(join(work, "term.log"), "utf8")}`,
      );
    }
    await sleep(500);
    spawnSync("xdotool", ["windowfocus", "--sync", window], { env, stdio: "ignore" });
    for (const [i, step] of steps.entries()) {
      for (let k = 0; k < 300 && !existsSync(join(work, `ready${String(i)}`)); k += 1) await sleep(100);
      await sleep(600);
      const shots: Ink[] = [];
      for (let n = 0; n < step.shots; n += 1) {
        const png = join(work, `shot-${String(i)}-${String(n)}.png`);
        spawnSync("import", ["-window", "root", "-display", display, png], { env, stdio: "ignore" });
        shots.push(existsSync(png) ? tally(png) : { red: -1, green: -1, blue: -1 });
        if (n < step.shots - 1) await sleep(step.gap);
      }
      inks.push(shots);
      writeFileSync(join(work, `done${String(i)}`), "");
    }
    await Promise.race([exited, sleep(15_000)]);
    for (const [i] of steps.entries()) {
      const f = join(work, `r${String(i)}.bin`);
      replies.push(existsSync(f) ? readFileSync(f).toString("latin1") : "");
    }
    return { inks, replies };
  } finally {
    xvfb.kill();
    await sleep(500);
    closeSync(xvfbLog);
    closeSync(termLog);
    rmSync(work, { recursive: true, force: true });
  }
}

const missing = emulatorMissing("kitty");
const skipReason = missing === null ? "" : ` — skipped: ${missing}`;

describe("C09 §4c e2e — the protocol readings the arm rests on", () => {
  it.skipIf(missing !== null)(
    `T5.5 (C09 I66, I39, I67): \`a=T\` replaces at a live id and the screen follows with no cell rewritten; an unaddressed transmission draws nothing and stays resident${skipReason}`,
    async () => {
      const { inks, replies } = await drive([
        { bytes: loud(transmit(ID, payload(rgbPng(16, 16, () => [255, 0, 0])), COLS, ROWS)) + grid(ID, COLS, ROWS), shots: 1, gap: 0 },
        { bytes: loud(transmit(ID, payload(rgbPng(16, 16, () => [0, 255, 0])), COLS, ROWS)), shots: 1, gap: 0 },
        { bytes: loud(transmit(SPARE, payload(rgbPng(16, 16, () => [0, 0, 255])), COLS, 4)), shots: 1, gap: 0 },
        { bytes: grid(SPARE, COLS, 4), shots: 1, gap: 0 },
      ]);
      const at = (step: number): Ink => inks[step]?.[0] ?? { red: -1, green: -1, blue: -1 };

      // **The reader's control**, in every window: a terminal that answered
      // nothing and a capture that read nothing are the same zero.
      for (const [i, r] of replies.entries()) {
        expect(r, `read window ${String(i)} answered DA1`).toContain("[?62;");
      }
      expect(replies[0], "the first transmission is accepted").toContain(`_Gi=${String(ID)};OK`);
      expect(replies[1], "and so is a second at the same id").toContain(`_Gi=${String(ID)};OK`);
      expect(replies[2], "and one whose placement is never written").toContain(`_Gi=${String(SPARE)};OK`);

      // 1 — the placement draws, and it is not empty.
      expect(at(0).red, "the red picture drew").toBeGreaterThan(1000);
      expect(at(0).green).toBe(0);

      // 2 — `a=T` at the same id, no cell rewritten, and the screen follows at
      // the same pixel count: the same cells, a different picture.
      expect(at(1).green, "the same cells now carry the green picture").toBe(at(0).red);
      expect(at(1).red, "and none of the red survives").toBe(0);

      // 3 — a transmission no placeholder addresses draws nothing.
      expect(at(2), "the screen did not move").toEqual(at(1));

      // 4 — and it was resident all along: the grid alone brings it up, with no
      // retransmission. This is the cost C09 I67 stopped paying (§8b G14).
      expect(at(3).blue, "the unaddressed picture was held and is drawn now").toBeGreaterThan(1000);
      expect(at(3).green, "beside the one already on screen").toBe(at(1).green);
    },
    180_000,
  );

  it.skipIf(missing !== null)(
    `T5.5b (C09 I39): \`v=1\` on \`a=a\` loops, and a later \`a=T\` at the id discards the frames the \`a=f\`s uploaded${skipReason}`,
    async () => {
      // **The shipped bytes, unchanged** — `transmitAnimation` and
      // `transmitRgba` carry `q=2` and are sent as they are written.
      const anim = transmitAnimation(ID, [solid(255, 0, 0), solid(0, 255, 0)], [500, 500], COLS, ROWS);
      expect(anim, "the shipped animation escape is what is measured").toContain("q=2");
      const { inks } = await drive([
        { bytes: anim + grid(ID, COLS, ROWS), shots: 12, gap: 300 },
        { bytes: transmitRgba(ID, solid(0, 0, 255), COLS, ROWS), shots: 8, gap: 350 },
      ]);
      const loop = inks[0] ?? [];
      const after = inks[1] ?? [];

      // **It loops.** Twelve shots at 300 ms cross a one-second loop six times,
      // so both frames appear repeatedly rather than once. A run that stopped
      // after the first turn would show one change and then a constant.
      expect(loop.filter((s) => s.red > 1000).length, "the red frame is shown more than once").toBeGreaterThan(2);
      expect(loop.filter((s) => s.green > 1000).length, "and so is the green").toBeGreaterThan(2);
      expect(loop.some((s) => s.blue > 0), "no blue is on screen yet").toBe(false);

      // **And `a=T` discards them.** If the frames accumulated, the loop would
      // keep running and red or green would return in one of eight shots over
      // nearly three seconds.
      for (const [i, s] of after.entries()) {
        expect(s.blue, `shot ${String(i)} is the replacement`).toBeGreaterThan(1000);
        expect(s.red + s.green, `shot ${String(i)} keeps none of the animation`).toBe(0);
      }
    },
    180_000,
  );
});
