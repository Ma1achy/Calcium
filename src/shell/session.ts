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
import { transmitImage, type SentImages } from "./transmit-image.js";
import { composeFrame } from "./render-frame.js";
import { focusKey } from "./render-cache.js";
import { reserveNeeded } from "./block-faults.js";
import { descendants } from "../data/viewmodel/index.js";
import type { Block, Image, Plot } from "../data/viewmodel/index.js";
import { renderSequenceToLines } from "../presentation/render-lines.js";
import { animationIntervalOf } from "../presentation/blocks/index.js";
import { framesOf } from "../presentation/blocks/kinds/image.js";
import type { FocusState } from "../presentation/blocks/index.js";
import { contextAt } from "../interaction/completion/index.js";
import { selectionSpans, type CellSpan } from "../interaction/editor/index.js";
import { resolveFocus } from "../interaction/router/focus.js";
import { PROMPT_GUTTER } from "./config.js";
import { cursorStyleFor, steadyWhileTyping } from "./cursor-style.js";
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

/** One frozen empty array rather than a new one per paint (entry 23). */
const EMPTY_SPANS: readonly CellSpan[] = Object.freeze([]);

/**
 * What the frame that just drew wants moved (C22 I73, I74).
 *
 * **Two populations and not one number.** The spinner's cadence comes from the
 * blocks and the orbits come from the reader, and one timer cannot be a cadence
 * for both — so the ticker takes the shorter interval and each animation reads
 * its own elapsed time from it.
 */
type Animated = Readonly<{
  spinnerMs: number | null;
  orbits: readonly Readonly<{ entryId: string; blockId: string; declared: Plot["camera"] }>[];
  /**
   * The animated images the frame drew on a rasterising arm (C22 I77, C04
   * I93). **Not gathered at `kitty`**: there the terminal holds every frame and
   * runs the loop itself, so the session has nothing to advance and arms
   * nothing — a still must cost nothing, and on that arm an animation costs the
   * same. The delays travel with the entry for `Cameras`' reason: only the
   * block knows them.
   */
  frames: readonly Readonly<{ entryId: string; blockId: string; delays: readonly number[] }>[];
}>;

const NOTHING_ANIMATES: Animated = Object.freeze({
  spinnerMs: null,
  orbits: Object.freeze([]),
  frames: Object.freeze([]),
});

/**
 * The orbit's cadence, and it is C03's two windows rather than two new numbers
 * (C22 I73).
 *
 * 33 ms is `stream`'s window — *~30 frames/s, matching the A02 §7 budget* — and
 * 100 ms is `spinner`'s, which is what the rotation falls back to where
 * `synchronisedUpdate` is absent and a full-frame rewrite would tear. Naming
 * them here rather than importing C03's table keeps L4 out of a constant L0
 * tunes at construction; the *reason* is what binds them, and that is asserted.
 */
const ORBIT_MS = 33;
const ORBIT_MS_TORN = 100;

/**
 * One revolution in twelve seconds, in radians per millisecond (C22 I74).
 *
 * **The number comes from the measurement rather than from taste.** At 30fps it
 * is one degree a frame, between the `pi/256` and `pi/64` steps measured at 22%
 * and 30% of a frame's cells changing; at the capped 10fps it is three degrees,
 * just past `pi/64`. Both read as motion rather than as a jump, which is the
 * property the figure has to have (F468).
 */
