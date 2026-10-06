// Sessions that run something — the application the composed-frame corpus did
// not have (F1445, F1466).
//
// **Every session golden drew one verb.** The harness's manifest declares no
// tools, so `/help` was the only entry a scene could construct, and the
// surfaces a *call* draws — a running head, a failure, a question, an
// inspection, a transcript taller than its region and the bar beside it, a
// chip's preview — were asserted by rows that read numbers and drawn by no
// frame. This is a small application for those scenes to drive: a handful of
// local verbs, one streaming verb that never ends, and nothing else.
//
// **Read by two corpora through one harness.** `session-frame.test.ts` reads
// three of these as grid, styles and bytes; `design-surfaces.ts` draws them
// under the design's section headings, where the figure comparison finds them.
// Both go through `driveScene`, so the two cannot be built differently.
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { RawPatch } from "../../src/data/transport/index.js";
import type { TuiConfig } from "../../src/shell/types.js";
import { ONE_PER_KIND } from "./blocks.js";
import type { Scene } from "./frame-golden.js";

const ESC = String.fromCharCode(0x1b);

/** `⌃c` — cancel the running verb (C16 I62's first rung). */
export const CTRL_C = "\u0003";
/** `⌃r` — the history's reverse search (C20, the `find` substate). */
export const CTRL_R = "\u0012";
/** `→` — ends C16 I44's arrival guard on a question without answering it. */
export const RIGHT = `${ESC}[C`;
/** `⇧⇥` — focus moves from the prompt to the transcript. */
export const SHIFT_TAB = `${ESC}[Z`;
/** `⌃home` — the transcript's top (`R-KEY-005`'s `transcript` scope). */
export const CTRL_HOME = `${ESC}[1;5H`;
/** `pageup` — the transcript a page back (C14). */
export const PAGE_UP = `${ESC}[5~`;
/** The terminal losing and regaining focus (`?1004`), which opens and closes the away mark. */
export const FOCUS_OUT = `${ESC}[O`;
export const FOCUS_IN = `${ESC}[I`;

/** A bracketed paste — what makes a run of lines a chip (C17 I25). */
export const paste = (text: string): string => `${ESC}[200~${text}${ESC}[201~`;

const lines = (n: number, word: string): string =>
  Array.from({ length: n }, (_, i) => `${word} ${String(i + 1)}`).join("\n");

const ok = (blocks: readonly Block[]) => ({ schema: "tui.view/1", status: "ok", blocks });

type Ask = { ask: (o: unknown) => Promise<unknown> };

/** A promise nothing resolves: the verb is in flight for every frame a scene reads. */
const never = new Promise<never>(() => undefined);

const handlers = {
  noise: () => ok([block({ kind: "raw", id: "noise", text: lines(2, "line") })]),
  long: () => ok([block({ kind: "raw", id: "long", text: lines(12, "line") })]),
  boom: () => {
    throw new Error("ENOENT: no such file");
  },
  diff: () => ok([ONE_PER_KIND.patch]),
  list: () => ok([ONE_PER_KIND.table]),
  logs: () => ok([ONE_PER_KIND.logs]),
  image: () => ok([ONE_PER_KIND.image]),
  // C23 I74: choices alone, so the question replaces the prompt.
  ask: (_argv: unknown, ctx: Ask) =>
    ctx
      .ask({
        question: "may I write to package.json?",
        choices: [
          { key: "a", label: "approve" },
          { key: "d", label: "deny", default: true },
        ],
      })
      .then(() => ok([])),
  // C23 I75: a payload taller than the slot, and the inspection choice beside the answers.
  apply: (_argv: unknown, ctx: Ask) =>
    ctx
      .ask({
        question: "Apply this change?",
        detail: block({ kind: "raw", id: "payload", text: lines(30, "patch line") }),
        choices: [
          { key: "n", label: "no", default: true },
          { key: "y", label: "yes" },
          { key: "s", label: "show full diff", inspect: true },
        ],
      })
      .then(() => ok([])),
  // C23 I73: a reply choice, so choosing it floats the question over a live prompt.
  reply: (_argv: unknown, ctx: Ask) =>
    ctx
      .ask({
        question: "What should the commit message say?",
        choices: [
          { key: "n", label: "no", default: true },
          { key: "y", label: "yes" },
          { key: "r", label: "reply…", reply: true },
        ],
      })
      .then(() => ok([])),
};

const tool = (name: string, extra: object = {}) => ({ name, summary: name, args: [], flags: [], local: true, ...extra });

/**
 * The application: the local verbs above; `build`, which streams one progress
 * block and never ends — the running call a frame can be read during; and
 * `slow`, an invoke-route verb whose answer never comes.
 *
 * **`slow` is a transport verb and not a local one, and that is a finding.** A
 * local handler that never settles was the first draft of §009's scene, and the
 * frame drew two `queued behind wait` notices under **no** `wait`: the local
 * route appends nothing until its handler resolves (`execution.ts`, `runLocal`),
 * so a slow local verb holds the guard with nothing on screen saying so. The
 * invoke route appends its pending card first (C23 I3), which is the running
 * head a queue is read against.
 */
