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
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { resolveConfig, type Ambient, type ResolvedConfig } from "./config.js";
import { constructGraph, type FrameQueries, type Graph } from "./construct.js";
import { drawFallback, tooSmall } from "./fallback.js";
import { isUsable } from "../terminal/capabilities.js";
import { usageText } from "./usage.js";
import { compose, type Composed } from "./frame.js";
import { commandRows, type PaintDeps } from "./paint.js";
import { composeFrame } from "./render-frame.js";
import { focusKey } from "./render-cache.js";
import { renderSequenceToLines } from "../presentation/render-lines.js";
import type { FocusState } from "../presentation/blocks/index.js";
import { contextAt } from "../interaction/completion/index.js";
import { resolveFocus } from "../interaction/router/focus.js";
import { PROMPT_GUTTER } from "./config.js";
import { createIdentityLoop } from "./identity.js";
import {
  SessionStateError,
  UnusableTerminalError,
  type FileSystem,
  type SessionSnapshot,
  type SessionState,
  type StopReason,
  type TuiConfig,
  type TuiConfigInput,
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
};

/**
 * What the reader has to go and edit, for gate 3b's refusal (I61, F8).
 *
 * **Ordered from the omission outwards**, because the case that produced the
 * finding is the one an author reaches first: `env` is optional, `{}` is what
 * they get for saying nothing, and every consequence below follows from a
 * `TERM` that record does not have. Naming the variable before the field would
 * be true and useless — nobody who omitted `env` is thinking about `TERM`.
 *
 * **The remedy names the field and not the expression**, and SS10 is why rather
 * than style: the scan bans the environment accessor across `src/` with a
 * one-file allow-list, and it does not read strings from code — correctly, since
 * a reader auditing I20 by grep must not have to clear a hit every time. So the
 * message says *the process environment* where it wants to say the expression.
 *
 * The last arm is not a fallback. C02 I4 lets a valid override win for
 * `altScreen`, so an app can switch this off deliberately, and a refusal that
 * blamed the environment for a decision the config made would send the reader
 * to the wrong file.
 */
function unusableCause(env: Readonly<NodeJS.ProcessEnv>): string {
  if (Object.keys(env).length === 0)
    return "`TuiConfig.env` is empty, which is what an omitted `env` defaults to — pass the process environment as `env`";
  const term = env["TERM"];
  if (term === undefined) return "`TERM` is not set in the `env` the app supplied";
  if (term === "dumb") return "`TERM` is `dumb`, which declares no alternate screen";
  return "`TuiConfig.capabilities` overrides `altScreen` to false";
}

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

