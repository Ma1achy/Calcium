/**
 * Composition root. The only place a clock or fs enters.
 *
 * C22 — see spec.
 *
 * **This file is A03 SS1's entire allow-list**, which is why the three ambient
 * reads are gathered at the top and passed down as an `Ambient` record rather
 * than reached for at their point of use. `config.ts` takes the clock as an
 * argument for exactly that reason: widening the list to two files is the
 * smaller diff and the worse one.
 *
 * The two things it must get exactly right are ordering (§3, and `construct.ts`)
 * and shutdown (§8, below).
 */

import { appendFileSync } from "node:fs";
import { access, appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolveConfig, type Ambient, type ResolvedConfig } from "./config.js";
import { constructGraph, type FrameQueries, type Graph } from "./construct.js";
import { CURSOR_HOME as HOME } from "../terminal/escapes.js";
import { drawFallback, tooSmall } from "./fallback.js";
import { usageText } from "./usage.js";
import { compose, type Composed } from "./frame.js";
import { commandRows, cursorFor, paint, FrameError, type PaintDeps } from "./paint.js";
import { renderSequenceToLines } from "../presentation/render-lines.js";
import { focusableRowIds } from "../presentation/table/index.js";
import type { FocusState } from "../presentation/blocks/index.js";
import { contextAt } from "../interaction/completion/index.js";
import { PROMPT_GUTTER } from "./config.js";
import { createIdentityLoop } from "./identity.js";
import {
  SessionStateError,
  type FileSystem,
  type SessionSnapshot,
  type SessionState,
  type StopReason,
  type TuiConfig,
  type TuiInstance,
} from "./types.js";

/**
 * §8 step 4 — the caller's code, per caller.
 *
 * `interrupt` is 130 and `signal` 143 because C01 §Signals is 128 + signal per
 * signal, not one code for all three: a fixed 130 tells a supervisor the user
 * pressed Ctrl-C when the supervisor is what killed the process, which is the
 * one question an exit code exists to answer.
 */
const EXIT_CODES: Readonly<Record<StopReason, number>> = Object.freeze({
  exit: 0,
  eof: 0,
  interrupt: 130,
  signal: 143,
  fault: 1,
});

/**
 * The real filesystem. `node:fs` at the boundary, and C22 is the boundary
 * (A04 §2) — no scan forbids it here and every layer below is forbidden it.
 */
const nodeFileSystem: FileSystem = {
  readFile: (path) => readFile(path, "utf8"),
  writeFile: (path, data) => writeFile(path, data, "utf8"),
  appendFile: (path, data) => appendFile(path, data, "utf8"),
  appendFileSync: (path, data) => appendFileSync(path, data, "utf8"),
  mkdir: async (path) => void (await mkdir(path, { recursive: true })),
  readDir: async (path) =>
    (await readdir(path, { withFileTypes: true })).map((e) => ({
      name: e.name,
      directory: e.isDirectory(),
    })),
  exists: (path) =>
    access(path).then(
      () => true,
      () => false,
    ),
};

/** The ambient reads, in the one file allowed to perform them. */
function ambient(): Ambient {
  return {
    clock: () => Date.now(),
    cwd: process.cwd(),
    fs: nodeFileSystem,
    schedule: (fn, ms) => {
      const t = setTimeout(fn, ms);
      return { [Symbol.dispose]: () => void clearTimeout(t) };
    },
    platform: process.platform,
  };
}

export function createTui(config: TuiConfig): TuiInstance {
  // **Step 1, and nothing else** (I7a). Validation needs nothing constructed
  // and a bad config should fail at the call site; steps 2 to 11 run inside
  // `start()`, because step 3 may read a manifest from a path and a constructor
  // cannot await.
  return new Session(resolveConfig(config, ambient()));
}

class Session implements TuiInstance {
  #state: SessionState = "created";
  #graph: Graph | null = null;
  #identity: ReturnType<typeof createIdentityLoop> | null = null;
  /** §8's idempotency. `stop` twice is a no-op, not a second release (T1.10). */
  #stopping: Promise<number> | null = null;

