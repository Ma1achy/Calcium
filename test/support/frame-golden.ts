/**
 * A **composed frame**, as three readings of one session — the corpus
 * `test/golden/` did not have (F163, F738, roadmap 49).
 *
 * Every other golden in the tree renders a *block*: `measurable().renderToLines`
 * takes one block and gives back its lines, and the whole of L4 — the theme's
 * background base, the prompt's window and its elision markers, the selection
 * wash, the chrome rows, the frame's height arithmetic, the cursor sequences and
 * the fact that a frame is written as a **difference** — is below the waterline.
 * Those seven are what `paint.ts`, `frame.ts` and `render-frame.ts` decide, and
 * a snapshot of a block cannot see any of them.
 *
 * **The seam is `buildSession`, not a PTY.** A real `Session` against
 * `fake-terminal.ts` writes the same bytes to the same interface a terminal
 * would receive, with every ambient value injected — the clock is fixed, the
 * filesystem is a map, `cwd` is `/work` — so the frame is deterministic without
 * a build step, which a PTY corpus would need (`npm run golden` does not build,
 * and `npm run e2e` does).
 *
 * **Three readings and not one snapshot**, which is `states.test.ts`'s ruling
 * applied one layer up: a snapshot carrying both the glyphs and the colours
 * moves when either does, and then neither is protected.
 *
 *   - `text`   — the grid, escapes folded away. What is drawn, and where.
 *   - `styles` — one letter per distinct SGR state, plus the legend. This is
 *                the only reading in which the background base and the
 *                selection wash exist at all: both are `48;…m` over cells whose
 *                glyph is a space, and a stripped read calls them blank.
 *   - `writes` — the bytes of the last input's frame, readably. The cursor
 *                sequences and the diff live only here; the fold consumes them.
 *
 * **The grid is the model's, and it is one cell short on a row carrying a
 * zero-width code point.** `screen.ts` indexes by JavaScript character, so
 * `⏺︎ help` (U+25FA U+FE0E) folds to 79 display cells in an 80-column row while
 * the painted bytes are 80. The difference is a trailing space, invisible in a
 * snapshot — and it is why nothing here asserts a row's width. C22 T4.13 does
 * that against the painted bytes, which is where the question can be answered.
 */

import { defaultTheme } from "../../src/presentation/theme/index.js";
import type { ThemeSet } from "../../src/presentation/theme/index.js";
import { fakeStdin } from "./fake-terminal.js";
import { buildSession } from "./session.js";
import { styledScreenFrom, type CellStyle } from "./styled-screen.js";

const ESC = String.fromCharCode(0x1b);