const ORBIT_RATE = (2 * Math.PI) / 12_000;

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

  /**
   * Digests this session has transmitted (C09 I36).
   *
   * **Session-scoped, because the id space is the terminal's.** An entry evicted
   * from the transcript does not un-send its image, and a document redrawn does
   * not need to re-send one.
   */
  readonly #sentImages: SentImages = new Set<string>();

  /**
   * C03's spinner counter, and **the one thing F227 was about**.
   *
   * `RenderContext.tick` is documented as *a monotonic counter, incremented by
   * C03's spinner commit*, and for the life of the project nothing incremented
   * it: `commit("spinner")` appeared in six test files and nowhere in `src/`.
   * Measured, `steps` drew one distinct glyph across ten real frames where the
   * same block through the test harness drew ten.
   */
  #tick = 0;

  /**
   * What the last frame drew that wants to move (C22 I73, I74).
   *
   * Written by `visibleRows`, which is the only thing that sees which blocks are
   * on screen at this width after windowing. **A transcript with nothing
   * animating in it arms no timer at all** — the ticker is not a heartbeat.
   *
   * **Two populations rather than one number**, because one timer cannot be a
   * cadence for two animations (I74). The spinner's cadence comes from the
   * blocks; the orbits are the plots a reader has turned on, and each carries
   * the declared camera its nudges are measured against — only the block knows
   * that (`cameras.ts`'s header).
   */
  #animation: Animated = NOTHING_ANIMATES;

  /**
   * When the spinner's counter and the orbits' angles were last advanced (I74).
   *
   * **Both are stamps and neither is a count**, which is the whole of I74: a
   * step per timer firing makes each animation's speed depend on the other's
   * presence, in both directions. `null` means nothing is armed, so the first
   * wake after a quiet period advances by the interval it was armed for rather
   * than by however long the session was idle.
   */
  #tickAt: number | null = null;
  /**
   * When continuous motion — the orbits' angles and the images' frames — was
   * last advanced (I74, I77). **One stamp for both populations**, because both
   * are `f(Δt)` from the same wake and a second stamp would be a second place
   * for the reset on stop to miss.
   */
  #motionAt: number | null = null;

  /** The armed tick, disposed and re-armed on every frame. */
  #spinner: Disposable | null = null;
  /**
   * Copy mode: the reader has asked the app to step back (C16 §5b, C03 §4a).
   *
   * **Real state owned here, beside the other frame queries**, because the two
   * things it drives are both this file's: the scheduler it suspends and the
   * mouse tracking it turns off. `FocusInputs.copyMode` reads it and
   * `activeTarget` does the rest — it is a *target*, not a third mode beside
   * navigate and interact (roadmap 15's ruling, C26 I2's argument unchanged).
   */
  #copyMode = false;

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
    // **Before the release, and disposed rather than left to the frame that
    // never comes.** The ticker re-arms itself out of `#render`, so a session
    // that stops between two frames would keep a timer alive holding the process
    // open — the same shape `refresh.dispose()` sets `stopped` first for.
    this.#spinner?.[Symbol.dispose]();
    this.#spinner = null;
    this.#animation = NOTHING_ANIMATES;
    this.#tickAt = null;
    this.#motionAt = null;
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
      // **The target, not the layer** (C22 I63, §6f). `router.target` is what
      // holds the keys, and it is defined on every frame — a layer is not, and
      // five of the seven targets have no `Placed` at all. C01 answers with
      // nothing when the shape has not changed, so this is a read per frame and
      // bytes only on a transition.
      cursorShape: () =>
        graph.lifecycle.cursorShapeSequence(
          // **Two steps, and the second only ever removes blink** (I63, I64).
          // The declaration is the app's answer; *steady while typing* is a
          // refinement of it and never a second opinion, so a style declared
          // steady is never made to blink and a `null` one is untouched.
          steadyWhileTyping(
            cursorStyleFor(graph.router.target, this.config.cursor),
            graph.cursorIdle(),
          ),
        ),
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
    // **The transmission leads the frame, in the same write** (C09 §4c).
    // Ink strips APC escapes, so this cannot travel inside a `Text` node and
    // does not: it is prefixed to the bytes here, where the shell already owns
    // the write, and only the placeholders go through Ink as ordinary text.
    //
    // **Before rather than after**, because placeholders addressing an image
    // that has not been sent draw nothing — and the frame reaches an absolute
    // address before any row content, so a cursor the escape might have moved is
    // corrected by the next byte written. Measured: `session.ts` is the only
    // path that writes block rows; `drawFallback` writes a fixed message with no
    // blocks, and C03's sink writes its own control bytes.
    //
    // **On entry into the DOCUMENT rather than into the viewport**, and the
    // `#sentImages` set is what makes that affordable: each digest transmits
    // once for the session, so an image scrolled into view later costs nothing
    // at the moment it appears. Keying on the windowed set instead would put a
    // transmission in a frame where nothing else changed — a scroll that emits
    // a payload — which is the worse of the two.
    graph.lifecycle.writer.write(
      transmitImage(
        graph.transcript.entries.flatMap((e) => e.doc.blocks),
        graph.capabilities,
        this.#sentImages,
        // The frame's width — the declared cell box is a render-time fact and
        // was a hardcoded `1` (F380).
        graph.lifecycle.size().columns,
      ) + result.write,
    );
    this.#lastFrame = result.lines;

    // **After the write, and that is the whole of why the frame stays one pass**
    // (I69). The fault is discovered inside `visibleRows`, which is a read of the
    // transcript; patching it there would be a write inside the frame it would
    // change. Here the frame is on the terminal and the next one honours it.
    this.#raiseReserves(graph);

    // **Armed from what this frame drew, not from what the document holds.**
    // `visibleRows` reported the cadence after windowing, so a spinner scrolled
    // off the screen stops the timer and one scrolled back on starts it — which
    // is the same rule `anyoneLooking` applies to a refresh source, and for the
    // same reason (C23 I46).
    this.#armSpinner();
  }

  /**
   * The third link, and the one recorded nowhere (F227).
   *
   * C03 declares a `spinner` commit reason, tunes its 100 ms window and
   * specifies how it coalesces against `stream` — and nothing in the product
   * ever supplied one. **A missing producer makes every consumer downstream of
   * it look like a decision deferred rather than a chain broken**, which is why
   * C22 I60 and its §6c row 10 both read *not reachable* while a shipped kind
   * could not animate.
   *
   * Disposed and re-armed every frame: the interval belongs to the fastest set
   * on screen, and both the set and the screen can change between frames.
   */
  /**
   * What the frame owed, issued (C22 I69, C04 I67).
   *
   * The three guards are `reserveNeeded`'s and are written down there, with the
   * reason one of them lives in a function rather than in this loop: the drain
   * is in the same synchronous block as the frame that filled it, so the arm
   * about a moved `rev` is reachable only through a frame that returned early —
   * a real path and a narrow one, and not one a session row would enter.
   */
  #raiseReserves(graph: Graph): void {
    let raised = false;
    for (const req of graph.blockFaults.drain()) {
      const entry = graph.transcript.entries.find((e) => e.id === req.entryId);
      const held = entry === undefined ? undefined : blockById(entry.doc.blocks, req.blockId);
      if (!reserveNeeded(entry, held, req)) continue;

      graph.transcript.patch(
        req.entryId,
        { op: "reserve", blockId: req.blockId, rows: req.rows },
        // **The gate reads who is writing** (C13 §6). The entries whose
        // renderers gave way are settled ones by construction — a result settles
        // the moment it lands — so the far side's arm would refuse every case
        // this exists for.
        "shell",
      );
      raised = true;
    }
    // **Guarded, and it is the second half of termination.** An unconditional
    // commit ends every frame by scheduling another, and the patch guard above
    // does nothing about it: the session never goes quiet, draws the correct
    // picture for ever, and looks exactly like one that is idle. Measured — a
    // fixture with nothing animating in it wrote thirty more frames while the
    // screen did not change.
    //
    // C03's window, so a reserve coalesces with whatever else moved the
    // document. `stream` rather than `input`: this is content changing, not a
    // key, and 33 ms is one frame at a rate a reader cannot see.
    if (raised) graph.scheduler.commit("stream");
  }

  #armSpinner(): void {
    this.#spinner?.[Symbol.dispose]();
    this.#spinner = null;
    const { spinnerMs, orbits, frames } = this.#animation;
    // **The capability chooses the orbit's cadence, and the same switch chooses
    // its commit reason** (I73). A full-frame rewrite thirty times a second on a
    // terminal without DECSET 2026 shows a horizontal seam every frame, and the
    // tear is worse than the slower rotation.
    const floor = this.#graph?.capabilities.synchronisedUpdate === true ? ORBIT_MS : ORBIT_MS_TORN;
    const orbitMs = orbits.length === 0 ? null : floor;
    // **An animated image wakes when its next frame is due, and no sooner**
    // (I77). The orbit has no natural cadence and takes the floor; a GIF has
    // one — its delays — so the timer is armed for the earliest frame change on
    // screen, floored at the same rate the orbit is. A 500 ms GIF costs two
    // wakes a second and not thirty, and a 20 ms one is capped where C03's
    // `stream` window would cap it anyway, its frames skipped by the delta
    // arithmetic rather than drawn late one by one.
    let framesMs: number | null = null;
    if (frames.length > 0) {
      const graph = this.#graph;
      let due = Number.POSITIVE_INFINITY;
      for (const f of frames) {
        const d = graph?.frames.due(f.entryId, f.blockId, f.delays) ?? 0;
        if (d < due) due = d;
      }
      framesMs = Math.max(floor, Number.isFinite(due) ? due : floor);
    }
    const candidates = [spinnerMs, orbitMs, framesMs].filter((m): m is number => m !== null);
    const ms = candidates.length === 0 ? null : Math.min(...candidates);
    if (ms === null) {
      this.#tickAt = null;
      this.#motionAt = null;
      return;
    }
    const now = this.config.clock();
    this.#tickAt ??= now;
    this.#motionAt ??= now;
    this.#spinner = this.config.schedule(() => void this.#animate(), ms);
  }

  /**
   * One wake: advance whatever is moving, then ask for a frame (I73, I74).
   *
   * **The reason is the frame rate and the interval is not.** `commit("spinner")`
   * draws at 10fps however fast this fires, because C03's 100 ms window is a
   * floor under the ticker (I60a) — so a live orbit commits `stream`, whose
   * rationale in C03 §3 is a rate ceiling and says nothing about the source.
   * Everything else keeps `spinner`, and C03 §3's asymmetry is exactly this
   * case: a stream commit under a pending spinner draws within its own 33 ms.
   */
  #animate(): void {
    const graph = this.#graph;
    if (graph === null) return;
    const now = this.config.clock();
    const { spinnerMs, orbits, frames } = this.#animation;

    // **The angle is `ω · Δt` and never `ω` per wake** (I74). The timer is armed
    // at the fastest cadence anything on screen wants, so a step per wake turns
    // the plot **25% fast** the moment an 80 ms spinner appears beside a capped
    // 100 ms orbit — its speed decided by something it has nothing to do with.
    // The counter below is the same defect pointing the other way.
    //
    // **The frame index is the same arithmetic one store along** (I77): the
    // elapsed time goes into `Frames.advance`, which walks whole delays and
    // keeps the remainder, so a GIF beside a 33 ms orbit shows each frame for
    // its own delay and not for one wake. One stamp serves both, read once.
    if (orbits.length > 0 || frames.length > 0) {
      const since = now - (this.#motionAt ?? now);
      this.#motionAt = now;
      const azimuth = ORBIT_RATE * since;
      for (const o of orbits) graph.cameras.nudge(o.entryId, o.blockId, o.declared, { azimuth });
      for (const f of frames) graph.frames.advance(f.entryId, f.blockId, f.delays, since);
    }

    // **Whole intervals, and the remainder is kept** (I74). A step per wake
    // would spin the glyph **three times too fast** under a 33 ms orbit, which is
    // the mirror of the clause above; flooring and *dropping* the remainder
    // would lose a fraction of an interval on every wake and run it slow.
    // Advancing the stamp by the steps consumed keeps it exact, and zero steps is
    // a wake the spinner was not the reason for.
    if (spinnerMs !== null) {
      const steps = Math.floor((now - (this.#tickAt ?? now)) / spinnerMs);
      if (steps > 0) {
        this.#tick += steps;
        this.#tickAt = (this.#tickAt ?? now) + steps * spinnerMs;
      }
    }

    graph.scheduler.commit(orbits.length > 0 || frames.length > 0 ? "stream" : "spinner");
  }

  #paintDeps(graph: Graph, frame: Composed): PaintDeps {
    const width = frame.size.columns;
    return {
      registry: graph.blocks,
      theme: graph.theme.current,
      capabilities: graph.capabilities,
      // **The layer host, and it is the one `/live` draws into** (C12 I107).
      scratch: graph.scratch,
      // C14 selected these at this width; the paint pads them and never
      // re-measures (C09 I1 — one implementation, or the two answers drift).
      // **Both take the frame's width from the frame**, not from a fresh
      // `size()`. A closure that re-read it is exactly the two-width frame the
      // note names, arriving through the one seam that looks harmless.
      transcriptRows: () =>
        visibleRows(graph, width, this.#tick, (animated) => {
          this.#animation = animated;
        }),
      promptRows: () => graph.editor.layout(width, PROMPT_GUTTER),
      promptCursor: () => graph.editor.cursorCell(width, PROMPT_GUTTER),
      // **The wash, mapped through the same walk the rows came from** (C17 I18,
      // roadmap entry 23). `selection` is read here rather than a
      // `selectionSpans` method being added to `LineEditor`, because the guard
      // and the mapping both belong to whoever knows the width — and a method
      // whose only caller is the painter is a member the editor does not need.
      //
      // Empty when there is no region, which is the common case and costs one
      // frozen array.
      promptSelection: () => {
        const sel = graph.editor.selection;
        if (sel === null) return EMPTY_SPANS;
        return selectionSpans(
          graph.editor.text,
          sel.anchor,
          sel.head,
          width,
          PROMPT_GUTTER,
          // The fourth caller of the one walk, and the one the seam was nearly
          // written without: a wash measured on sentinels and drawn over labels
          // covers the wrong cells, and no assertion about which characters are
          // selected shows it.
          graph.editor.drawAs,
        );
      },
      // C16's derived focus, read rather than stored — the cursor belongs to
      // whatever holds the keys, and a second record of that would drift from
      // the display exactly as a stored focus does (C16 §3, C15 I19).
      promptFocused: () =>
        graph.router.target === "prompt" || graph.promptUnderMenu(),
      // **Read at paint, not captured** (C22 I66). `/theme light --no-bg`
      // changes it between frames, and the frame that shows the change is the
      // one the notice commits.
      suppressBackground: () => graph.suppressBackground(),
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

  /**
   * Both halves of copy mode, in one place because they are one transition.
   *
   * **Three effects and the order is not arbitrary.** The flag moves first, so
   * anything that reads it during the rest of this sees the new value. Then the
   * screen: entering *suspends after* one last frame is drawn showing the
   * indicator — otherwise the reader is told nothing and simply finds the mouse
   * dead — and leaving *resumes*, which writes the catching-up frame itself
   * (C03 I14).
   *
   * Mouse tracking last, and off only after the frame that says so is up: the
   * terminal's own selection is what the reader is about to use, and it should
   * not become available before the screen has stopped moving.
   */
  #setCopyMode(on: boolean): void {
    const graph = this.#graph;
    if (graph === null || this.#copyMode === on) return;
    this.#copyMode = on;

    if (on) {
      // The indicator's frame, then the hold. `flush` rather than a bare commit
      // so the frame is on the screen before `suspend()` can gate one.
      graph.scheduler.commit("input");
      graph.scheduler.flush();
      graph.scheduler.suspend();
      graph.lifecycle.setMouseTracking(false);
      return;
    }

    // Tracking back first: the reader has finished selecting, and the app takes
    // the mouse again before it takes the screen.
    graph.lifecycle.setMouseTracking(true);
    graph.scheduler.resume();
  }

  #frameQueries(): FrameQueries {
    return {
      copyMode: () => this.#copyMode,
      enterCopyMode: () => this.#setCopyMode(true),
      exitCopyMode: () => this.#setCopyMode(false),
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
      copyMode: () => this.#copyMode,
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
function visibleRows(
  graph: Graph,
  width: number,
  tick: number,
  onAnimation: (animated: Animated) => void,
): readonly string[] {
  const out: string[] = [];
  // **The cadence anything visible wants, reported once per frame.** The session
  // arms its ticker from this and disarms when it is `null`, so a transcript
  // with nothing animating in it schedules nothing at all (F227).
  let fastest: number | null = null;
  // **The orbits the frame drew, gathered from the same windowed set** (C22
  // I73). Not from the store and not from the document: an orbiting plot
  // scrolled off screen must stop turning, for the reason a spinner scrolled off
  // stops ticking (I60a) — and without this the timer another entry's spinner
  // keeps alive would turn a camera nobody is looking at.
  const orbits: { entryId: string; blockId: string; declared: Plot["camera"] }[] = [];
  // **The animated images the frame drew, on the arms that draw them** (C22
  // I77). Gathered from the same windowed set as the orbits and for the same
  // reason, and **not at `kitty`**: the protocol arm handed the terminal every
  // frame once, so there the image is a still as far as this session's timer
  // is concerned. On the halfblock and dither arms each frame is a text frame,
  // which is the orbit's own cost and no more.
  const frames: { entryId: string; blockId: string; delays: readonly number[] }[] = [];
  const rasterising = graph.capabilities.imageProtocol !== "kitty";
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
    // **The fourth axis, and it is the one that fails silently** (C04 I48). A
    // scroll offset changes what is rendered and moves none of `rev`, width,
    // focus or theme — focus's own story a third time — so without this a
    // reader who scrolls away and back is served the frame they left. It fails
    // nothing until a row scrolls twice and reads the frame, which is why
    // T4.18e is written that way.
    const offsets = graph.scrollOffsets.key(entry.id);

    // **The fifth axis, and it is the one that fails intermittently** (C22 I60,
    // C09 I32, F227). An animating entry whose key omits `tick` is served its
    // first frame for the life of the session — but only on a cache *hit*, so
    // with the counter wired and this line missing the spinner turns whenever
    // something else invalidated the slot and freezes when nothing did. Frozen
    // is diagnosable; intermittent is not, which is why this carries its own
    // mutation rather than riding with the pair that supplies the counter.
    //
    // **Per kind, so an entry holding nothing animated keys exactly as before.**
    // Adding `tick` to every slot would bust the whole cache on every spinner
    // commit, which is the opposite of what the cache is for.
    // **The sixth axis, and it is the one whose symptom is a hang** (C22 I71,
    // §6c). The other five produce a *wrong* frame and a reader reports it
    // against whatever they touched; a cached 3D plot under an orbit produces a
    // **correct** frame — the previous one — thirty times a second, which is
    // indistinguishable from a stopped process. So the report says *it froze*
    // and names the scheduler, the runner or the terminal, and none of the three
    // is where the defect would be.
    //
    // **Baselines omitted rather than zeros**, which is where this differs from
    // the offsets one line up: a camera's absent state is the block's own
    // declared view, and `distance: 0` is degenerate rather than absent.
    const orbitKey = graph.cameras.key(entry.id);
    // **The seventh axis, and the one whose absence the sixth was written
    // against** (C22 I76, C12 §3s). `cursorPositions` was the counter-example
    // I71 cited — read in one place, written by nothing, in no key. It has a
    // writer now, so a crosshair moved and a frame served from before it moved
    // would read as a key that does nothing; every index is in the key, because
    // absent is *no crosshair* and zero is *the first sample*.
    const cursorKey = graph.cursorPositions.key(entry.id);
    // **The eighth axis, and its symptom is the sixth's** (C22 I77, C04 I93).
    // A frame index changes what is rendered and moves none of the other seven,
    // so without it an animated image is served frame 0 for the life of the
    // session — a correct still, which is what a reader on the dither arm would
    // report as *the GIF does not animate*. Zero omitted, as the offsets are:
    // frame 0 after a loop draws what frame 0 drew.
    const framesKey = graph.frames.key(entry.id);
    // **The ninth axis** (C22 I78, C04 I99). A series hidden or shown changes
    // what is inked and moves none of the other eight; without this the toggle
    // is served the frame from before it — the `⌃a` class (F769), a key that
    // does nothing. Every override is in it, `false` included, because an
    // override to *shown* over a producer's *hidden* is a different frame from
    // no override.
    const seriesKey = graph.seriesVisibility.key(entry.id);

    // **Containers are walked, and it is C04's `descendants` rather than a
    // copy** (C22 I73). `animationIntervalOf` learned this from the mutation
    // pass — a `steps` inside a `panel` is what `b.live` builds — and a plot
    // inside a `group` is the same arrangement one kind along. A recursion added
    // to the writer and not to the reader is the pair that reads as correct on
    // both sides.
    for (const blk of windowed.blocks) {
      for (const b of [blk, ...descendants(blk)]) {
        if (b.kind !== "plot") continue;
        const plot = b as Plot;
        // **No path in `src/` can produce a flag set on a plot with no camera** —
        // the only writer runs off `focusedPlot()`, which requires the
        // declaration — so this guard survives its own mutation. It is kept on
        // the asymmetry rather than on the odds: one comparison per plot per
        // frame against a permanent 30fps redraw of a document nobody is
        // orbiting, which is what a held flag over a `settle` that dropped the
        // member would leave. Measured 2026-09-02; `settle` is the symbol to
        // grep when it becomes drivable.
        if (plot.camera === undefined) continue;
        if (!graph.cameras.orbiting(entry.id, plot.id)) continue;
        orbits.push({ entryId: entry.id, blockId: plot.id, declared: plot.camera });
      }
      if (rasterising) {
        for (const b of [blk, ...descendants(blk)]) {
          if (b.kind !== "image") continue;
          const animation = framesOf(b as Image);
          if (animation === null) continue;
          frames.push({ entryId: entry.id, blockId: b.id, delays: animation.delays });
        }
      }
    }

    const cadence = animationIntervalOf(windowed.blocks);
    if (cadence !== null && (fastest === null || cadence < fastest)) fastest = cadence;
    const animated = cadence === null ? "" : `\u0000${String(tick)}`;
    const slot = `${key}\u0000${range}\u0000${offsets}\u0000${orbitKey}\u0000${cursorKey}\u0000${framesKey}\u0000${seriesKey}${animated}`;
    const held = graph.rendered.get(entry.id, entry.rev, width, slot, theme);
    // **Faults from here are this entry's** (I69). A `BlockFault` names a block
    // and ids are unique within a document and not across entries (C04 I14), so
    // neither half addresses anything on its own. A scope rather than a field,
    // because the render that produces the fault is one call and the caller is
    // what knows which entry it is drawing.
    const lines =
      held ??
      graph.blockFaults.within(entry.id, entry.rev, () =>
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
        // **The counter, and it was `?? 0` for the life of every session**
        // (F227). `RenderContext.tick` is documented as advanced by C03's
        // spinner commit; nothing raised one and nothing passed one, and the
        // two are a pair — supplying it here while the commit is missing leaves
        // the frame exactly as frozen, which is what made the obvious repair
        // indistinguishable from doing nothing.
          tick,
          scrollOffsets: graph.scrollOffsets.forEntry(entry.id),
          // **The field and its writer landed together** (C22 I71). A camera on
          // `RenderContext` that nothing could move would have been what
          // `cursorPositions` was until C22 I76 — read in one place, written by
          // nothing in `src/`, correct and unobservable at once (C12 §3s).
          cameras: graph.cameras.forEntry(entry.id),
          // **And the field the comment above named as the counter-example, now
          // with its writer** (C22 I76, C12 §3s). `cursorBlock` in `construct.ts`
          // sets it from `←`/`→`, the store joins the eviction callback, and
          // `cursorKey` above is its axis — the three halves I71 said land
          // together or not at all.
          cursorPositions: graph.cursorPositions.forEntry(entry.id),
          // **The frame each animated image is on, with its writer** (C22 I77,
          // C04 I93). `Frames` in `shell/`, advanced on the wake above, keyed by
          // `framesKey` — the three halves I71 says land together.
          frames: graph.frames.forEntry(entry.id),
          // **The reader's series overrides, with their writer and their axis**
          // (C22 I78, C12 I116). `toggleSeriesBlock` in `construct.ts` writes
          // it from the plot's own digits, the store joins the eviction
          // callback, and `seriesKey` above is its axis.
          seriesVisibility: graph.seriesVisibility.forEntry(entry.id),
          // **The field and its writer land together, again** (C12 I107, §6o
          // row 9). One store per session and no key of its own here: the
          // scratch is keyed on the caller's arrays inside C12, which is what
          // lets an orbit reuse a mesh's triangles while `rendered` misses on
          // the very same frame. The two caches disagree by construction and
          // both are right — the picture moved and the geometry did not.
          scratch: graph.scratch,
        }),
      );
    if (held === undefined) {
      // **C09's rows against C09's own number, on the frame that produced them**
      // (I70, F230). The trim below reconciles this entry's rows against C14's
      // slot and cannot say whether it is cutting a screen that ran out or a
      // block that over-drew — the two are the same `slice` and one of them
      // deletes the block underneath. This is where the difference is knowable,
      // and it is asked only on a cache miss: a hit's lines came from a miss
      // that was already asked.
      const expected = graph.blocks.measureSequence(windowed.blocks, width);
      if (lines.length !== expected) {
        graph.blockFaults.note(
          `entry ${entry.id}: C09 drew ${String(lines.length)} rows where measure ` +
            `committed ${String(expected)} (C09 I1) — the frame keeps ${String(expected)}, ` +
            `and anything below the overflow in this entry is dropped`,
        );
      }
      graph.rendered.set(entry.id, entry.rev, width, slot, theme, lines);
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
  onAnimation(
    fastest === null && orbits.length === 0 && frames.length === 0
      ? NOTHING_ANIMATES
      : { spinnerMs: fastest, orbits, frames },
  );
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
  // **The focused entry, through the pull the key side reads** (C26 I22, §4g).
  // This line was `graph.transcript.liveId !== entryId`, and it was the render
  // side of the ceiling: whatever the store said, no settled entry ever drew a
  // highlight, so a location in one was invisible as well as unreachable.
  if (graph.focusedEntryId() !== entryId) return null;

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
  const elements = graph.focusedElements();
  const i = resolveFocus(stored.element, elements);
  if (i === null) return null;
  const found = elements[i];
  if (found === undefined) return null;
  const head = Object.freeze({ blockId: found.blockId, rowId: found.element.id });

  // **The extent, by `copyElement`'s own arithmetic** (C26 I16, §5c trace 3),
  // so what is washed and what `y` copies are one answer. The head goes
  // through `resolveFocus` because a stale head is where focus *is*; the
  // anchor does not — I10's fall lands on the block's first element, which
  // widened a copy to rows the reader never chose (F764) — so an exact match
  // is the only honest answer and a stale anchor collapses to the head.
  //
  // **Measured before this**: after `↓ ⇧↓ ⇧↓` the frame showed the head in
  // `accent` and nothing else — `y` was the extent's only reader (F764).
  //
  // The head alone is no selection and the field is **absent**, not `[]`
  // (`FocusState.selected`): the two draw identically and must key
  // identically. `keys.ts`'s `copyElement` holds the same eight lines; the
  // shared helper is owed beside `resolveFocus` (arc3 Lane A's request).
  const anchorAt = stored.anchor;
  const exact =
    anchorAt === null
      ? -1
      : elements.findIndex((p) => p.blockId === anchorAt.blockId && p.element.id === anchorAt.elementId);
  const anchor = exact === -1 ? i : exact;
  if (anchor === i) return head;
  const selected = elements
    .slice(Math.min(anchor, i), Math.max(anchor, i) + 1)
    .map((p) => Object.freeze({ blockId: p.blockId, rowId: p.element.id }));
  return Object.freeze({ ...head, selected: Object.freeze(selected) });
}

/**
 * One block by id, children included (C04 I14).
 *
 * **The subtree, because a containment descends.** A `steps` inside a `panel` is
 * exactly what `b.live` builds, so the block that gave way is as likely to be a
 * child as a top-level entry — and a top-level scan would silently reserve
 * nothing for the arrangement the framework itself produces.
 */
function blockById(blocks: readonly Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    for (const child of descendants(block)) if (child.id === id) return child;
  }
  return undefined;
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