  constructor(private readonly config: ResolvedConfig) {}

  get session(): SessionSnapshot {
    return this.#graph?.session.snapshot ?? emptySnapshot(this.config);
  }

  async start(): Promise<void> {
    // §9's two illegal cells. `stopped` is terminal, matching C01's released
    // state — a second session constructs a new instance (I16).
    if (this.#state === "stopped") throw new SessionStateError("start", this.#state);
    if (this.#state === "running") return; // T3.2 — nothing constructed twice.

    // **Gate 1** (§4 step 1, I36, I37) — above `constructGraph`, and that is the
    // ruling rather than the ordering that fell out.
    //
    // Gate 4 defers: the graph is built, the fallback is drawn, and a resize
    // continues from step 5 with session state intact (I8), because a terminal
    // too small can become big enough while the session waits. **A pipe cannot
    // become a terminal.** There is no event to wait for and nothing a
    // constructed graph could do — it would open a history file and start an
    // identity loop for a process about to exit.
    //
    // The state goes to `stopped` rather than staying `created`: this session is
    // over, and `stopped` is terminal (I16), so a caller that retries constructs
    // a new instance instead of finding a half-started one.
    if (this.config.stdout.isTTY !== true) {
      this.config.stdout.write(usageText(this.config.name, this.config.binary));
      this.#state = "stopped";
      return;
    }

    this.#graph = await constructGraph(this.config, {
      stop: (reason) => this.stop(reason),
      render: () => this.#render(),
      repaint: () => this.#render(),
      frame: this.#frameQueries(),
      onFatal: (err) => {
        // C01's only fatal case, and it has already unwound what it held
        // (C01 §3). Nothing runs after this.
        throw err;
      },
    });

    this.#state = "running";

    // **Gate 4 defers rather than aborts** (I8). The graph is built, the
    // fallback is drawn on the *primary* screen — nothing was acquired, so
    // there is no alternate screen to draw into — and a resize continues from
    // startup step 5 with session state intact.
    const size = this.#graph.lifecycle.size();
    if (tooSmall(size)) {
      drawFallback(size, (s) => void this.config.stdout.write(s));
      this.#graph.lifecycle.onResize((next) => {
        if (!tooSmall(next)) this.#open();
      });
      return;
    }

    this.#open();
  }

  /** Startup steps 5 to 8, reached at launch or after a resize (I8). */
  #open(): void {
    const graph = this.#graph;
    if (graph === null || graph.lifecycle.acquired) return;

    graph.lifecycle.acquire();
    graph.scheduler.commit("input");

    /**
     * Step 7's other half — the session's first entry (I44).
     *
     * **The step named this and nothing did it.** §4 has said *fire banner
     * fetches, non-blocking* since this document was written; S02 specifies the
     * entry in detail and cites the step; C22's own T3.10 and T3.11 test it and
     * were never written, because there was nothing to write them against. It is
     * step 12's shape a second time in the same list — a step is a name until
     * something calls it, and the list does not distinguish the two.
     *
     * **Not awaited, and the `void` is the invariant rather than a style.** A
     * greeting that hangs must leave the prompt usable, so nothing below waits
     * on it and `#open()` returns while it is still in flight. A rejection is
     * caught and dropped: the session continues and no entry appears, which is
     * T3.10 and T3.11.
     *
     * C23 appends it (A02 Seam 4), so a `b.live` part inside it is driven
     * exactly as any other document's is (C23 I33a), and `/clear` removes it.
     */
    const greeting = this.config.greeting;
    if (greeting !== undefined) {
      void (async () => {
        try {
          graph.pipeline.greeting(await greeting());
        } catch {
          // Contained. The prompt is already usable and the session is running;
          // a welcome that could not reach its far side is not a startup fault.
        }
      })();
    }

    // Step 7, non-blocking: input is accepted whatever this does, and neither
    // it nor the first frame waits on a fetch (I18). `start()` never awaits it.
    //
    // The fetcher is a stub until the app supplies one — C22 §7 owns the
    // cadence and the state, and the auth flow itself is the far side's (§13).
    this.#identity = createIdentityLoop({
      fetch: this.config.identity,
      // **The second producer of C22 I31's class.** This loop settles on a
      // five-minute cadence with no keystroke anywhere near it, and both fields
      // it writes are drawn in the header — so without the commit the header
      // shows an identity that expired minutes ago until the user happens to
      // press a key. `refresh` is passed through rather than replaced, so the
      // one-writer-per-field rule (I11) still has one writer.
      writes: {
        setIdentity: (identity) => {
          graph.session.refresh.setIdentity(identity);
          graph.scheduler.commit("completion");
        },
        setHealth: (health) => {
          graph.session.refresh.setHealth(health);
          graph.scheduler.commit("completion");
        },
      },
      now: this.config.clock,
      /**
       * **C22 signals, C23 appends** (C23 §3b, I19) — and until now C22 signalled
       * into a function that discarded it.
       *
       * `notify: () => undefined` meant the one §3b mechanism described as
       * working reached nothing: `expiryNotice` composed its text, `warned`
       * flipped so it would never compose it again, and the notice was dropped.
       * A token inside a day of expiry said so to nobody, once per session.
       *
       * `Pipeline.identityNotice` was built, exported and reached only by its own
       * unit tests — a producer complete with nothing on the other side, which is
       * the class MG24 and MG25 exist for, arriving through a default argument
       * rather than through an unexported member.
       */
      notify: (text) => void this.#graph?.pipeline.identityNotice(text),
      // The ambient one, not a second copy. C06's `Clock` needs the same, and
      // two inlined `setTimeout`s is the duplication SP4 is about, in code.
      schedule: this.config.schedule,
    });
    this.#identity.start();
  }

  /**
   * §8 — four steps, and **three of the five callers** (I4).
   *
   * `signal` and `fault` do not arrive here. They are C01's: `signalExit` and
   * `fault` release, write diagnostics and `process.exit` inside the handler,
   * and C01 exposes no signal hook. **The function all five share is
   * `beforeRelease`**, wired at construction step 7, which is what makes
   * cleanup once-only on every path rather than on the three that reach this.
   *
   * `session.stopping` is therefore unset on those two, and that is safe for
   * one reason only: `process.exit` runs synchronously inside the handler, so
   * no submission can interleave (I4a). Nothing here may become the thing that
   * makes either path asynchronous.
   */
  stop(reason: StopReason): Promise<number> {
    this.#stopping ??= this.#runStop(reason);
    return this.#stopping;
  }

  #runStop(reason: StopReason): Promise<number> {
    const code = EXIT_CODES[reason];
    const graph = this.#graph;

    // T1.9, T3.15 — nothing acquired, no cleanup, and **no flag says so**:
    // there is no lifecycle to release, because construction never reached
    // step 7. The absence is structural rather than recorded (§8a).
    if (graph === null) {
      this.#state = "stopped";
      return Promise.resolve(code);
    }

    // 1 — C23 refuses further submissions. Before the release, so a submission
    // racing shutdown loses the race (T3.19).
    graph.session.beginStopping();
    this.#identity?.stop();
    // **Here, not in `beforeRelease`** (C23 I12). The flag `beginStopping` sets
    // is read at the top of a tick and cannot see a `fetch` already in flight;
    // stopping the timers alongside it is what makes the promise hold. Same
    // ordering argument as `killAll()` before `history.drain()` at step 2a.
    graph.pipeline.dispose();

    // 2 — release, which runs `beforeRelease` (the cleanup) and then restores
    // the terminal. C01's own guard makes the cleanup once-only.
    graph.lifecycle.release();

    // 3 — diagnostics, **only now**, on the restored primary screen. A stack
    // printed onto the alternate screen is discarded when the screen is
    // released, so the dev sees a flash and an empty shell (I6). C02's warnings
    // wait here for the same reason (C02 §2).
    for (const line of graph.capabilityWarnings) this.config.stdout.write(`${line}\n`);

    // 4 — the caller's code, returned rather than exited: the caller owns the
    // process, and a library that calls `process.exit` cannot be embedded.
    this.#state = "stopped";
    return Promise.resolve(code);
  }

  /**
   * One frame: compose, paint, write.
   *
   * **The size is read once, by `compose`, and `paint` reads no stream at all.**
   * A resize arriving between the two is the next frame's problem, which is
   * correct — C03 sets `contaminated` eagerly at commit time, so the next frame
   * is a full repaint. A frame composed at two widths is coherent at neither
   * (`docs/notes/resize-and-compositor.md`).
   *
   * A frame that cannot be composed coherently draws the fallback rather than
   * a short frame: `paint` refuses, and one row too few leaves the previous
   * frame showing through while one too many scrolls the alternate screen.
   */
  #render(): void {
    const graph = this.#graph;
    if (graph === null || !graph.lifecycle.acquired) return;

    const frame = this.#composed();

    // **C22 I34 — the viewport is as tall as the region, and this is where the
    // region's height is known.** It is `rows − header − footer − promptRows`,
    // and the prompt's height changes with what is typed rather than with the
    // terminal, so no handler on a terminal event can compute it. Set from the
    // composed frame, before the visible rows are read from it.
    //
    // Per frame, and cheap because C14 refuses a resize to the size it holds
    // (C14 I21) — the guard is what makes one owner affordable.
    //
    // It was `size.rows` in the resize handler: three rows too tall from the
    // first frame, so `#maxTop()` stopped short by exactly the chrome and the
    // last rows of a tall entry were unreachable by `End`, `PageDown` or `↓`.
    // Nothing could see it, because the surplus rows were discarded below.
    graph.viewport.resize({ width: frame.size.columns, height: frame.region.height });

    let lines: readonly string[];
    try {
      lines = paint(frame, this.#paintDeps(graph, frame));
    } catch (err) {
      if (!(err instanceof FrameError)) throw err;
      drawFallback(frame.size, (s) => void graph.lifecycle.writer.write(s));
      return;
    }

    // **Hide, move, show — and the order is not made moot by the sync window**
    // (C15 I19). `synchronisedUpdate` is a capability, so the unwrapped path is
    // real: on a terminal without DECSET 2026 a visible cursor is dragged
    // across the frame by `HOME` and every row after it, which is a cursor
    // racing over the screen sixty times a second. So the hide leads the write
    // and the position and show close it, all inside one `write` — one string,
    // so it cannot straddle the scheduler's window either.
    // **The sequence is C01's** (C01 I19, MG20). The cursor's visibility is a
    // mode C01 holds and restores at release, so this file may not write it —
    // and the bytes still have to land inside the one `write`, because a
    // separate call cannot be kept inside C03's synchronised-update window. The
    // owner yields them; the frame embeds them.
    const cursor = cursorFor(frame, this.#paintDeps(graph, frame));
    const hide = graph.lifecycle.cursorSequence(null);
    graph.lifecycle.writer.write(
      `${hide}${HOME}${lines.join("\r\n")}${graph.lifecycle.cursorSequence(cursor)}`,
    );
  }

  #paintDeps(graph: Graph, frame: Composed): PaintDeps {
    const width = frame.size.columns;
    return {
      registry: graph.blocks,
      theme: graph.theme.current,
      capabilities: graph.capabilities,
      // C14 selected these at this width; the paint pads them and never
      // re-measures (C09 I1 — one implementation, or the two answers drift).
      // **Both take the frame's width from the frame**, not from a fresh
      // `size()`. A closure that re-read it is exactly the two-width frame the
      // note names, arriving through the one seam that looks harmless.
      transcriptRows: () => visibleRows(graph, width),
      promptRows: () => graph.editor.layout(width, PROMPT_GUTTER),
      promptCursor: () => graph.editor.cursorCell(width, PROMPT_GUTTER),
      // C16's derived focus, read rather than stored — the cursor belongs to
      // whatever holds the keys, and a second record of that would drift from
      // the display exactly as a stored focus does (C16 §3, C15 I19).
      promptFocused: () =>
        graph.router.target === "prompt" || graph.promptUnderMenu(),
      // **Fresh on every paint, and that is the invariant rather than a style**
      // (C22 I38). `spinning` changes with the clock, not with the frame, so a
      // value captured when the request started can never become true — and
      // that wrong implementation looks exactly like a correct read of a source
      // that answered quickly. The other half is the wake `keys.ts` arms: this
      // read is what a frame *shows*, and the wake is what causes a frame to
      // exist 500 ms after a `Tab` that nothing else would have drawn.
      spinning: () => graph.completion.spinning,
      // **Fresh at paint, like the spinner, and for the same reason** (C22
      // I50). The suggestion changes with what is typed, so a value captured
      // when it was computed shows one for a prefix the user has moved past.
      //
      // It had no reader at all before this: `ghost()` was called once in the
      // tree, on the accept path, which *inserts* it. C22 T4.7 has claimed the
      // compositing since C22 was written and `test/contract/editor.test.ts`
      // recorded the other half as deferred "when C22 lands".
      ghost: () =>
        graph.completion.ghost(
          contextAt(graph.editor.text, graph.editor.cursor, graph.manifest.manifest),
        ),
      // **The region comes from the frame, not from a fresh one** (C22 I28).
      // `#frameQueries` serves the same value to the router, and a second
      // computation here is the two-records defect S01 §3 already produced once
      // — with the added property that the router would then be hit-testing
      // against boxes the screen never drew.
      overlays: () => graph.overlays.layout(frame.overlayRegion),
    };
  }

  #frameQueries(): FrameQueries {
    return {
      copyMode: () => false,
      exitCopyMode: () => undefined,
      entryAtRow: () => null,
      region: () => this.#composed().region,
      overlayRegion: () => this.#composed().overlayRegion,
      // From the composed frame, both numbers: the prompt starts where the
      // transcript ends, and its height is the one the frame reserved. A fresh
      // computation here is the two-records defect the same frame already had
      // once (S01 §3).
      //
      // **A region row, not a terminal row** (C22 I28, S01 §3a). C15 places
      // against the viewport region, so the anchor is `region.height` — one row
      // past the region's bottom edge, because the prompt is not in the
      // viewport. A menu preferring `above` then takes the region's last rows,
      // directly above the line it was raised from. This is the one conversion
      // where the two coordinate systems differ by exactly the header's height,
      // and an off-by-one here is a menu overlapping that line.
      promptAnchor: () => {
        const f = this.#composed();
        return { row: f.region.height, rows: f.promptRows };
      },
      mouseEnabled: () => this.#graph?.capabilities.mouse ?? false,
      // Ctrl-C and Ctrl-D raise a confirm; answering it is what stops.
      //
      // **The same `ask` a local handler gets** (C23 I36). The session's own
      // question is not a special case, and giving it a private confirm would be
      // two renderings of one thing — with the session's being the one nobody
      // looks at and therefore the one that rots. This rung raised no question at
      // all until now: it called `stop` directly, which was the behaviour minus
      // the question.
      //
      // `stay` is the default, so `Esc` and a second `⌃c` both leave the session
      // running (C23 I36). That is the safe answer, and the arming machine above
      // has already required two presses to get here.
      raiseExitConfirm: () => {
        const graph = this.#graph;
        // The rung can fire before the graph exists only in a harness, and
        // answering nothing is right there: no session, nothing to exit.
        if (graph === null || graph === undefined) return;
        // Not awaited: `dispatch` is synchronous and the question outlives the
        // keystroke that raised it. The promise is the answer's path, not this
        // rung's.
        void graph.confirm
          .ask({
            question: "Exit the session?",
            choices: [
              { key: "y", label: "exit" },
              { key: "n", label: "stay", default: true },
            ],
          })
          .then((answer) => {
            if (answer === "y") void this.stop("eof");
          });
      },
    };
  }

  #composed(): Composed {
    const graph = this.#graph;
    return compose({
      chrome: this.config.chrome,
      session: () => graph?.session.snapshot ?? emptySnapshot(this.config),
      now: this.config.clock,
      size: () => graph?.lifecycle.size() ?? { columns: 80, rows: 24 },
      // **The same number the paint path reads** (S01 §3, commitment 4 and 13).
      // A constant here made the frame reserve one row while `#paintDeps` handed
      // `paint` the editor's real rows: `promptRegion` then windowed them to a
      // cap of one, and a wrapped prompt drew as a single elision marker with
      // the command invisible. `heightsSum` cannot see it — it checks the
      // composed frame against itself, and 1 + 1 + region + 1 is consistent at
      // every width. Two records of one number, and T1.5c is the only thing
      // comparing them.
      promptRows: (width, gutter) => graph?.editor.layout(width, gutter).length ?? 1,
    });
  }
}