/** Two microtask flushes — what a keystroke's frame takes (C03, C22 §6b). */
export async function settle(): Promise<void> {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

/**
 * The theme set with `name` first.
 *
 * `loadTheme` opens the set's **first key** rather than a literal `"dark"`
 * (C10 I27), so re-keying is how a scene chooses its theme through the same
 * path an app takes. **Derived from `Object.keys(defaultTheme)` at the call
 * site**, never a written list: `high-contrast` shipped and joined no golden
 * because both theme lists in this directory are literals (F163's second
 * instance), and a list is exactly the thing that does not notice a fourth.
 */
export function opening(name: string): ThemeSet {
  const rest = Object.entries(defaultTheme).filter(([k]) => k !== name);
  return Object.freeze({ [name]: defaultTheme[name]!, ...Object.fromEntries(rest) }) as ThemeSet;
}

export type Arm = Readonly<{
  /** A key of `defaultTheme`. */
  theme: string;
  /** The environment C02 detects from. Omitted is a 256-colour UTF-8 terminal. */
  env?: Readonly<Record<string, string>>;
}>;

export type Scene = Readonly<{
  columns: number;
  rows: number;
  /** Bytes into the terminal, in order. The last call is the one `writes` reads. */
  drive: readonly string[];
}>;

export type FrameReading = Readonly<{
  text: string;
  styles: string;
  writes: string;
}>;

/**
 * Build a session, drive it, and read the frame three ways.
 *
 * **`name` and `binary` differ on purpose.** The harness sets both to `prism`,
 * and the header draws them side by side — so a frame built on that fixture is
 * a camera in which exchanging the two fields moves nothing. A fixture whose
 * symmetry hides the transformation under test is not a fixture.
 */
export async function readFrame(scene: Scene, arm: Arm): Promise<FrameReading> {
  const stdin = fakeStdin();
  const size = { columns: scene.columns, rows: scene.rows };
  const built = await buildSession(
    {
      name: "calcium",
      binary: "prism",
      stdin: stdin as never,
      theme: opening(arm.theme),
      ...(arm.env === undefined ? {} : { env: arm.env }),
    },
    size,
  );
  await settle();

  let before = built.stdout.chunks.length;
  for (const bytes of scene.drive) {
    before = built.stdout.chunks.length;
    stdin.emit(bytes);
    await settle();
  }
  await settle();

  const last = built.stdout.chunks.slice(scene.drive.length === 0 ? 0 : before);
  return Object.freeze({
    text: renderText(built.screen().rows, size),
    styles: renderStyles(styledScreenFrom(built.stdout.chunks, size)),
    writes: renderWrites(last, built.stdout.chunks.length),
  });
}

/** The grid, ruled, so a column can be counted rather than estimated. */
export function renderText(rows: readonly string[], size: { columns: number; rows: number }): string {
  const tens = Array.from({ length: size.columns }, (_, i) =>
    (i + 1) % 10 === 0 ? String(((i + 1) / 10) % 10) : " ",
  ).join("");
  const ones = Array.from({ length: size.columns }, (_, i) => String((i + 1) % 10)).join("");
  const n = (i: number): string => String(i).padStart(2, "0");
  return [
    `   ${tens}`,
    `   ${ones}`,
    ...rows.map((r, i) => `${n(i + 1)} ${r}`),
  ].join("\n");
}

const key = (s: CellStyle): string => `${s.fg}/${s.bg}/${s.attrs.join(",")}`;

/**
 * One letter per distinct SGR state, in reading order, with the legend.
 *
 * **`.` is the unstyled cell** and is not in the legend — a frame in which
 * every cell is styled (any theme declaring `background: "surface"`) then has
 * no `.` at all, which is the base's whole signature and is invisible to a
 * stripped read.
 */
export function renderStyles(grid: readonly (readonly { style: CellStyle }[])[]): string {
  const seen = new Map<string, string>();
  const legend: string[] = [];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const letter = (s: CellStyle): string => {
    const k = key(s);
    if (k === "//") return ".";
    const held = seen.get(k);
    if (held !== undefined) return held;
    const next = alphabet[seen.size] ?? "?";
    seen.set(k, next);
    legend.push(
      `${next} = fg ${s.fg === "" ? "—" : s.fg}  bg ${s.bg === "" ? "—" : s.bg}  attrs ${
        s.attrs.length === 0 ? "—" : s.attrs.join(",")
      }`,
    );
    return next;
  };
  const body = grid.map((row) => row.map((c) => letter(c.style)).join("")).join("\n");
  return [body, "", ...legend].join("\n");
}

/**
 * The bytes of one frame, one sequence per line.
 *
 * **The escapes are the subject here, not noise to be stripped**: `ESC[r;cH`
 * is the diff's addressing, `ESC[?25l`/`ESC[?25h` the cursor's hide and show,
 * and `ESC[H` says the frame was written whole. A run of ordinary text is
 * elided to its length so the reading is about structure and the `text`
 * snapshot keeps the content.
 */
export function renderWrites(chunks: readonly string[], total: number): string {
  const seq = new RegExp(`^${ESC}\\[[0-9;?]*[A-Za-z]`, "u");
  const out: string[] = [];
  const joined = chunks.join("");
  let i = 0;
  while (i < joined.length) {
    const rest = joined.slice(i);
    const m = seq.exec(rest);
    if (m !== null) {
      out.push(`ESC${m[0].slice(1)}`);
      i += m[0].length;
      continue;
    }
    if (rest.startsWith("\r\n")) {
      out.push("CRLF");
      i += 2;
      continue;
    }
    let j = i;
    while (j < joined.length && joined[j] !== ESC && !joined.startsWith("\r\n", j)) j += 1;
    const run = joined.slice(i, j);
    const body = run.trimEnd();
    const pad = run.length - body.length;
    out.push(`«${body}»${pad === 0 ? "" : ` +${String(pad)}sp`}`);
    i = j;
  }
  return [`# ${String(chunks.length)} chunk(s) of ${String(total)}`, ...out].join("\n");
}