export const APP: Partial<TuiConfig> = {
  manifest: {
    schema: "tui.manifest/1",
    binary: "prism",
    version: "1.0.0",
    tools: [
      ...Object.keys(handlers).map((name) => tool(name)),
      tool("build", { local: false, streams: true }),
      tool("slow", { local: false }),
    ],
  },
  localHandlers: handlers as never,
  transport: {
    for: () => ({
      invoke: () => never,
      stream: () =>
        (async function* (): AsyncGenerator<RawPatch> {
          yield {
            kind: "data",
            value: { op: "append", block: { kind: "progress", id: "bar", label: "build", current: 40, total: 100 } },
          };
          await never;
        })(),
    }),
    busy: false,
    inFlight: null,
  } as never,
  adapters: {
    build: {
      schema: "tui.view/1",
      adapt: () => ok([]),
      adaptPatch: (p: RawPatch) => (p.kind === "data" ? p.value : null),
    },
  } as never,
};

/** A terminal that reports focus — the away mark needs `?1004h` taken (C23 I85). */
const FOCUS_ENV = { TERM: "xterm-256color", LANG: "C.UTF-8", TERM_PROGRAM: "WezTerm", CALCIUM_NOTIFY: "bell" };

/** A scene over this application, at a size and with the settles a question needs. */
const scene = (drive: readonly string[], over: Partial<Scene> = {}): Scene => ({
  columns: 80,
  rows: 24,
  drive,
  config: APP,
  // Four: a stream's first patch and a question's layer are each a few turns
  // of the loop behind the byte that started them, and two left `build`'s
  // block undrawn under §003's heading.
  rounds: 4,
  ...over,
});

/**
 * The scenes, by name. **Each names what it constructs**, because a scene whose
 * subject is not on screen is a frame of something else (§069's lesson).
 */
export const SCENES = {
  /** A finished call above a running one: the head's spinner and the stream's block. */
  running: scene(["/noise\r", "/build\r"]),
  /** Nothing in flight — every head settled. */
  idle: scene(["/noise\r"]),
  /** A running call cancelled with `⌃c`: the head says so and the block stays. */
  cancelled: scene(["/build\r", CTRL_C]),
  /**
   * Two lines typed while a verb holds the guard: each is queued, visibly, and
   * runs in order when the guard is released (C23 I5, roadmap 33). A `streams`
   * verb would not do — it releases the guard (C23 I6), so a line typed under
   * `build` runs at once.
   */
  queued: scene(["/slow\r", "/noise\r", "/noise again\r"]),
  /** A local verb that fails: the head's `failed` and the contained status. */
  failed: scene(["/noise\r", "/boom\r"]),
  /** The frame a session opens with. */
  boot: scene([]),
  /** The terminal lost focus while two verbs settled, then got it back (C23 I85–I87). */
  away: scene(["/noise\r", FOCUS_OUT, "/noise\r", "/boom\r", FOCUS_IN], {
    config: { ...APP, env: FOCUS_ENV },
  }),
  /** Two commands and what each produced — the transcript as a conversation. */
  conversation: scene(["/noise\r", "/noise again\r"]),
  /** An entry copied from the transcript: `⇧⇥` to the transcript, `y` to copy. */
  copied: scene(["/noise\r", SHIFT_TAB, "y"]),
  /** The upper rule labelled by the application's chrome (§069), the frame otherwise bare. */
  labelled: scene([], { chrome: { header: () => [], footer: () => [], label: () => "Calcium" } }),
  /**
   * The help listing as an entry, read from its head: it is taller than the
   * region, so the frame after the command is its tail. `⇧⇥` to the transcript
   * and `⌃home` to its top put the head and the first scope on screen.
   */
  help: scene(["/help keys\r", SHIFT_TAB, CTRL_HOME]),
  /** The completion menu over the prompt. */
  menu: scene(["/noise\r", "/"]),
  /** The reverse search open over a transcript taller than its region. */
  search: scene(["/noise\r", "/long\r", "/noise again\r", CTRL_R, "no"]),
  /** The same search stepped once to an older hit. */
  searchOlder: scene(["/noise\r", "/long\r", "/noise again\r", CTRL_R, "no", CTRL_R]),
  /** An approval replacing the prompt, its arrival guard ended. */
  approval: scene(["/noise\r", "/ask\r", RIGHT]),
  /** The inspection: an approval whose payload does not fit, and `s` to see it (C23 I75, I88). */
  inspection: scene(["/apply\r", RIGHT, "s"]),
  /** A question taking a typed reply: the question floats and the prompt is live (C23 I73). */
  reply: scene(["/reply\r", RIGHT, "r", "fix the parser"]),
  /** A chip under the caret, and its preview above the prompt (C22 I113, §101). */
  chip: scene([paste(lines(30, "row"))]),
  /**
   * A page back in a transcript taller than its region, while a call runs —
   * the transcript's bar in the margin column (C14 I62).
   */
  scrolled: scene(["/long\r", "/long\r", "/build\r", PAGE_UP]),
  /**
   * The same page back with nothing running — `scrolled` without its `build`,
   * for `session-frame.test.ts`, which reads the bytes of the last input and
   * cannot have a stream's patch landing on a timer somewhere among them.
   */
  scrolledIdle: scene(["/long\r", "/long\r", PAGE_UP]),
  /** Two results the gallery draws as entries — a table and a log. */
  gallery: scene(["/list\r", "/logs\r"]),
  /** A patch as a call's result — what review reads. */
  review: scene(["/diff\r"]),
  /** A session at 80 columns, resized to 60 — the narrowest a session draws. */
  resize: scene(["/noise\r", "/long\r"]),
  /** Below the minimum: the session draws only the notice saying what it needs. */
  tooSmall: scene([], { columns: 34, rows: 8 }),
} satisfies Record<string, Scene>;