/**
 * The visible transcript, as rows, at the frame's width.
 *
 * C14 chose the range and the `skipRows`/`takeRows` slice; this renders exactly
 * that slice through C09 and never re-measures. Re-measuring here is C09 I1's
 * divergence in the place that moves the whole frame — the two would agree on
 * ordinary output and part company at a wrap boundary.
 */
function visibleRows(graph: Graph, width: number): readonly string[] {
  const out: string[] = [];
  for (const ve of graph.viewport.visible().entries) {
    const entry = graph.transcript.entries.find((e) => e.id === ve.id);
    if (entry === undefined) continue;
    // C22 I33 — the command that produced the entry, above it, as chrome. Its
    // rows are part of the entry's height (C14 I20), which is why the slice
    // below is taken over `chrome ++ blocks` rather than over the blocks alone.
    const chrome = commandRows(entry.doc.command, width);
    const lines = renderSequenceToLines(graph.blocks, entry.doc.blocks, width, {
      theme: graph.theme.current,
      capabilities: graph.capabilities,
      // **The third field, and the context was shipped with two** (C16 §3).
      // Focus was stored, derived and routed, and a focused row rendered
      // exactly like an unfocused one because nothing ever put it in the
      // context C09 reads it from. Every reference existed and the seam was
      // still broken — a partially-populated context, which counting
      // references cannot see.
      focus: focusFor(graph, entry.id),
    });
    const rows = [...chrome, ...lines];
    out.push(...rows.slice(ve.skipRows, ve.skipRows + ve.takeRows));
  }
  return out;
}

