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
import type { Block } from "../data/viewmodel/index.js";
import type { ChromeContext, ChromeFn } from "./types.js";

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
    block<Block>({
      kind: "pills",
      id: "chrome.header",
      chips: [
        { label: name },
        { label: binary, tone: "muted" },
        // **Not optional, and not a footer hint.** Copy mode is the one mode
        // whose whole effect is that things stop responding — the mouse goes
        // dead and the screen stops moving — so a reader with nothing on screen
        // saying why has been handed a bug rather than a feature. It sits in
        // the header because the header is the row that is always drawn.
        //
        // Ahead of the clock, so it does not move when the clock narrows at
        // 80 columns (§4's two formats).
        ...(ctx.copyMode ? [{ label: "COPY", tone: "warn" as const }] : []),
        { label: formatClock(ctx.now, ctx.columns), tone: "muted" },
      ],
    }),
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
  block<Block>({
    kind: "pills",
    id: "chrome.footer",
    chips: [
      { label: "/help", tone: "muted" },
      { label: foldHome(ctx.session.cwd, ctx.session.env["HOME"]), tone: "muted" },
      ...(ctx.session.stopping ? [{ label: "stopping", tone: "warn" as const }] : []),
    ],
  }),
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
