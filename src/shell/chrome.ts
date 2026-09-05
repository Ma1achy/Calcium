/**
 * C22 §6 — the default header and footer, and the prompt's gutter.
 *
 * Calcium owns the frame's structure — a one-row header, two rules around the
 * prompt, and a footer as tall as its blocks (§6l) — and the app decides what
 * goes in the header and the footer. The default exists so that
 * `createTui({ name, binary, manifest, theme })` produces a usable shell (I17):
 * a framework that required chrome to render anything would make the four-field
 * claim false.
 *
 * **Both functions take the frame's `now`** rather than reading one (I13a). A
 * header and a footer that each read the clock can straddle a second boundary
 * and print two different times in one frame, which is C01 I12's rule arriving
 * one layer up — and A03 SS1 would refuse the read here in any case.
 */

import { block } from "../data/viewmodel/index.js";
import type { Block, Pills } from "../data/viewmodel/index.js";
import { cells } from "../presentation/text.js";
import type { ChromeContext, ChromeFn } from "./types.js";

type Chip = Pills["chips"][number];

/** C09's gap between chips — `CHIP_GAP` in `simple.ts`, asserted equal by T1.46 rather than imported. */
const CHIP_GAP = 2;

/**
 * The width a `pills` cluster takes, as C09's `pills` measures it (C22 I86).
 *
 * **A figure the registry could answer and chrome cannot ask it.** A `ChromeFn`
 * returns blocks and holds no registry, and the right cluster's share is a
 * `{ cells }` the group needs before anything renders — so the arithmetic is
 * here, and T1.46 holds it to `registry.width(pills)` at every width tried,
 * which is the coupling made an assertion rather than a comment.
 */
export function clusterCells(chips: readonly Chip[]): number {
  let used = 0;
  chips.forEach((chip, i) => {
    used += cells(chip.label) + (i > 0 ? CHIP_GAP : 0); // narrow-ok — held to C09's own `width` by T1.46, which renders under the same convention
  });
  return Math.max(1, used);
}

/**
 * Two clusters on one row (C22 I86, §6l.6 row 20): the left takes the remainder,
 * the right a cell exactly its own content width, so it ends the row — facts that name
 * the session at the left, facts that change at the right, where a reader
 * glancing down finds them. The design's frame, and the second consumer of C04's
 * both axes (C04 §3) after the group tests themselves.
 */
function clusters(id: string, left: readonly Chip[], right: readonly Chip[]): Block {
  return block<Block>({
    kind: "group",
    id,
    direction: "row",
    children: [
      block<Block>({ kind: "pills", id: `${id}.left`, chips: left }),
      block<Block>({ kind: "pills", id: `${id}.right`, chips: right }),
    ],
    // **The cell's width is the whole mechanism.** An `align: top-right` sat
    // beside it and a mutation of either survived on the other (F822); a cell
    // exactly its content's width has nothing to align.
    flex: [1, { cells: clusterCells(right) }],
  });
}

/** §4's clock format, and S01 §4's narrow form. `14:23:07`, then `14:23`. */
export function formatClock(now: number, columns: number): string {
  // From the epoch value directly rather than through a `Date`: SS1 bans the
  // constructor across `src/`, and the arithmetic is four lines. UTC, because a
  // local-time conversion is what needs the platform's zone database.
  const total = Math.floor(now / 1000);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const hh = pad(Math.floor(total / 3600) % 24);
  const mm = pad(Math.floor(total / 60) % 60);
  const ss = pad(total % 60);
  return columns >= 80 ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

const header =
  (name: string, binary: string): ChromeFn =>
  (ctx: ChromeContext): readonly Block[] => [
    clusters(
      "chrome.header",
      [
        { label: name },
        { label: binary, tone: "muted" },
        // **Not optional, and not a footer hint.** Copy mode is the one mode
        // whose whole effect is that things stop responding — the mouse goes
        // dead and the screen stops moving — so a reader with nothing on screen
        // saying why has been handed a bug rather than a feature. It sits in
        // the header because the header is the row that is always drawn, and in
        // the left cluster because it is a fact about the session's posture.
        ...(ctx.copyMode ? [{ label: "COPY", tone: "warn" as const }] : []),
      ],
      // The clock is the right cluster on its own: it is the fact that changes,
      // and its last cell is the frame's last column (I86).
      [{ label: formatClock(ctx.now, ctx.columns), tone: "muted" }],
    ),
  ];

/**
 * The working directory with the home directory folded to `~` — the shape every
 * shell prompt uses, so a reader recognises it without a label.
 *
 * `home` comes from the session's own snapshot of the environment, never from
 * `process.env` (A03 SS1): the shell is the one place that read it.
 */
export function foldHome(cwd: string, home: string | undefined): string {
  if (home === undefined || home === "") return cwd;
  if (cwd === home) return "~";
  return cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
}

/**
 * One muted row (C22 §6l.4 E): `/help`, the working directory, and `stopping`
 * while the session says so — every one a field `SessionSnapshot` already
 * carries, so the footer adds no writer.
 *
 * **Verbs and facts, never key names.** A framework-supplied footer of
 * keybindings would be wrong the moment an app rebinds anything, and a key
 * named in chrome is C16 I19's second keymap. `/help` is a verb the shell
 * itself answers, so it is right in every app. An app that wants no footer
 * returns `[]` and gets none (I82).
 */
const footer = (ctx: ChromeContext): readonly Block[] => [
  clusters(
    "chrome.footer",
    [
      { label: "/help", tone: "muted" },
      ...(ctx.session.stopping ? [{ label: "stopping", tone: "warn" as const }] : []),
    ],
    [{ label: foldHome(ctx.session.cwd, ctx.session.env["HOME"]), tone: "muted" }],
  ),
];

/**
 * A function of config, not a constant — the default header names the app, so
 * it cannot exist until `name` and `binary` are validated.
 */
export function makeDefaultChrome(
  name: string,
  binary: string,
): Readonly<{ header: ChromeFn; footer: ChromeFn }> {
  return Object.freeze({ header: header(name, binary), footer });
}