/**
 * C09's `FocusState` for an entry, derived from C16's stored focus and C13's
 * `liveId` — which is the sentence C16 §3 writes and nothing implemented.
 *
 * Only the live entry can hold focus, and only a block that owns the focused
 * row is told about it: `blockId` is what C11 compares against before it
 * highlights anything (C11 I14). Focus is a **tone** there and nothing else —
 * no marker, no extra row, no width — so this changes no measured height, and a
 * height that moved would be a defect in C11 rather than in this line.
 */
function focusFor(graph: Graph, entryId: string): FocusState | null {
  const stored = graph.focus.current;
  if (stored.at !== "liveBlock") return null;
  if (graph.transcript.liveId !== entryId) return null;

  const entry = graph.transcript.entries.find((e) => e.id === entryId);
  if (entry === undefined) return null;

  for (const block of entry.doc.blocks) {
    if (block.kind !== "table") continue;
    if (stored.rowId === null || focusableRowIds(block).includes(stored.rowId)) {
      return Object.freeze({ blockId: block.id, rowId: stored.rowId });
    }
  }
  return null;
}

/** What `session` reads before the graph exists — §9's `created` state. */
function emptySnapshot(config: ResolvedConfig): SessionSnapshot {
  return Object.freeze({
    cwd: config.cwd,
    env: Object.freeze({}),
    lastUuid: null,
    identity: null,
    cluster: config.cluster,
    health: "live" as const,
    version: config.version,
    retained: null,
    stopping: false,
  });
}
