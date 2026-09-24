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

import { availableParallelism } from "node:os";
import { dirname } from "node:path";
import { appendFileSync, closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { resolveConfig, type Ambient, type ResolvedConfig } from "./config.js";
import { constructGraph, type FrameQueries, type Graph } from "./construct.js";
import * as semantic from "./semantic-selection.js";
import type { SemanticMode } from "./semantic-selection.js";
import { drawFallback, tooSmall } from "./fallback.js";
import { isUsable } from "../terminal/capabilities.js";
import { usageText } from "./usage.js";
import { compose, type Composed } from "./frame.js";
import { commandRows, type PaintDeps } from "./paint.js";
import { transmitFrame, transmits, type SentImages } from "./transmit-image.js";
import { composeFrame } from "./render-frame.js";
import { createProfiler, DEFAULT_TIER, isRecording, isSpanning } from "./profiling/recorder.js";
import { createInspector, createResourceProbe, type CaptureIo } from "./profiling/node.js";
import type { CommitReason, Profiler } from "./profiling/types.js";
import { focusKey } from "./render-cache.js";
import { reserveNeeded } from "./block-faults.js";
import { descendants } from "../data/viewmodel/index.js";
import type { Block, Image, Plot } from "../data/viewmodel/index.js";
import { blockSpansOfEntry, elementsOfEntry, entryLayout, renderEntryPieces, windowEntry } from "./entry-layout.js";
import { washedRowsOf, washSelectedRows } from "./paint.js";
import { animationIntervalOf } from "../presentation/blocks/index.js";
import { isBand } from "../presentation/blocks/paint.js";
import type { EntryParts } from "./render-cache.js";
import type { EntryPiece } from "./entry-layout.js";
import type { Group } from "../data/viewmodel/index.js";
import { framesOf, placesAtProtocol } from "../presentation/blocks/kinds/image.js";
import type { FocusState } from "../presentation/blocks/index.js";
import type { RenderScratch } from "../presentation/blocks/types.js";
import { contextAt } from "../interaction/completion/index.js";
import { chipSpans, selectionSpans, type CellSpan } from "../interaction/editor/index.js";
import { extentOf } from "../interaction/router/focus.js";
import { renderSequenceToLines } from "../presentation/render-lines.js";
import { PROMPT_GUTTER, regionWidth } from "./config.js";
import { cursorStyleFor, steadyWhileTyping } from "./cursor-style.js";
import { autoscrollFor, beginDrag, clampToContainer, type Drag } from "./drag-selection.js";
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
import type { ChildSurface, ChildSurfaceHandle } from "./surface.js";

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
 * Where a `deep` capture's bytes land. The same boundary argument as
 * `nodeFileSystem` above, and a separate seam because the shapes differ: a
 * capture is a stream of chunks with a cap on it, not a document.
 *
 * **A file descriptor and synchronous writes**, because the alternative at the
 * measured sizes is worse in both directions. A 60 MB heap snapshot buffered
 * into a string is 60 MB of the heap of a process the capture exists to
 * examine; the same 60 MB through `appendFileSync` is one `open`/`close` pair
 * per chunk. `writeSync` on a held descriptor is neither.
 *
 * **The directory needs no `.gitignore` of its own** (C28 I17): `.calcium/` is
 * ignored by this repository's `.gitignore` and, for a consuming project,
 * C22 I67 creates `stateDir` holding a `.gitignore` of `*` regardless of what
 * that project ignores.
 */
const captureIo = (): CaptureIo => ({
  open(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    const fd = openSync(path, "w");
    return {
      write: (chunk: string): void => void writeSync(fd, chunk),
      close: (): void => {
        closeSync(fd);
      },
    };
  },
});

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
    // **A second clock, and not a widening of the first** (C22 §2c). `clock` is
    // wall-clock, is drawn as a time of day by the default chrome, and has
    // millisecond resolution — it cannot measure a 0.3 ms paint. SS1's
    // allow-list does not grow: this file was already its only entry.
    elapsed: () => performance.now(),
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

/**
 * How many debug lines one session keeps, and **which end it keeps** (F1001).
 *
 * The sink's loudest writer is C01's stdout redirect — anything written to the
 * real stream while the shell holds the terminal — so a flood is a shape it has
 * to survive: a library logging once a frame fills any buffer in seconds. The
 * cap is small for `debug.retainPayloads`'s reason (C22 §2): a diagnostic mode
 * that doubles memory is one nobody leaves on.
 *
 * **The first N, not the last N**, which is the half worth writing down. A ring
 * keeping the most recent lines discards the one that started the trouble and
 * retains a repeated symptom — and every one of the six narration sites fires
 * once, at the moment of the failure, with whatever follows it being
 * consequence. What is dropped is counted and said.
 */
const DEBUG_LINES = 200;

/**
 * The mark on a drained debug line.
 *
 * Step 3's other five sources are the framework's own voice; a line from this
 * sink may be **foreign output** the redirect caught, so an unmarked drain would
 * put an app's `console.log` on screen indistinguishable from a shell warning.
 * The sink cannot tell the two apart — it is handed a string — so one mark
 * covers both rather than a second channel the finding did not ask for.
 */
const DEBUG_PREFIX = "debug: ";

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
 * 16 ms is `stream`'s window — *~60 frames/s, matching the A02 §7 budget*
 * (F1199) — and 100 ms is the cap the rotation falls back to where `synchronisedUpdate` is
 * absent and a full-frame rewrite would tear (it was `spinner`'s window until
 * F1197 set that at the glyph interval; the tearing cap keeps its own number). Naming
 * them here rather than importing C03's table keeps L4 out of a constant L0
 * tunes at construction; the *reason* is what binds them, and that is asserted.
 */
const ORBIT_MS = 16;

/**
 * The span a `null` profiler yields — one frozen object, so the `using` form
 * reads the same on both arms and the unprofiled path allocates nothing.
 */
const NO_SPAN: Disposable = Object.freeze({ [Symbol.dispose]: () => undefined });

/**
 * The core count, read here because this is the file SS10's sibling rules allow
 * an ambient read in. Reported in the regime, never used for a threshold — a
 * budget is a claim about a machine and this is the machine.
 */
function cpuCount(): number {
  return availableParallelism();
}
const ORBIT_MS_TORN = 100;

/**
 * One revolution in twelve seconds, in radians per millisecond (C22 I74).
 *
 * **The number comes from the measurement rather than from taste.** At 60fps it
 * is half a degree a frame and at 30fps one, at and between the `pi/256` and
 * `pi/64` steps measured at 22% and 30% of a frame's cells changing; at the
 * capped 10fps it is three degrees, just past `pi/64`. Every rate reads as
 * motion rather than as a jump, which is the property the figure has to have
 * (F468).
 */
const ORBIT_RATE = (2 * Math.PI) / 12_000;

/**
 * How long `stop()` waits for a capture still running (C28 I17).
 *
 * **250 ms, and the figure rests on an asymmetry rather than on odds.** A `deep`
 * capture is a `node:inspector` write this component does not control; waiting
 * without a bound makes a shell that will not exit on Ctrl-C, and not waiting
 * loses a file `report()` has already named. A quarter second is long enough
 * for a capture that is finishing and short enough that a reader pressing an
 * exit key does not notice — and what is still open past it is recorded as
 * abandoned rather than dropped, so the cost of the bound being too short is a
 * marked file rather than a missing one.
 */
const CAPTURE_DRAIN_MS = 250;

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
  readonly #sentImages: SentImages = new Map<number, string>();

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
   * Native selection: the reader has asked the app to step back (C16 §5b, C03 §4a).
   *
   * **Real state owned here, beside the other frame queries**, because the two
   * things it drives are both this file's: the scheduler it suspends and the
   * mouse tracking it turns off. `FocusInputs.nativeSelection` reads it and
   * `activeTarget` does the rest — it is a *target*, not a third mode beside
   * navigate and interact (roadmap 15's ruling, C26 I2's argument unchanged).
   */
  /**
   * C28, or `null` — and `null` is the overwhelming case (C22 I92).
   *
   * At tier `off` there is no object at all rather than an object with an early
   * return in every method, so what an unprofiled session pays is one
   * `undefined` check at each seam.
   */
  #profiler: Profiler | null = null;

  #nativeSelection = false;

  /**
   * Semantic copy mode's whole state, or `null` when the mode is not up
   * (C14 §6a, C16 §5d, `R-SEL-005`, `R-SEL-008`).
   *
   * **One field rather than a boolean beside a selection**, and that is the
   * choice `R-SEL-005` makes for us: *a selection is state within a rung rather
   * than a rung of its own*. Two fields can say *not in the mode, three entries
   * selected*, which is the state the two-press escape would then have to
   * defend against; one field cannot express it.
   *
   * `caret` is an entry id and **not C26's focus**. The two hold the same shape
   * and differ in what they may cross: `extendRow` refuses a changed entry
   * because a focus that wandered between entries is F764, and a copy-mode
   * selection crosses entries by construction — `A` takes all the loaded ones.
   * So C26's focus is what the caret is seeded from, not where it lives.
   */
  #semantic: SemanticMode = null;

  /**
   * Where `ConstructDeps.debug` lands, and **it landed nowhere until now**
   * (F1001, for F864).
   *
   * The chain was complete in every direction but this one. `debug?:` is
   * declared on `ConstructDeps`, forwarded into C01 and C06's runner by
   * `construct.ts`, and called from seven real sites — C01's stdout redirect,
   * `beforeRelease threw`, `release: N sequence(s) failed`, `acquire failed
   * midway`, the `SHELL=…` fallback and two `handoff failed to spawn` arms.
   * Every hop compiled and every hop was correct on its own, because the
   * parameter is optional at each of them; what was missing was an **argument at
   * the one call site that starts the chain**, and `start()` below passed five
   * deps and then six without ever passing this one. So both forwards took their
   * `=== undefined` branch and all seven sites defaulted to a no-op in every
   * real session.
   *
   * The first site is the one that cost something: output that would corrupt the
   * alternate screen is caught, handed here, and was dropped.
   *
   * **Drained at step 3 of `stop()` and never before it**, for C01 I4's reason —
   * a diagnostic written onto the alternate screen is discarded with the screen.
   */
  readonly #debug: string[] = [];

  /** Lines the cap refused, reported rather than silently absent. */
  #debugDropped = 0;

  constructor(private readonly config: ResolvedConfig) {}

  get session(): SessionSnapshot {
    return this.#graph?.session.snapshot ?? emptySnapshot(this.config);
  }

  openSurface(surface: ChildSurface): ChildSurfaceHandle {
    if (this.#state !== "running" || this.#graph === null) {
      throw new SessionStateError("openSurface", this.#state);
    }
    return this.#graph.surface.open(surface);
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

    // **C28, constructed here and nowhere else** (C22 I93). The seams below are
    // functions this root was going to hand down anyway, so nothing under
    // `src/shell/` imports the profiler and no import edge is added. With no
    // `profile` field there is no object, and each seam costs one check (I92).
    //
    // **Gated on the tier, not on the field being present** (C28 I1). This read
    // `this.config.profile !== undefined`, so `profile: { tier: "off" }` built
    // the recorder *and* called `createResourceProbe`, which enables
    // `monitorEventLoopDelay` and connects a GC `PerformanceObserver` for the
    // life of the process. An application that had explicitly asked for nothing
    // got the whole apparatus, and two files carried a comment saying it did
    // not. The tier is the switch; the field only says which tier.
    //
    // The probe is constructed only at a tier that samples, for the same
    // reason one level down: below `spans` nothing reads it, and enabling a
    // histogram nobody snapshots is cost with no reader.
    //
    // **The inspector is constructed only at `deep`**, one rung above the probe
    // and for the sharper version of the same reason: connecting an inspector
    // session is cheap, and a session that exists can be posted to. A capture
    // is a 2.6-second stall and a 60 MB file at the sizes measured in
    // `node.ts`, so the apparatus that can take one is not present at a tier
    // that did not ask for it.
    //
    // **`captureDir` is resolved here because this is the only place that knows
    // both halves** (C22 I95, F901). The recorder's default is the literal
    // `.calcium/profile`, which agreed with the invariant only because
    // `DEFAULT_STATE_DIR` is `.calcium` — an application setting
    // `stateDir: "/var/lib/app"` got its heap snapshots in `./.calcium/profile`,
    // outside the directory it asked its state to live in and outside the
    // `.gitignore` of `*` that C22 I67 writes there. The recorder keeps its
    // literal for a profiler constructed without a session; a session supplies
    // the resolved path, so the two cannot disagree about which directory the
    // ignore rule covers.
    // The default is the recorder's, read rather than restated (F967).
    const profileTier = this.config.profile?.tier ?? DEFAULT_TIER;
    if (this.config.profile !== undefined && isRecording(profileTier)) {
      this.#profiler = createProfiler({
        ...this.config.profile,
        captureDir: this.config.profile.captureDir ?? `${this.config.stateDir}/profile`,
      }, {
        elapsed: this.config.elapsed,
        // **The untapped `elapsed`, for the sampler's stamp** (C28 I53, F971).
        // `config.elapsed` is the recording tap when one is on; the sampler is
        // the one periodic reader in the process, and a periodic read on the
        // positional channel lands at a position the replay never reaches.
        sampleClock: this.config.sampleClock,
        ...(isSpanning(profileTier)
          ? { probe: createResourceProbe() }
          : {}),
        ...(profileTier === "deep"
          ? { inspector: createInspector(this.config.elapsed, captureIo()) }
          : {}),
        schedule: this.config.schedule,
        node: process.version,
        cpus: cpuCount(),
      });
    }

    this.#graph = await constructGraph(this.config, {
      stop: (reason) => this.stop(reason),
      ...(this.#profiler === null ? {} : { profiler: this.#profiler }),
      // **Two functions now, and they were one** (I55). C03 has distinguished
      // them since it was written — `writeFrame` calls `repaint` when the
      // screen's contents are unknown and `render` otherwise — and L4 handed it
      // the same callback twice, so the entire invalidation mechanism reached
      // nothing. `frame-scheduler.ts` reasons about *"diffing against a screen
      // whose contents nobody knows"*, which only means something once one of
      // these two diffs and the other does not.
      render: (reason) => this.#render(reason),
      repaint: (reason) => {
        this.#lastFrame = null;
        this.#render(reason);
      },
      frame: this.#frameQueries(),
      // **The argument the chain was missing** (F1001, for F864). Not optional
      // here on purpose: an optional parameter no caller supplies is exactly the
      // state this closes, and nothing in the enforcement suite asks which ones
      // those are.
      debug: (line) => {
        this.#recordDebug(line);
      },
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
      // **Torn down before the throw, because the graph outlives the refusal
      // otherwise** (F140). `constructGraph` has already run: a history file is
      // open, the transport's stores are live, and §3b's timers are armed. An
      // author who catches this rejection and carries on therefore has a process
      // that never exits — measured under a PTY at 6 s and counting, with the
      // rejection caught and the next line printed.
      //
      // **Uncaught it looks fine, which is why it survived**: node prints the
      // named message and exits 1 with the handles still held, so the defect is
      // invisible on the path everyone takes and total on the one that matters.
      //
      // `fault` for its exit code — 1, the same code the uncaught path gives —
      // and it is the fourth of the five reasons to reach `stop()` rather than
      // the third (I4). C01's own `fault` still does not arrive here; this one
      // is C22's, taken before anything was acquired, so `release()` finds
      // `held` empty and emits nothing (C01 I8, I20) — which is what T3.20's
      // *nothing was acquired* assertion continues to hold.
      const cause = unusableCause(this.config.env);
      await this.stop("fault");
      throw new UnusableTerminalError(cause);
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
      // **The slot is taken here and filled later** (I99, F158, F1024). This is
      // the line that orders the greeting against every submission: the
      // reservation is appended now, synchronously, before anything can be
      // typed, and the document that arrives 2.58–4.47 s later settles into it.
      // Nothing below waits on the producer and nothing needs to.
      const slot = graph.pipeline.reserveGreeting();
      void (async () => {
        try {
          // **The context comes from the pipeline, not from here** (C22 I53).
          // This file holds the lifecycle, the capabilities and the registry
          // and could assemble a second one; one builder is the point.
          graph.pipeline.greeting(
            await greeting(graph.pipeline.producerContext()),
            slot,
          );
        } catch {
          // Contained. The prompt is already usable and the session is running;
          // a welcome that could not reach its far side is not a startup fault.
          //
          // **And the slot is released** (I99). Left alone it stays streaming,
          // and C13 never evicts a streaming entry — an empty reservation would
          // sit under the cap for the life of the process. Settled it is
          // invisible and evictable, which is what I44 now says instead of
          // *produces no entry*.
          graph.pipeline.abandonGreeting(slot);
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

  // **`async`, and the synchronous prefix is preserved rather than lost.** An
  // async function runs to its first `await` synchronously, and the only one is
  // the capture drain below — after the state changes and the spinner's
  // disposal, before the report. So `stop()` still returns with the session
  // already marked stopped, which is what C23 checks before accepting a
  // submission (C28 I17).
  async #runStop(reason: StopReason): Promise<number> {
    const code = EXIT_CODES[reason];
    const graph = this.#graph;

    // C28 I15 — **the `end` line, written on every stop path including the one
    // where nothing was constructed.** Its `open` count is what tells a replay
    // that a stream was still running, and a recording with no `end` at all is
    // the other half of the same signal: both read as truncated, because both
    // are, and a recorder that only writes `end` on the clean path makes an
    // orderly shutdown indistinguishable from a kill.
    this.config.recording?.end();

    // T1.9, T3.15 — nothing acquired, no cleanup, and **no flag says so**:
    // there is no lifecycle to release, because construction never reached
    // step 7. The absence is structural rather than recorded (§8a).
    if (graph === null) {
      this.#state = "stopped";
      return code;
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
    void graph.surface.close("session");

    // **1a — C28, and it had no call site at all** (C28 I2). `createProfiler`
    // was constructed in `start()` and disposed by nothing, so
    // `monitorEventLoopDelay`'s histogram stayed enabled and the GC
    // `PerformanceObserver` stayed connected for the whole life of the process
    // — a profiler leaking two process-wide handles is the defect it exists to
    // find. Beside `pipeline.dispose()` for the same reason: the sampler
    // re-arms itself off the injected timer, so a session that stops between
    // two ticks holds a timer that holds the process open.

    // **The report is taken here and not one line down** (C28 I38) — on
    // asymmetry, because nothing observable separates the two orders today
    // (F883). `report()` reads `probe.spaces()`, and taking it after `dispose()`
    // was expected to empty `heapSpaces`; it does not, 11 spaces either side,
    // because `node.ts`'s read has no dependency on a live probe. What keeps the
    // order is that it costs nothing and the alternative rests on a disposed
    // member still answering — which `capture()`, disposed the same way, refuses.
    // **The bounded wait comes before the report, not before the release**
    // (C28 I17, T3.5). A capture still running holds a file the report has
    // already promised a path to, so waiting after `report()` would name a file
    // whose contents were still arriving. The bound is what stops a shell that
    // will not exit; what is still open past it is abandoned and *recorded* as
    // abandoned, so the reader is told which file to disbelieve.
    if (this.#profiler !== null) await this.#profiler.drain(CAPTURE_DRAIN_MS);
    const onReport = this.config.profile?.onReport;
    if (onReport !== undefined && this.#profiler !== null) onReport(this.#profiler.report());
    this.#profiler?.dispose();

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

    // **The sixth channel, and it is the session's rather than the graph's**
    // (F1001, for F864). `graph.diagnostics()` above is a pull over five
    // component collections; this is a push from a sink C01 and C06 were handed
    // and nothing ever read. It drains here for the same reason they do — the
    // release has happened, so the primary screen is back and a line written
    // now survives — and it is a separate statement rather than a sixth entry in
    // that list because the list is a pull over things the graph holds and this
    // is not one of them.
    for (const line of this.#debug) this.config.stdout.write(`${DEBUG_PREFIX}${line}\n`);
    if (this.#debugDropped > 0) {
      this.config.stdout.write(
        `${DEBUG_PREFIX}${String(this.#debugDropped)} further line(s) dropped at the ${String(DEBUG_LINES)}-line cap\n`,
      );
    }

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
  /**
   * One `debug` call, split into lines and capped (F1001).
   *
   * **A call is not a line.** Six of the seven writers hand over one sentence
   * with no newline; C01's redirect hands over whatever chunk was written to
   * `stdout`, which is `"a\nb\n"` for two `console.log`s in a row and `"x"` for
   * a partial write. Splitting is what makes the cap count lines rather than
   * calls, and it is what stops the drain below emitting a blank row per
   * captured `console.log` — a trailing newline yields an empty tail on every
   * one of them.
   *
   * An empty line is dropped rather than kept: it carries no diagnosis, and the
   * cap is small enough that spending an entry on one is a line lost.
   */
  #recordDebug(chunk: string): void {
    for (const line of chunk.split("\n")) {
      if (line === "") continue;
      if (this.#debug.length >= DEBUG_LINES) {
        this.#debugDropped += 1;
        continue;
      }
      this.#debug.push(line);
    }
  }

  #render(reason: CommitReason = "input"): void {
    const graph = this.#graph;
    if (graph === null || !graph.lifecycle.acquired) return;

    // **The frame's brackets, and the reason C03 chose** (C28 I16). Decoration:
    // the profiler is `null` unless the app asked for one, so an unprofiled
    // session pays one check here.
    const prof = this.#profiler;
    prof?.beginFrame(reason);
    const frameSpan = prof?.span("frame");

    // **The composition is `render-frame.ts`'s and this calls it** (C22 I54,
    // C24 I25). It lived here as a private method returning `void`, which made
    // it a sequence nobody could name — and the reason that matters now rather
    // than in the abstract is the render chain: diffing, caching, block
    // windowing and a cap arrive as one change, and a consumer reading frames
    // through `expectDocument().lines()` stays on the production path across
    // all four only if there is one composition. A03's SS48 says so.
    const result = composeFrame({
      composed: () => {
        using _s = prof?.span("compose") ?? NO_SPAN;
        return this.#composed();
      },
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
      // it (I55). A fallback is a frame's *absence* — counted, and kept out of
      // every duration histogram (C28 I6).
      this.#lastFrame = null;
      drawFallback(result.size, (s) => void graph.lifecycle.writer.write(s));
      frameSpan?.[Symbol.dispose]();
      prof?.endFrame("fallback");
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
    // **The guard is asked before the argument is built** (F889). The `flatMap`
    // below walks every block in every transcript entry, every frame, to hand
    // the result to a function whose first line returns `""` unless the
    // terminal speaks kitty — 90 µs and an eight-thousand-element array at two
    // thousand entries, for nothing, on every terminal that does not.
    const bytes =
      (transmits(graph.capabilities)
        ? transmitFrame(
            // **One group per layout run, because that is where the width is**
            // (C22 I98, F1062). The scope is still the entry — the `flatMap`
            // that once stood here lost the only thing that makes a block id
            // unique, and the seam and `visibleRows`' context take the scope
            // together or neither does — but an entry is *two* runs when it is a
            // card, at two widths, and the seam was taking the frame's for both.
            // `entryLayout` is the same function `visibleRows` renders through,
            // so the two cannot compute different numbers rather than agreeing
            // to. It partitions blocks and no run is measured here, which is why
            // this is affordable over every entry rather than the visible ones.
            graph.transcript.entries.flatMap((e) =>
              entryLayout(e.doc.blocks, regionWidth(graph.lifecycle.size().columns))
                .filter((run) => !run.blank)
                .map((run) => ({ scope: e.id, blocks: run.blocks, width: run.width })),
            ),
            graph.capabilities,
            this.#sentImages,
            // The **region's** width — the fallback for a group declaring none,
            // and the declared cell box is a render-time fact that was a
            // hardcoded `1` before F380.
            //
            // **`regionWidth` rather than the region** (I109, §6l.9 row 7): the
            // write seam runs after `composeFrame` has returned and holds no
            // `Composed`, so the one implementation is reached for rather than
            // the value. Spelling `columns - 1` here is what the helper exists
            // to prevent — this seam and the layout above must read the number
            // the blocks were measured at, and at 80 columns a card-nested
            // picture declared 80 cells wide and addressed across 76 is what
            // F1026 measured going wrong one width along.
            regionWidth(graph.lifecycle.size().columns),
            graph.probe,
          )
        : "") + result.write;
    {
      // The write seam — A01 Appendix B's first row, and the one figure that
      // cannot be taken from outside the process.
      using _write = prof?.span("write") ?? NO_SPAN;
      graph.lifecycle.writer.write(bytes);
    }
    prof?.count("bytes.written", bytes.length);
    prof?.count("rows.written", result.lines.length);
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

    frameSpan?.[Symbol.dispose]();
    prof?.endFrame("frame");
  }

  /**
   * The third link, and the one recorded nowhere (F227).
   *
   * C03 declares a `spinner` commit reason, tunes its window (80 ms, F1197) and
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
      const entry = entryById(graph.transcript.entries, req.entryId);
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
    // key, and 16 ms is one frame at a rate a reader cannot see.
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
    if (spinnerMs === null && orbitMs === null && framesMs === null) {
      this.#tickAt = null;
      this.#motionAt = null;
      return;
    }
    const now = this.config.clock();
    this.#tickAt ??= now;
    this.#motionAt ??= now;
    // **Armed for when it is due, not for how long it waits** (I105, F1197).
    // This runs out of `#render`, which sits at the end of C03's window, so a
    // delay of the full interval from here laid the window and the interval
    // end to end: 80 + 100 ms for the braille spinner, 33 + 33 for the orbit,
    // every animation at half the rate I60a and I73 state. The stamps below are
    // the ones `#animate` advances, so a wake already due fires at once and the
    // next frame follows one window later — the period is the longer of the
    // two, which is what *floor* meant.
    let due = Number.POSITIVE_INFINITY;
    if (spinnerMs !== null) due = Math.min(due, this.#tickAt + spinnerMs);
    if (orbitMs !== null) due = Math.min(due, this.#motionAt + orbitMs);
    if (framesMs !== null) due = Math.min(due, now + framesMs);
    this.#spinner = this.config.schedule(() => void this.#animate(), Math.max(0, due - now));
  }

  /**
   * One wake: advance whatever is moving, then ask for a frame (I73, I74).
   *
   * **The reason is the frame rate and the interval is not.** `commit("spinner")`
   * draws at its window's rate however fast this fires, because C03's window is
   * a floor under the ticker (I60a, I105) — so a live orbit commits `stream`, whose
   * rationale in C03 §3 is a rate ceiling and says nothing about the source.
   * Everything else keeps `spinner`, and C03 §3's asymmetry is exactly this
   * case: a stream commit under a pending spinner draws within its own 16 ms.
   */
  #animate(): void {
    const graph = this.#graph;
    if (graph === null) return;
    // **The one clause of the freeze the hold cannot reach** (C14 I35,
    // `R-SEL-009`). Elapsed counts are content and freeze with the view; the
    // spinner's frame index is a counter on this object that no document
    // carries, so a perfectly held document still draws a turning spinner. The
    // wake is dropped whole — tick, orbits and image frames — and the ticker
    // re-arms out of the next render, which is the frame the exit commits.
    if (this.#semantic !== null) return;
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
    // keeps the remainder, so a GIF beside a 16 ms orbit shows each frame for
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

  /**
   * A replacing question's rows, or `null` — **one record, two readers**
   * (C23 I74, C22 I80, §7f, §101).
   *
   * §101's approval and choice take the prompt's rows because the prompt has no
   * job while they are up. That is one number, and C22 T6.30 is what two
   * records of it cost the last time: the frame reserved one row while the
   * paint was handed the editor's real rows, and a wrapped prompt drew as a
   * lone elision marker. So the measurer and the painter both come here.
   *
   * **Cached on the content's identity**, which is `chrome.layer`'s own key: the
   * confirm host replaces the array when the selection moves, so the identity is
   * exactly when the rows change.
   */
  #questionRows(graph: Graph, width: number): readonly string[] | null {
    const layer = graph.confirm.replacing;
    if (layer === null || layer.content.length === 0) return null;
    const render = (blocks: readonly Block[], w: number): readonly string[] =>
      renderSequenceToLines(graph.blocks, blocks, w, {
        theme: graph.theme.current,
        capabilities: graph.capabilities,
        motion: graph.motion,
      });
    return graph.chrome.layer(layer.content, width, graph.theme.current.name, render);
  }

  #paintDeps(graph: Graph, frame: Composed): PaintDeps {
    // **The region's width, and every dep below draws content** (I109, §6l.9
    // rows 3–4). The transcript's rows, the prompt's rows, its cursor and its
    // selection spans are all laid out at this; the paint pads them to
    // `frame.size.columns`, which is where the rules and the chrome are drawn.
    // One local, because a frame carrying two widths fails by a composer
    // reading the wrong one and a second `frame.size.columns` here is that
    // failure spelled harmlessly.
    const width = frame.region.width;
    return {
      registry: graph.blocks,
      theme: graph.theme.current,
      capabilities: graph.capabilities,
      motion: graph.motion,
      ...(graph.probe === undefined ? {} : { probe: graph.probe }),
      // **The layer host, and it is the one `/live` draws into** (C12 I107).
      chrome: graph.chrome,
      scratch: graph.scratch,
      // C14 selected these at this width; the paint pads them and never
      // re-measures (C09 I1 — one implementation, or the two answers drift).
      // **Both take the frame's width from the frame**, not from a fresh
      // `size()`. A closure that re-read it is exactly the two-width frame the
      // note names, arriving through the one seam that looks harmless.
      transcriptRows: () =>
        visibleRows(
          graph,
          width,
          this.#tick,
          (animated) => {
            this.#animation = animated;
          },
          // **The `Profiler`, not `graph.probe`, and the difference is the
          // layering** (C28 I42). `entry()` sits beside `element()` on L4's
          // interface because a transcript entry is a shell concept: no block
          // renderer has one, so publishing it at L0 would be a member nothing
          // below `src/shell/` could ever call.
          this.#profiler,
          // **The selection and the spans it was taken over** (C14 I39). Null
          // outside the mode, which is every frame the reader is not copying —
          // so the wash costs one comparison and the render path is unchanged.
          this.#semantic === null
            ? null
            : { blocks: this.#semantic.blocks, spans: this.#selectionSpans(width) },
        ),
      // **The question's rows when one replaces the prompt** (C23 I74, §7f).
      promptRows: () => this.#questionRows(graph, width) ?? graph.editor.layout(width, PROMPT_GUTTER),
      // **No caret in a replaced prompt.** §101 draws the `▌` only once the
      // reader has chosen `reply…` and the prompt has come live beneath the
      // question; a caret left at the editor's position would sit inside the
      // question's box, on a row the editor did not write.
      promptCursor: () =>
        this.#questionRows(graph, width) === null
          ? graph.editor.cursorCell(width, PROMPT_GUTTER)
          : { row: 0, col: 0 },
      promptReplaced: () => this.#questionRows(graph, width) !== null,
      // **The wash, mapped through the same walk the rows came from** (C17 I18,
      // roadmap entry 23). `selection` is read here rather than a
      // `selectionSpans` method being added to `LineEditor`, because the guard
      // and the mapping both belong to whoever knows the width — and a method
      // whose only caller is the painter is a member the editor does not need.
      //
      // Empty when there is no region, which is the common case and costs one
      // frozen array.
      promptSelection: () => {
        // **Nothing is selected in a prompt that is not there** (C23 I74). The
        // spans are cell ranges into the editor's rows, and the rows on screen
        // are the question's — so a live region would wash cells of a box it
        // has no coordinates in.
        if (this.#questionRows(graph, width) !== null) return EMPTY_SPANS;
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
      // **The fifth caller of the one walk** (C17 I18, I26, §5c). A chip's
      // ground is measured where its label was drawn or it is somewhere else,
      // which is the same argument `promptSelection` above rests on.
      promptChips: () =>
        chipSpans(graph.editor.text, width, PROMPT_GUTTER, graph.editor.drawAs),
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
      // **A replacing question is drawn in the prompt's slot, not here** (C23
      // I74, §7f). It stays on the stack — C16's ladder reads the stack, and a
      // question nothing routes keys to is not a question — so what changes is
      // where it is painted and nothing else.
      overlays: () => {
        const replacing = graph.confirm.replacing;
        const placed = graph.overlays.layout(frame.overlayRegion);
        return replacing === null ? placed : placed.filter((p) => p.layer !== replacing);
      },
    };
  }

  /**
   * Both halves of native selection, in one place because they are one transition.
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
  #setNativeSelection(on: boolean): void {
    const graph = this.#graph;
    if (graph === null || this.#nativeSelection === on) return;
    this.#nativeSelection = on;

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

  /**
   * Enter semantic copy mode, seeding the caret (C14 §6a, `R-SEL-008`).
   *
   * **The seed is C26's focus, falling back to the last loaded entry.** A caret
   * that started nowhere would make `a` a no-op on the reader's first keystroke
   * in a mode whose first keystroke is usually `a`, and *nothing happened* is
   * the report an empty selection and a missing caret both produce.
   */
  #enterSemanticSelection(): void {
    const graph = this.#graph;
    if (graph === null || this.#semantic !== null) return;
    const stored = graph.focus.current;
    const entryId =
      stored.at === "liveBlock" ? stored.entryId : (graph.transcript.entries.at(-1)?.id ?? null);
    // **Row 0 of the entry** (C14 I36). The caret is an entry plus an
    // entry-local row and the focus store holds only the entry, so the top of it
    // is where the reader is put — the same place a `⇧↓` from a fresh mode would
    // start extending from.
    this.#semantic = semantic.enter(this.#semantic, entryId === null ? null : { entryId, row: 0 });
    // **The hold, and it is the view rather than the record** (C14 I31, §6b).
    // Taken at the width and height the last frame composed, because a held
    // document measured at anything else describes rows nobody is looking at.
    graph.freezeView(this.#composed().region);
    this.#spans = null;
    graph.scheduler.commit("input");
  }

  /**
   * Every block's entry-local rows over the document the frame is drawing
   * (C14 I36, §6c).
   *
   * **Memoised on the document and the width**, because the document is held
   * while the mode is up (I31) so the spans cannot move under a keystroke — and
   * without the memo every arrow re-measures the whole transcript. The width is
   * in the key because a resize re-lays the held document, which is the one
   * thing that does move them.
   */
  #spans: Readonly<{ at: readonly unknown[]; width: number; spans: readonly semantic.BlockSpan[] }> | null =
    null;

  /**
   * `at` is the frame's own width where the caller has one.
   *
   * **The render path passes it and never lets this reach `#composed()`**: the
   * spans are read from inside the composition, so a call that composed a frame
   * to find a width would compose one from inside one. The key handlers have no
   * frame in hand and ask for the last one's region, which is the same number a
   * keystroke later.
   */
  #selectionSpans(at?: number): readonly semantic.BlockSpan[] {
    const graph = this.#graph;
    if (graph === null) return [];
    const entries = graph.documentEntries;
    const width = at ?? this.#composed().region.width;
    const held = this.#spans;
    if (held !== null && held.at === entries && held.width === width) return held.spans;

    const spans: semantic.BlockSpan[] = [];
    for (const entry of entries) {
      for (const { blockId, element } of elementsOfEntry(
        graph.blocks,
        entry.doc.blocks,
        width,
        entry.doc.command,
      )) {
        // **Block-level elements only.** A row or a cell is finer than the
        // selection's unit, and taking their spans would put the same block in
        // the set once per row — which reads as a count that climbs while the
        // selection does not change (C14 I38).
        if (element.level !== "block") continue;
        spans.push(
          Object.freeze({
            key: semantic.keyOf(entry.id, blockId),
            from: element.rows.from,
            to: element.rows.to,
          }),
        );
      }
      // **And every block that offers no element** (C14 I51, `R-SEL-003`). Prose
      // is not focusable and is still a block: `R-SEL-004` says how it copies,
      // and without a span it could never be reached. Only where no element's
      // rows meet the block's, so a block already reachable keeps its key and a
      // container's children are not taken twice.
      const own = spans.filter((sp) => semantic.entryOf(sp.key) === entry.id);
      for (const b of blockSpansOfEntry(graph.blocks, entry.doc.blocks, width)) {
        if (b.to <= b.from) continue;
        if (own.some((sp) => sp.from < b.to && sp.to > b.from)) continue;
        spans.push(Object.freeze({ key: semantic.keyOf(entry.id, b.blockId), from: b.from, to: b.to }));
      }
    }
    const frozen = Object.freeze(spans);
    this.#spans = Object.freeze({ at: entries, width, spans: frozen });
    return frozen;
  }

  /**
   * The gesture in flight, and where its pointer was last reported
   * (C14 §6f, I44).
   *
   * **Two fields and not one**, because the ticker needs the pointer's position
   * on a wake that no report caused — which is the whole of I45: a terminal
   * reports motion when the pointer changes cell and not while it sits still,
   * so the last row *is* the current row until told otherwise.
   */
  #drag: Drag | null = null;
  #dragRow = 0;
  /** The autoscroll's handle — a **second** ticker, because I35 stopped the first. */
  #autoscroll: Disposable | null = null;

  /**
   * A pointer gesture in semantic copy mode (C14 §6f, `R-SEL-012`).
   *
   * The width is taken once and used for all three of the caret, the spans and
   * the boxes: two widths here would put the caret in a different block from
   * the one the spans describe, and the drag would work.
   */
  #semanticDrag(regionRow: number, phase: "press" | "move" | "release"): boolean {
    const graph = this.#graph;
    if (graph === null || this.#semantic === null) return false;
    if (phase === "release") {
      // `R-SEL-013`'s *stops on release*. The selection stays — a release ends
      // the gesture and not the mode.
      this.#endDrag();
      return true;
    }
    const width = this.#composed().region.width;
    const caret = graph.semanticCaretAt(regionRow, width);
    this.#dragRow = regionRow;
    // **A row with no entry under it is most of a drag, not an error.** The
    // pointer is past the container — which is the state `R-SEL-013`'s bands
    // exist for — so the gesture stays alive and the ticker is re-armed for the
    // new distance. Only the caret stops moving, because there is no row to
    // move it to.
    if (caret === null) {
      if (this.#drag === null) return false;
      this.#armAutoscroll();
      return true;
    }

    if (phase === "press") {
      this.#drag = beginDrag(caret, graph.scrollBoxSpans());
      this.#semantic = semantic.placeCaret(this.#semantic, caret);
    } else {
      if (this.#drag === null) return false;
      // **Clamped into the drag's container first** (C14 I50, `R-SEL-013`):
      // a drag begun in a box extends to the box's end and not into the prose
      // around it. A viewport drag is unclamped (I46).
      const order = this.#selectionOrder();
      this.#semantic = semantic.extendTo(
        this.#semantic,
        clampToContainer(caret, this.#drag, graph.scrollBoxSpans(), order),
        this.#selectionSpans(width),
        order,
      );
    }
    this.#armAutoscroll();
    graph.scheduler.commit("input");
    return true;
  }

  /**
   * Arm or re-arm the autoscroll for where the pointer is (C14 I45).
   *
   * **A ticker rather than a response to a report**, which is the rule and not
   * the arithmetic: the wake re-reads `#dragRow` rather than waiting for a new
   * one, so a reader holding the pointer still outside the container keeps
   * scrolling — which is exactly when they are waiting for it to.
   *
   * Re-armed from the current position on every tick, so crossing into another
   * band changes the rate at the next row rather than at the next report.
   */
  #armAutoscroll(): void {
    this.#stopAutoscroll();
    const graph = this.#graph;
    const drag = this.#drag;
    if (graph === null || drag === null) return;
    // **The container's rect, not the frame's** (C14 I45). A drag anchored in a
    // box measuring its distance against the whole region would not autoscroll
    // until the pointer left the screen, and the box would never reach its end.
    const rect = graph.containerRect(drag.container, this.#composed().region.width);
    if (rect === null) return;
    const step = autoscrollFor(drag, this.#dragRow, rect);
    if (step === null) return;
    this.#autoscroll = this.config.schedule(() => {
      this.#autoscroll = null;
      // **The container's end is read out of the container** (`R-SEL-013`):
      // nothing moved means there is nowhere left, so the ticker stops rather
      // than waking forever against a clamp.
      if (!graph.scrollContainerBy(step.container, step.rows)) return;
      this.#extendToEdge(rect, step.rows);
      this.#armAutoscroll();
    }, step.afterMs);
  }

  /**
   * A tick's extend (C14 I49, `R-SEL-013`): *the selection extends to the
   * container's end*. The pointer is outside and still, so no report moves the
   * caret — the row the scroll brought in is at the container's edge, and it
   * joins as though the pointer had moved onto it, through `extendTo`.
   */
  #extendToEdge(rect: Readonly<{ from: number; to: number }>, rows: number): void {
    const graph = this.#graph;
    if (graph === null || this.#semantic === null) return;
    const width = this.#composed().region.width;
    const caret = graph.semanticCaretAt(rows > 0 ? rect.to - 1 : rect.from, width);
    if (caret === null) return;
    this.#semantic = semantic.extendTo(
      this.#semantic,
      caret,
      this.#selectionSpans(width),
      this.#selectionOrder(),
    );
    graph.scheduler.commit("input");
  }

  #stopAutoscroll(): void {
    this.#autoscroll?.[Symbol.dispose]();
    this.#autoscroll = null;
  }

  /** The gesture and its ticker, together — a release, an `esc`, a `⌃c` (C14 I48). */
  #endDrag(): void {
    this.#drag = null;
    this.#stopAutoscroll();
  }

  /** The held document's entry ids, in document order — the extend's axis. */
  #selectionOrder(): readonly string[] {
    return this.#graph?.documentEntries.map((e) => e.id) ?? [];
  }

  /** A plain arrow, and a shifted one (C14 I37, §6c). */
  #moveSemanticCaret(delta: number, extend: boolean): void {
    const graph = this.#graph;
    if (graph === null || this.#semantic === null) return;
    const spans = this.#selectionSpans();
    const order = this.#selectionOrder();
    this.#semantic = extend
      ? semantic.extendCaret(this.#semantic, delta, spans, order)
      : semantic.moveCaret(this.#semantic, delta, spans, order);
    graph.scheduler.commit("input");
  }

  /**
   * `esc` — clear, then leave (C16 I51, §5d D1/D2, `R-SEL-005`).
   *
   * The two presses are one verb asked twice rather than two verbs, because the
   * reader presses the same key both times and the footer is what tells them
   * which press they are on.
   */
  #escapeSemanticSelection(): void {
    if (this.#semantic === null) return;
    // **Every `esc` ends the gesture** (C14 I48, `R-SEL-013`): *stops on esc*
    // names the key, not the outcome, so the press that only clears stops the
    // ticker as surely as the press that leaves.
    this.#endDrag();
    this.#semantic = semantic.escape(this.#semantic);
    // Only the press that *leaves* drops the hold — a clear is state within the
    // rung and the frame stays held (C14 I34, `R-SEL-005`).
    if (this.#semantic === null) {
      this.#spans = null;
      this.#graph?.thawView();
    }
    this.#graph?.scheduler.commit("input");
  }

  /** `⌃c` — leave, and **never clear first** (C16 I51, §5d D5). */
  #exitSemanticSelection(): void {
    if (this.#semantic === null) return;
    // Leaving the mode ends the gesture (C14 I48) — a ticker outliving it would
    // scroll the live transcript the mode just handed back.
    this.#endDrag();
    this.#semantic = null;
    this.#spans = null;
    // One ordinary commit draws the record, and never a repaint: nothing on the
    // terminal became unknown while the view was held (C14 I34, C03 I14).
    this.#graph?.thawView();
    this.#graph?.scheduler.commit("input");
  }

  /**
   * `a` and `A` (`R-SEL-008`).
   *
   * A block is atomic in a selection (`R-SEL-003`), so an entry is in or out and
   * there is no partial state for the count to report. `⌃A` is deliberately not
   * bound: *a key that silently produces a clipboard of megabytes is a trap*.
   */
  #selectEntries(which: "caret" | "all"): void {
    const graph = this.#graph;
    if (graph === null || this.#semantic === null) return;
    this.#semantic =
      which === "all"
        ? // **The view, not the record** (C14 I33, `R-SEL-008`): *the window is
          // not the record* is the rule's own sentence, and `A` selecting an
          // entry that arrived after the freeze selects one the reader cannot
          // see.
          semantic.selectAll(this.#semantic, this.#selectionSpans())
        : semantic.selectCaret(this.#semantic, this.#selectionSpans());
    graph.scheduler.commit("input");
  }

  /**
   * `y` — the selected entries to the clipboard (`R-SEL-004`, `R-SEL-011`).
   *
   * **Document order is the transcript's**, and C09's `copySequence` is what
   * turns each entry's blocks into its source. Neither is reachable from the
   * key table, which is why this is a frame query rather than an effect.
   *
   * **`R-SEL-011`'s refusal is owed and is not here**, and it is blocked on the
   * same parked word the mode label is (C14 §6a). The rule says *if neither is
   * available the mode states it and offers a file instead*, because *a copy
   * that appears to work and does not is the worst outcome available here* —
   * and neither mechanism is built, so the condition holds on every copy this
   * takes. What the rule asks for is *the mode* stating it, and the mode's
   * statement surface is the footer label; a notice block on every `y` is the
   * other reading and is noise on the key a reader presses most.
   *
   * So the refusal lands with the label, and until then the text reaches the
   * kill buffer and nothing claims it reached the system clipboard. That is the
   * honest half: `⌃y` yanks it back, which is a true statement about where it
   * went, and no part of this says otherwise.
   *
   * A copy of nothing is not a refusal and says nothing: the count is on screen,
   * and a notice that fired on an empty selection would be noise on the one key
   * a reader presses repeatedly.
   */
  #copySelectedEntries(): void {
    const graph = this.#graph;
    if (graph === null || this.#semantic === null) return;
    const text = semantic.copyTextOf(
      this.#semantic,
      // **The held blocks, not the record's** (C14 I33, §6b A6). This is the
      // row a paint-path freeze cannot satisfy: the screen would be right and
      // the clipboard would carry text that was never on it, with nothing
      // telling the reader it happened.
      graph.documentEntries.map((e) => ({ id: e.id, blocks: e.doc.blocks })),
      graph.blocks.copySequence,
    );
    if (text === "") return;

    graph.editor.copyText(text);
    graph.scheduler.commit("input");
  }

  #frameQueries(): FrameQueries {
    return {
      nativeSelection: () => this.#nativeSelection,
      semanticSelection: () => this.#semantic !== null,
      semanticSelectionCount: () => semantic.count(this.#semantic),
      enterSemanticSelection: () => this.#enterSemanticSelection(),
      escapeSemanticSelection: () => this.#escapeSemanticSelection(),
      exitSemanticSelection: () => this.#exitSemanticSelection(),
      selectEntryUnderCaret: () => this.#selectEntries("caret"),
      selectAllLoadedEntries: () => this.#selectEntries("all"),
      copySelectedEntries: () => this.#copySelectedEntries(),
      moveSemanticCaret: (delta, extend) => this.#moveSemanticCaret(delta, extend),
      semanticDrag: (row, phase) => this.#semanticDrag(row, phase),
      enterNativeSelection: () => this.#setNativeSelection(true),
      exitNativeSelection: () => this.#setNativeSelection(false),
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
            if (answer.key === "y") void this.stop("eof");
          });
      },
    };
  }

  #composed(): Composed {
    const graph = this.#graph;
    return compose({
      chrome: this.config.chrome,
      // C28 I39 — the `chrome` span, so the app's own header and footer are a
      // phase of their own rather than Calcium's.
      ...(graph?.probe === undefined ? {} : { probe: graph.probe }),
      session: () => graph?.session.snapshot ?? emptySnapshot(this.config),
      // §103's ladder, read from the router rather than re-derived: the owner
      // line and the dispatch that honours it must not be able to disagree.
      owner: () => this.#graph?.router.rung ?? null,
      ownerArmed: () => this.#graph?.router.ownerArmed ?? false,
      // C14 I34 — the hold's only observable, read per frame from the graph
      // where the subtraction lives. Zero on every frame outside the mode.
      bufferedEntries: () => this.#graph?.bufferedEntries ?? 0,
      // A03 SS47 — the owner line draws chords, so the chrome resolves them.
      capabilities: () => graph?.capabilities ?? null,
      // C24 I32 — read per frame from the recorder rather than kept here. A
      // second copy of the figure is a second place for the tier change to miss
      // it, and the recorder is where the ring reset already clears it.
      lastFrame: () => this.#profiler?.lastFrame(),
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
      // **The same number the paint reads, through the same function** (C22
      // I80, C23 I74). A replacing question owns the prompt's rows, so the
      // count the frame reserves is the question's — and it is asked here
      // rather than computed, because this is the pair T6.30 records.
      promptRows: (width, gutter) =>
        (graph === undefined || graph === null ? undefined : this.#questionRows(graph, width)?.length) ??
        graph?.editor.layout(width, gutter).length ??
        1,
      // **The footer's height, from the same measurer C14 uses** (C22 I82).
      // Before the graph exists nothing has a footer to measure; one row is the
      // guess `initialRegionHeight` makes and the first frame corrects it.
      // **And once per content** (C22 I102): the footer's blocks are rebuilt
      // every frame, so the session's memo misses them by identity; the chrome
      // cache keys on their structure and answers the height with the lines.
      measureSequence: (blocks, width) =>
        graph?.chrome.measure("footer", blocks, width, (b, w) => graph.blocks.measureSequence(b, w, graph.measures)) ?? 1,
    });
  }
}

/**
 * One entry by id, in constant time (F914, P11 defect 3).
 *
 * **The array's identity is the revision**, which is what makes a `WeakMap`
 * keyed on it correct rather than a cache someone must remember to clear. C13's
 * store never mutates `#entries` in place — every append, patch, settle and
 * evict rebuilds the frozen array through `map` — so a new array is exactly the
 * moment the index goes stale, and an entry patched in place keeps its id and
 * its slot.
 *
 * The scan it replaces was O(entries) inside a loop over the *visible* entries,
 * run once per frame: measured at 400 entries × 3 visible × 1231 frames, which
 * is 1.5M comparisons a session for a lookup the store could answer in one.
 * The cost is invisible to the span table because the scan is not a phase — it
 * is the loop body's first line, and `visibleRows` has no span of its own.
 */
const ENTRY_INDEX = new WeakMap<object, ReadonlyMap<string, Entry>>();

type Entry = Graph["transcript"]["entries"][number];

function entryById(entries: readonly Entry[], id: string): Entry | undefined {
  let index = ENTRY_INDEX.get(entries);
  if (index === undefined) {
    index = new Map(entries.map((e) => [e.id, e]));
    ENTRY_INDEX.set(entries, index);
  }
  return index.get(id);
}

/**
 * The visible transcript, as rows, at the frame's width.
 *
 * C14 chose the range and the `skipRows`/`takeRows` slice; this renders exactly
 * that slice through C09 and never re-measures. Re-measuring here is C09 I1's
 * divergence in the place that moves the whole frame — the two would agree on
 * ordinary output and part company at a wrap boundary.
 */
/**
 * One row per selected block, at the block's first row (C14 I39).
 *
 * **The spans are the caret's own** (I36), so what is washed and what an extend
 * took cannot disagree — a second walk over the blocks would be a second answer
 * to *where does this block start*. A block whose first row is outside the
 * window contributes nothing here, which is right: the ground goes on the first
 * row and a window that begins below it is showing the body.
 */
function washSelected(
  graph: Graph,
  lines: readonly string[],
  entryId: string,
  from: number,
  width: number,
  selection: SelectionWash,
): readonly string[] {
  const rows = washedRowsOf(selection.spans, selection.blocks, entryId, from, lines.length);
  return washSelectedRows(lines, rows, graph.theme.current, graph.capabilities, width);
}

/**
 * The entry's blocks under a **banded** selection (C14 I54), or `undefined`.
 *
 * Undefined on a theme without a selection band and for an entry with nothing
 * selected, so both key and render exactly as they did before the field.
 */
function washedBlocksOf(graph: Graph, entryId: string, selection: SelectionWash | null): ReadonlySet<string> | undefined {
  if (selection === null || !isBand(graph.theme.current, "selection")) return undefined;
  const ids = new Set<string>();
  for (const key of selection.blocks) {
    if (semantic.entryOf(key) === entryId) ids.add(key.slice(key.indexOf("\u0000") + 1));
  }
  return ids.size === 0 ? undefined : ids;
}

/** What the wash needs: the selection and the spans it was taken over (I39). */
type SelectionWash = Readonly<{
  blocks: ReadonlySet<string>;
  spans: readonly semantic.BlockSpan[];
}>;

function visibleRows(
  graph: Graph,
  width: number,
  tick: number,
  onAnimation: (animated: Animated) => void,
  profiler: Profiler | null,
  selection: SelectionWash | null,
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
  // reason, and **not where the terminal is animating it** — which is `kitty`
  // *and a placement the encoding can address*, not the capability alone. This
  // line read `imageProtocol !== "kitty"` and the block chose its arm from the
  // box, so a picture past `MAX_PLACEHOLDER_SPAN` fell to the half block while
  // the session armed nothing: frame 0, for ever (F624, F1026). The arm is
  // asked per image now, of `placesAtProtocol`, at the width the run rendered
  // it at. On the halfblock and dither arms each frame is a text frame, which
  // is the orbit's own cost and no more.
  const frames: { entryId: string; blockId: string; delays: readonly number[] }[] = [];
  // **The view, not the record** (C14 I31, §6b). `graph.viewport` is already
  // the held one through its getter; these are the entries it was measured
  // over, and reading the record here would draw a document whose heights the
  // index does not have.
  const document = graph.documentEntries;
  for (const ve of graph.viewport.visible().entries) {
    const entry = entryById(document, ve.id);
    if (entry === undefined) continue;
    // **Whose work the elements below belong to** (C28 I42). A block id is
    // unique within its own document (C04 I14) and a transcript holds many, so
    // without this two entries showing a block with the same id are one row in
    // `nodes` — and the merged row's `calls / frames` is the sum of their
    // numerators over one denominator, which is exactly the layout-thrash
    // signal `calls` is kept beside `frames` to give. Measured at 2.3 per frame
    // true against 5.3 reported (F892).
    //
    // Here rather than anywhere else because this is where the id and the work
    // meet: `windowEntry` and the render below both reach the registry, whose
    // wrapper sees a `Block` and nothing about where it came from.
    using _entry = profiler?.entry(entry.id) ?? NO_SPAN;
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
    // **Through the entry's layout, not over the document's blocks** (C22 I83,
    // I84, I85; §6l.4 D, §6l.6). A card's body sits four cells in under a hook at
    // the header's text column and is windowed, measured and rendered at
    // `width − 4`; every entry closes with one blank row — both by the same
    // `entryLayout` the measurer wrapper in `construct.ts` calls, so the rows C14
    // counted are the rows drawn here. A document that is not a card is one run
    // at `width` and the blank.
    // **Through the session's memo** (C22 I100, C09 I70): the layout's runs
    // were measured by C14 through the same `WeakMap` when it chose the range,
    // so on a still document the window here reads every height back and
    // measures nothing. Two closures per frame, against the ~850 measures per
    // frame they replace on `/all` (F1160).
    const memoised = {
      measureSequence: (run: readonly Block[], w: number) => graph.blocks.measureSequence(run, w, graph.measures),
      windowSequence: (run: readonly Block[], w: number, lo: number, hi: number, _memo?: unknown, scratch?: RenderScratch) =>
        graph.blocks.windowSequence(run, w, lo, hi, graph.measures, scratch),
    };
    // **The scratch travels with the memo** (I100, F1191): the window seam holds
    // the cap form (C09 I76) and the patch's plan (C25 I22) across frames.
    const pieces = windowEntry(entryLayout(entry.doc.blocks, width), from, to, memoised, graph.scratch);
    const windowed = { blocks: pieces.flatMap((piece) => piece.windowed.blocks) };

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
    }

    // **Over the pieces rather than the flattened set, because the arm reads a
    // width** (C09 I67, F380). A card's body renders four cells in, and a
    // placement is refused on a box `imageCells` derives from *that* width — so
    // an image inside a card asked at the frame's width would be answered about
    // a placement the frame never drew.
    for (const piece of pieces) {
      for (const blk of piece.windowed.blocks) {
        for (const b of [blk, ...descendants(blk)]) {
          if (b.kind !== "image") continue;
          if (placesAtProtocol(b as Image, graph.capabilities, piece.run.width, graph.probe)) continue;
          const animation = framesOf(b as Image, graph.probe);
          if (animation === null) continue;
          frames.push({ entryId: entry.id, blockId: b.id, delays: animation.delays });
        }
      }
    }

    const cadence = animationIntervalOf(windowed.blocks);
    if (cadence !== null && (fastest === null || cadence < fastest)) fastest = cadence;
    // **The tick is its own axis, not a suffix of the slot** (C22 I103, F1189).
    // Folded into the slot every spinner tick was a `focus` miss, which drops
    // the parts, and the entry rendered whole every 80 ms for one glyph.
    const tickKey = cadence === null ? "" : String(tick);
    // **The range is its own axis, beside the stable key** (C22 I101): a miss
    // on it alone keeps the parts, and the render below assembles from them.
    // **The tenth axis, and only where the picture depends on it** (C14 I54).
    // On a theme that bands its selection a washed call head draws its state's
    // own mark, so the selection changes what is rendered there — and only
    // there. Everywhere else it is absent and keys nothing, which keeps I40's
    // reason for refusing the axis true on every theme it was written about.
    const washed = washedBlocksOf(graph, entry.id, selection);
    const washedKey = washed === undefined ? "" : `\u0000${[...washed].sort().join("\u0001")}`;
    const slot = `${key}\u0000${offsets}\u0000${orbitKey}\u0000${cursorKey}\u0000${framesKey}\u0000${seriesKey}${washedKey}`;
    const held = graph.rendered.get(entry.id, entry.rev, width, slot, theme, range, tickKey);
    // **An animating block is never taken from the parts** (C22 I103): on a
    // tick miss its held rows are the last tick's, and on a range miss the
    // one small render it costs is the price of not asking which miss this was.
    const parts = held === undefined ? withoutAnimating(graph.rendered.parts(entry.id), pieces) : undefined;
    // **Faults from here are this entry's** (I69). A `BlockFault` names a block
    // and ids are unique within a document and not across entries (C04 I14), so
    // neither half addresses anything on its own. A scope rather than a field,
    // because the render that produces the fault is one call and the caller is
    // what knows which entry it is drawing.
    const fresh =
      held === undefined
        ? graph.blockFaults.within(entry.id, entry.rev, () =>
            renderEntryPieces(graph.blocks, pieces, {
        theme: graph.theme.current,
        capabilities: graph.capabilities,
        motion: graph.motion,
        ...(graph.probe === undefined ? {} : { probe: graph.probe }),
        // **The third field, and the context was shipped with two** (C16 §3).
        // Focus was stored, derived and routed, and a focused row rendered
        // exactly like an unfocused one because nothing ever put it in the
        // context C09 reads it from. Every reference existed and the seam was
        // still broken — a partially-populated context, which counting
        // references cannot see.
        focus,
        ...(washed === undefined ? {} : { washed }),
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
          // The placement scope, beside `frames` and for the same reason: it is
          // the entry, and the seam is handed the same id (C09 I66, F987).
          placementScope: entry.id,
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
        }, parts),
          )
        : null;
    const lines = held ?? fresh?.rows ?? [];
    if (fresh !== null) {
      for (const fault of fresh.faults) {
        graph.blockFaults.note(
          `entry ${entry.id}: C09 drew ${String(fault.drawn)} rows where measure ` +
            `committed ${String(fault.expected)} (C09 I1) — the frame keeps ${String(fault.expected)}, ` +
            `and anything below the overflow in this entry is dropped`,
        );
      }
      graph.rendered.set(entry.id, entry.rev, width, slot, theme, range, lines, tickKey);
    }

    // The pieces are already the window's rows (`windowEntry` took `[from, to)`),
    // so only the chrome is sliced here.
    const keptChrome = chrome.slice(Math.min(ve.skipRows, chrome.length));
    // **The selection's ground, after the cache was written** (C14 I39, I40).
    // The slot above already holds `lines`; this washes a copy, so nothing
    // selection-dependent can be served to a later unselected read — which is
    // C22 I71's *correct frame, previous state*, the symptom whose report says
    // *it froze*. A tenth cache axis would be correct and would bust an entry's
    // whole slot on every keystroke in the mode.
    const shown = selection === null ? lines : washSelected(graph, lines, entry.id, from, width, selection);
    out.push(...[...keptChrome, ...shown].slice(0, ve.takeRows));
  }
  onAnimation(
    fastest === null && orbits.length === 0 && frames.length === 0
      ? NOTHING_ANIMATES
      : { spinnerMs: fastest, orbits, frames },
  );
  return out;
}

/**
 * The parts with every animating block withheld (C22 I103).
 *
 * The keys are `assemble`'s (C22 I101): a top-level block's id, or a column
 * group's child's id and its `align` behind a NUL — so the block half is what
 * is matched. `animationIntervalOf` over one block is I73's walk, containers
 * included, which is what makes a `steps` inside a `panel` a block this
 * withholds rather than one it serves stale.
 */
function withoutAnimating(parts: EntryParts | undefined, pieces: readonly EntryPiece[]): EntryParts | undefined {
  if (parts === undefined) return undefined;
  const animating = new Set<string>();
  for (const piece of pieces) {
    for (const block of piece.windowed.blocks) {
      if (animationIntervalOf([block]) !== null) animating.add(block.id);
      if (block.kind === "group" && (block as Group).direction === "column") {
        for (const child of (block as Group).children) {
          if (animationIntervalOf([child]) !== null) animating.add(child.id);
        }
      }
    }
  }
  if (animating.size === 0) return parts;  // cells-ok — a block count, not a width
  const blockOf = (key: string): string => {
    const nul = key.indexOf("\u0000");
    return nul < 0 ? key : key.slice(0, nul);
  };
  return Object.freeze({
    part: (key) => (animating.has(blockOf(key)) ? undefined : parts.part(key)),
    hold: (key, lines) => {
      if (!animating.has(blockOf(key))) parts.hold(key, lines);
    },
    // **The slice too** (C22 I104): a sliced block that animates is rendered
    // at every miss that opens the parts, as a whole one is.
    slice: (id, window) => (animating.has(id) ? undefined : parts.slice(id, window)),
    holdSlice: (id, window, lines) => {
      if (!animating.has(id)) parts.holdSlice(id, window, lines);
    },
  });
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
  // `extentOf` is the same function `copyElement` reads, which is what makes
  // *what is highlighted*, *what `y` copies* and *where the next arrow goes* one
  // answer rather than three that agree — and it writes nothing, because this
  // runs per frame. The stale-anchor rule (C26 I16, F764) lives there.
  //
  // **Measured before this**: after `↓ ⇧↓ ⇧↓` the frame showed the head in
  // `accent` and nothing else — `y` was the extent's only reader (F764).
  const ext = extentOf(stored, graph.focusedElements());
  if (ext === null) return null;
  const head = Object.freeze({ blockId: ext.head.blockId, rowId: ext.head.element.id });

  // The head alone is no selection and the field is **absent**, not `[]`
  // (`FocusState.selected`): the two draw identically and must key
  // identically.
  // **The bridge** (C26 I26, §102). `FocusState.inside` is read by `isInside` in
  // `blocks/kinds/controls.ts` and was written by nothing, so §018's third state
  // — *weight plus a painted handle* — was drawn, specified and had never
  // appeared in a frame. It reflects the stored mode and nothing else: the
  // renderer asks *am I the one being driven*, and `blockId` and `rowId` already
  // answer *which* (`FocusState.inside`'s own note).
  //
  // Absent rather than `false`, so a block with no inside keys as it always did.
  const inside = stored.mode === "interact" ? { inside: true } : {};
  if (ext.extent.length === 1) return Object.freeze({ ...head, ...inside }); // graphemes-ok: an element count, not text
  const selected = ext.extent.map((p) => Object.freeze({ blockId: p.blockId, rowId: p.element.id }));
  return Object.freeze({ ...head, ...inside, selected: Object.freeze(selected) });
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