export function createTui<C extends TuiConfig>(
  config: TuiConfigInput<C>,
): TuiInstance {
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
  /**
   * The last frame put on **this** screen, or `null` when nothing describes it
   * (I55, §6b).
   *
   * Held here rather than inside `composeFrame` because the write is here: the
   * composition returns bytes and cannot know whether they landed. `null` is not
   * *no frame yet* — it is *the screen's contents are unknown*, which is the
   * statement `contaminated` makes; `repaint` below is where the two meet, and
   * it is the only place C03's flag needs an expression here.
   */
  #lastFrame: readonly string[] | null = null;

  constructor(private readonly config: ResolvedConfig) {}

  get session(): SessionSnapshot {
    return this.#graph?.session.snapshot ?? emptySnapshot(this.config);
  }

  async start(): Promise<void> {
    // §9's two illegal cells. `stopped` is terminal, matching C01's released
    // state — a second session constructs a new instance (I16).
    if (this.#state === "stopped")
      throw new SessionStateError("start", this.#state);
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
      // **Two functions now, and they were one** (I55). C03 has distinguished
      // them since it was written — `writeFrame` calls `repaint` when the
      // screen's contents are unknown and `render` otherwise — and L4 handed it
      // the same callback twice, so the entire invalidation mechanism reached
      // nothing. `frame-scheduler.ts` reasons about *"diffing against a screen
      // whose contents nobody knows"*, which only means something once one of
      // these two diffs and the other does not.
      render: () => this.#render(),
      repaint: () => {
        this.#lastFrame = null;
        this.#render();
      },
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
    // **Gate 3b — refuse, naming the cause** (I61, F8).
    //
    // One line above gate 4, reading the same terminal, taking the opposite
    // decision — so the difference is asserted rather than left to the reader.
    // Gate 4's subject can change while the session waits; this one cannot,
    // because `altScreen` follows from `TERM` and `TERM` is fixed for the life
    // of the process. That is **gate 1's argument, not gate 4's**: a pipe
    // cannot become a terminal, and a terminal that declares nothing cannot
    // start declaring something.
    //
    // **It goes first, and the ruling that put it second was wrong** — the code
    // is what falsified it. Deferring an unusable terminal on size waits for a
    // resize that cannot cure it, and when the resize arrives `#open()` reaches
    // C01's fatal from inside `onResize`, which nothing guards: the throw leaves
    // the SIGWINCH handler with `start()` long since resolved, so the author's
    // `catch` cannot see it and neither can gate 3b. The incurable condition is
    // answered before the curable one, or the curable one hides it.
    //
    // **The resolved record, which is what puts the gate here** rather than
    // beside gate 1. C02 I4 makes a valid `capabilities` override win
    // unconditionally including for `altScreen`, and the override resolves
    // inside `detectCapabilities` during construction — so a gate reading
    // `config.env` ahead of step 3 would refuse exactly the app that had said
    // what to do about it. It accepts I36's cost knowingly: a history file is
    // opened for a process about to exit, which is smaller than refusing a
    // legal configuration.
    //
    // **A throw, not a warning, and the moment is the reason.** C02's channel
    // is *returned, never emitted*, drained by §8 step 3 — which `stop()`
    // reaches and this path never calls, because `start()` rejects and the
    // session never runs. A warning routed there is unread by construction:
    // the same silence with more machinery. Measured under a PTY.
    if (!isUsable(this.#graph.capabilities)) {
      throw new UnusableTerminalError(unusableCause(this.config.env));
    }

    const size = this.#graph.lifecycle.size();
    if (tooSmall(size)) {
      // **C01's writer, not `config.stdout`** — F67, and the one-line difference
      // between this working and the shell drawing nothing for ever.
      //
      // `config.stdout.write` is *not* a route to the primary screen once the
      // lifecycle exists. C01 redirects `stdout.write` into its `debug` sink at
      // **construction** (C01 I3, I9) rather than at acquire, and `writer` is
      // the only handle that still reaches the real stream. `constructGraph`
      // has already run by the time this gate is read, so the fallback went to
      // a sink nobody reads: 0 bytes on both channels, the process alive, for
      // ever — which is F67's measurement exactly.
      //
      // **The reasoning was right and the handle was wrong**, which is why it
      // survived review: *the terminal was never acquired, so there is no
      // alternate screen, so write to the primary one directly* is true in
      // every clause. It conflates *not acquired* with *not redirected*, and
      // C01 separates them deliberately. The mid-session call site below has
      // always used `writer`.
      drawFallback(size, (s) => void this.#graph?.lifecycle.writer.write(s));
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
          // **The context comes from the pipeline, not from here** (C22 I53).
          // This file holds the lifecycle, the capabilities and the registry
          // and could assemble a second one; one builder is the point.
          graph.pipeline.greeting(
            await greeting(graph.pipeline.producerContext()),
          );
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
    //
    // **Three sources, and it had one** (I6a). C20's warnings and C23's faults
    // were both accumulating where nothing read them — *returned, never
    // emitted* honoured on the half that is easy. **Read here rather than
    // captured earlier**: `history.drain()` is step 2b, inside the release
    // above, so the warning from a failed final append exists only now.
    for (const line of graph.diagnostics()) this.config.stdout.write(`${line}\n`);

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

    // **The composition is `render-frame.ts`'s and this calls it** (C22 I54,
    // C24 I25). It lived here as a private method returning `void`, which made
    // it a sequence nobody could name — and the reason that matters now rather
    // than in the abstract is the render chain: diffing, caching, block
    // windowing and a cap arrive as one change, and a consumer reading frames
    // through `expectDocument().lines()` stays on the production path across
    // all four only if there is one composition. A03's SS48 says so.
    const result = composeFrame({
      composed: () => this.#composed(),
      paintDeps: (frame) => this.#paintDeps(graph, frame),
      resizeViewport: (size) => void graph.viewport.resize(size),
      cursorSequence: (cursor) => graph.lifecycle.cursorSequence(cursor),
      // **The record is the caller's, because the write is** (I55, §4a).
      // `composeFrame` returns bytes and never puts them on a terminal, so it
      // cannot know whether they landed; this does.
      previous: () => this.#lastFrame,
    });

    // The two side effects the unit deliberately does not perform: the write is
    // C01's writer, and the fallback is a side effect rather than a frame.
    // Where the seam falls between *compose* and *put on a terminal* is a
    // question C22 §4a leaves open, and this is the boundary it had.
    if (result.kind === "fallback") {
      // The fallback put something else on the screen, so no record describes
      // it (I55).
      this.#lastFrame = null;
      drawFallback(result.size, (s) => void graph.lifecycle.writer.write(s));
      return;
    }

    // **Cleared before the bytes go out, restored when they have all gone**
    // (I56). Setting it afterwards alone is the obvious rule and leaves the
    // fault case wrong: a write that throws puts a *prefix* of a frame on the
    // screen while the record still names the frame *before* it, so the next
    // diff would compare against a screen that never existed and skip exactly
    // the rows the partial write got wrong. This way a throw is a full repaint
    // by construction rather than by a handler someone must remember to add.
    this.#lastFrame = null;
    graph.lifecycle.writer.write(result.write);
    this.#lastFrame = result.lines;
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
          contextAt(
            graph.editor.text,
            graph.editor.cursor,
            graph.manifest.manifest,
          ),
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
      promptRows: (width, gutter) =>
        graph?.editor.layout(width, gutter).length ?? 1,
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
    const chrome = commandRows(entry.doc.command, width, graph.capabilities);

    // **Cached on all five axes, and the last two are the ones a height cache
    // does not need** (I58, §6c). `focusFor` changes the rendering without
    // moving `rev`, and `ResolvedTheme.name` moves on a variant switch and on an
    // override — the same value C10 I11 keys its own memo on, carried here
    // rather than reached for through an `invalidate` someone must remember.
    const focus = focusFor(graph, entry.id);
    const key = focusKey(focus);
    const theme = graph.theme.current.name;

    // **The window, and the range is the entry's rows less its chrome** (C09
    // I25, §2a). C14 measured `chrome ++ blocks` (C14 I20) and addresses rows in
    // that space, so the blocks' own range starts where the chrome ends. A
    // window that forgot the offset would be short by exactly the command line.
    //
    // `windowSequence` keeps a kind that declares no window whole and pays for
    // it out of `skipRows`, so this is correct for every document and cheaper
    // only for the ones holding a kind that divides.
    const from = Math.max(0, ve.skipRows - chrome.length);
    const to = Math.max(from, ve.skipRows + ve.takeRows - chrome.length);
    const windowed = graph.blocks.windowSequence(entry.doc.blocks, width, from, to);

    // The key carries the range, because the cached lines are now the *window's*
    // (I58). A small entry windows to itself and its key is stable, which is the
    // common case; a large one re-renders as it scrolls, and only the rows on
    // screen.
    const range = `${String(from)}\u0000${String(to)}`;
    const held = graph.rendered.get(entry.id, entry.rev, width, `${key}\u0000${range}`, theme);
    const lines =
      held ??
      renderSequenceToLines(graph.blocks, windowed.blocks, width, {
        theme: graph.theme.current,
        capabilities: graph.capabilities,
        // **The third field, and the context was shipped with two** (C16 §3).
        // Focus was stored, derived and routed, and a focused row rendered
        // exactly like an unfocused one because nothing ever put it in the
        // context C09 reads it from. Every reference existed and the seam was
        // still broken — a partially-populated context, which counting
        // references cannot see.
        focus,
      });
    if (held === undefined) {
      graph.rendered.set(entry.id, entry.rev, width, `${key}\u0000${range}`, theme, lines);
    }

    // **The chrome is unwindowed and the blocks are**, so the slice is taken
    // over the chrome at its own offset and over the window's rows at theirs.
    // `windowed.skipRows` is the slack the seam could not remove — an
    // indivisible unit or a sticky header — and dropping it here is what makes
    // the window invisible.
    // **The offsets are already spent, so the slice starts at zero.** The
    // chrome is dropped by `skipRows` directly; the blocks were windowed *from*
    // `skipRows − chrome.length`, so their rows already begin where the viewport
    // asked. Slicing the concatenation by `ve.skipRows` a second time — which is
    // what the unwindowed version correctly did — takes the same offset twice
    // and drops the top of a tall entry. T4.12 is what said so.
    const keptChrome = chrome.slice(Math.min(ve.skipRows, chrome.length));
    const rows = [...keptChrome, ...lines.slice(windowed.skipRows)];
    out.push(...rows.slice(0, ve.takeRows));
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

  // **The third of the three walks, and the one in another component** (C26
  // §8b.4). This tested `block.kind === "table"` and asked C11 directly, exactly
  // as `liveRows` and `liveRowAction` did — and `liveRowAction`'s own comment
  // warned that a second walk elsewhere would be a second answer to *what is
  // here*, while sitting beside the second and blind to this one.
  //
  // It also stopped at the top level, so a table inside a `panel` was never told
  // it held focus and drew no highlight for a row the reader had moved to.
  //
  // **And it manufactured the block half of the address by searching for the
  // first element whose id matched** (C26 §8b.7), so with two tables each
  // carrying `r1` the highlight drew on the first while focus was on the second.
  // `resolveFocus` is the same function the key effects use, which is what makes
  // *what is highlighted* and *where the next arrow goes* one answer rather than
  // two that agree — and it writes nothing, because this runs per frame.
  const elements = graph.liveElements();
  const i = resolveFocus(stored.element, elements);
  const found = i === null ? undefined : elements[i];
  if (found === undefined) return null;
  return Object.freeze({ blockId: found.blockId, rowId: found.element.id });
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
