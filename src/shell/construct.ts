/**
 * C22 §3 — steps 2 to 11, in order, with an event log.
 *
 * Step 1 is `createTui`'s (I7a). Everything here runs inside `start()`, because
 * step 3 may read a manifest from a path and a constructor cannot await.
 *
 * **The log is not diagnostics.** T1.2, T1.3 and T1.4b assert the order against
 * it, and three of the orderings are load-bearing in a way that fails silently:
 * cleanup wired after the handlers that would call it still works on every
 * explicit path and stops working on signal paths only (I1). An ordering whose
 * violation passes the suite needs the suite to be about the ordering.
 *
 * §3a walks every pair. The three that matter:
 *
 *   - **5, 6 before 7** (I1) — `beforeRelease` closes over the history store
 *     and the runner.
 *   - **7 before any acquire** (I2) — C01 registers its handlers at
 *     construction, which is what closes its crash window.
 *   - **4 before 11** (I3) — a registry sealed after input is accepted can
 *     answer differently at two points in one session.
 *
 * And the one §3a found: **10 before 11**. The submit handler closes over the
 * pipeline and the pipeline closes over the router, so registration cannot sit
 * with the router's construction. It is its own step.
 */

import { createAdapterRegistry } from "../data/adapters/index.js";
import { commandRows } from "./paint.js";
import { noticeDoc } from "./documents.js";
import type { NavElement } from "../presentation/blocks/index.js";
import { initialRegionHeight } from "./frame.js";
import { createManifestStore, parseManifest, withThemeNames } from "../data/manifest/index.js";
import type { ManifestError } from "../data/manifest/index.js";
import { descendants } from "../data/viewmodel/index.js";
import type { Block, Plot, Result } from "../data/viewmodel/index.js";
import { createProcessRunner } from "../data/process/runner.js";
import {
  createTransport,
  createRouter as createTransportRouter,
  type TransportRouter,
} from "../data/transport/index.js";
import type { ProcessRunner } from "../data/process/types.js";
import { createBlockRegistry, type BlockDefinition } from "../presentation/blocks/index.js";
import { BlockFaultLog } from "./block-faults.js";
import { tableDefinition } from "../presentation/table/index.js";
import { plotDefinition } from "../presentation/plot/index.js";
import { patchDefinition } from "../presentation/patch/index.js";
import { loadTheme, type ThemeStore } from "../presentation/theme/index.js";
import { createTranscriptStore } from "../viewport/transcript/index.js";
import type { EntryId } from "../viewport/transcript/index.js";
import { createViewport } from "../viewport/viewport/index.js";
import { RenderCache } from "./render-cache.js";
import { Cameras } from "./cameras.js";
import { ScrollOffsets } from "./scroll-offsets.js";
import { createOverlayManager } from "../viewport/overlay/index.js";
import { createEditor } from "../interaction/editor/index.js";
import { createEngine, frameworkSources, MENU_ID } from "../interaction/completion/index.js";
import { createFocusStore } from "../interaction/router/focus.js";
import { createKeymap, defaultKeymap, keyText } from "../interaction/router/keymap.js";
import { createRouter, type RouterDeps } from "../interaction/router/router.js";
import { createConfirmHost, type ConfirmHost } from "./confirm.js";
import { createDecoder } from "../interaction/router/decode.js";
import { createKeyEffects } from "./keys.js";
import { createDocumentView } from "./document-view.js";
import { createPatchView } from "./patch-view.js";
import type { FocusTarget, InputEvent, Key, KeyAction } from "../interaction/router/types.js";
import { openHistory, SEARCH_ID } from "../interaction/history/index.js";
import { detectCapabilities, type TerminalCapabilities } from "../terminal/capabilities.js";
import { createFrameScheduler } from "../terminal/frame-scheduler.js";
import {
  createTerminalLifecycle,
  terminalSize,
  type TerminalLifecycle,
} from "../terminal/lifecycle.js";
import { makeBeforeRelease } from "./shutdown.js";
import {
  createTranscriptWriter,
  loadTranscript,
  persistPolicy,
  persists,
} from "./transcript-persist.js";
import type { ResolvedConfig } from "./config.js";
import { anyBlinking, CURSOR_BLINK_MS } from "./cursor-style.js";
import { createSessionStore, type SessionStore } from "./state.js";

/** Where the chosen variant lives (I40). One value, one file. */
export function themePath(stateDir: string): string {
  return `${stateDir}/theme`;
}

/**
 * Read, or `null` when there is nothing to read.
 *
 * A missing preference file is the ordinary case — every first run — so it is
 * not an error and does not reach the warning path. C20's `readOrEmpty` has the
 * same shape and cannot be shared: it collapses "absent" into "", which is the
 * one distinction I40's notice depends on.
 */
async function readOrAbsent(
  fs: Readonly<{ readFile: (path: string) => Promise<string> }>,
  path: string,
): Promise<string | null> {
  try {
    return await fs.readFile(path);
  } catch {
    return null;
  }
}
import type { Pipeline, StopReason } from "./types.js";

/**
 * The manifest file, read and decoded — the step that was missing (C22 I23).
 *
 * **A malformed document is reported, never thrown.** `JSON.parse` on a file the
 * author wrote is a user error, and a bare `SyntaxError` escaping `start()`
 * names a position in a string nobody can see. It becomes a `ManifestError`
 * carrying the path, on the same channel as every other thing wrong with a
 * manifest, so one handler covers both.
 */
async function readDocument(
  config: Readonly<{ manifest: string | object; fs: Readonly<{ readFile: (p: string) => Promise<string> }> }>,
): Promise<Result<unknown, readonly ManifestError[]>> {
  const path = config.manifest as string;
  let text: string;
  try {
    text = await config.fs.readFile(path);
  } catch (err) {
    return { ok: false, error: [{ path, message: `cannot be read: ${String(err)}` }] };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (err) {
    return { ok: false, error: [{ path, message: `is not valid JSON: ${String(err)}` }] };
  }
}


/**
 * Every step, named. The log is compared against this rather than against a
 * list written inside the test — a test carrying its own copy of the order
 * agrees with itself under any permutation of the thing it is checking.
 */
/**
 * A paste of this many lines or more becomes a chip (roadmap 30).
 *
 * Five, and it is a judgement rather than a measurement: four lines of prompt is
 * still a prompt and six is a wall. Said to be a judgement so nobody goes
 * looking for the figure it was derived from.
 */
const CHIP_LINES = 5;

/**
 * What one press of the dolly scales the eye distance by (C22 I75).
 *
 * **Multiplicative, so it cannot reach `distance: 0`** — the only value that
 * draws nothing, measured. Twelve presses from `CAMERA_DEFAULT`'s 6 take the eye
 * to 0.41 or to 87, and the reader is never on a blank frame with a control that
 * still works.
 */
const DOLLY = 1.25;

export const STEPS = Object.freeze([
  "capabilities",
  "registries",
  "seal",
  "stores",
  "runner",
  "lifecycle",
  "scheduler",
  "resize",
  "router",
  "pipeline",
  "register",
  "decoder",
  "input",
] as const);

export type Step = (typeof STEPS)[number];

/**
 * The five router pulls that are the **frame's** and not any store's.
 *
 * C16 asks where the transcript region sits, which entry is at a screen row,
 * and whether copy mode is on — and none of those is on `Viewport`, because
 * none is a property of the scrolled document. They are properties of the
 * composed frame, which is C22's and lives in `frame.ts`.
 *
 * Declared here as a seam for the same reason `Pipeline` is: a narrow interface
 * named by the consumer cannot grow a member the consumer never needed. It is
 * also what stops the alternative, which is inventing these on `Viewport` and
 * giving C14 a dependency on where things are drawn.
 */
export type FrameQueries = Readonly<{
  copyMode: () => boolean;
  /**
   * Leave copy mode (C16 §5b B1).
   *
   * **Ships with `copyMode` and with `enterCopyMode`, never after them.** The
   * `⌃c` rung already calls this, so a producer landing alone gives a mode that
   * consumes the key and does nothing — entered and not leavable, which is
   * worse than unreachable. Both stubs were in the tree for the length of C26.
   */
  exitCopyMode: () => void;
  /** Enter it. The other half of B1's pair (C16 §5b). */
  enterCopyMode: () => void;
  entryAtRow: (row: number) => Readonly<{ id: string; rowOffset: number }> | null;
  /**
   * Where the transcript sits, for mouse routing (C16 `RouterDeps.region`).
   *
   * **Not the same region as `overlayRegion`**, despite both being called one.
   * C16 asks *where* — `{ top, height }` — and C15 asks *how big* —
   * `{ width, height }` (C15 `Region`). Two shapes, one word, and passing
   * either to the other's consumer compiles for `height` alone.
   */
  region: () => Readonly<{ top: number; height: number }>;
  /** The area layers are placed within (C15 `Region`). */
  overlayRegion: () => Readonly<{ width: number; height: number }>;
  mouseEnabled: () => boolean;
  /**
   * The prompt's own extent, for anchoring a menu or a search line.
   *
   * A frame property like `region`, and taken from the composed frame rather
   * than recomputed: a menu anchored to a row the frame does not agree with is
   * C15 I17's self-consistent-but-wrong placement.
   */
  promptAnchor: () => Readonly<{ row: number; rows: number }>;
  /** Raises the Ctrl-C / Ctrl-D confirm — a layer over C15, composed by C22. */
  raiseExitConfirm: () => void;
}>;

export type ConstructDeps = Readonly<{
  /** C22's own `stop`, for `/exit` and the confirm rungs. */
  stop: (reason: StopReason) => Promise<number>;
  /** The frame. C03 takes both; `frame.ts` supplies them. */
  render: () => void;
  repaint: () => void;
  frame: FrameQueries;
  onFatal: (err: unknown) => never;
  /** Diagnostics sink — C01 owns the redirection, this is where lines land. */
  debug?: (line: string) => void;
}>;

export type Graph = Readonly<{
  /**
   * The live entry's elements, from the registry's one walk (C26 §5, §8b.4).
   *
   * **On the graph so `session.ts` reads this walk rather than a fourth.** Three
   * copies existed and the third was in this file's consumer, which is why the
   * comment warning about the second could not see it.
   */
  liveElements: () => readonly Readonly<{ blockId: string; element: NavElement }>[];
  /** C04 I48 — page the focused container, in rows, focus unmoved (C26 I18). */
  pageBlock: (direction: 1 | -1) => void;
  /** C22 I71 — turn the focused plot camera. A no-op where there is none. */
  orbitBlock: (direction: 1 | -1) => void;
  /** C22 I75 — tilt it. Unclamped, because the pole is unreachable (F467). */
  tiltBlock: (direction: 1 | -1) => void;
  /** C22 I75 — dolly it, multiplicatively, so `distance: 0` is unreachable. */
  dollyBlock: (direction: 1 | -1) => void;
  /** C22 I75 — restore the declared view, leaving the orbit alone. */
  resetCamera: () => void;
  /** C22 I72 — start or stop it turning. Off is the default and nothing declares it. */
  toggleOrbit: () => void;
  /** Is the prompt answering keys under the top layer (I51, C19 I20)? */
  promptUnderMenu: () => boolean;
  /** Past the blink threshold since the last key (C22 I64). */
  cursorIdle: () => boolean;
  /**
   * Has `--no-bg` turned the theme's background off (C22 I66, C10 I25)?
   *
   * **Read here and written through the pipeline's deps**, which is why only the
   * reader is on the graph: `/theme`'s handler is the one writer, it is reached
   * through `PipelineDeps`, and a setter here as well would be a second way to
   * write one variable with no caller.
   */
  suppressBackground: () => boolean;
  capabilities: TerminalCapabilities;
  /**
   * C22 I6a — every component that accumulates a diagnostic, drained at §8
   * step 3 in construction order.
   *
   * **A function and not an array**, because step 2b's `history.drain()` is a
   * synchronous append that can fail, and its warning exists only after the
   * release. A collection snapshotted at construction holds every warning
   * except the one the exit path itself caused.
   */
  diagnostics: () => readonly string[];
  blocks: ReturnType<typeof createBlockRegistry>;
  /**
   * What C09's containments swallowed, and what the frame owes for it (I69,
   * I70). On the graph rather than private to construction, because the render
   * loop both writes it — `visibleRows` scopes faults to an entry — and reads
   * it, after the frame, where the reserve is issued.
   */
  blockFaults: BlockFaultLog;
  adapters: ReturnType<typeof createAdapterRegistry>;
  manifest: ReturnType<typeof createManifestStore>;
  completion: ReturnType<typeof createEngine>;
  transcript: ReturnType<typeof createTranscriptStore>;
  viewport: ReturnType<typeof createViewport>;
  /**
   * An entry's rendered lines (C22 I58, §6c).
   *
   * **Here rather than on `Session`, because the wiring is here.** Its two
   * C13 arms sit beside C14's, which take the same two changes for the same
   * reason — and a cache whose subscription lives in one file while its owner
   * lives in another is the seam that goes unwired. `size` is exposed on C14's
   * `stats` precedent: the claim *one slot per entry* is about memory, and a
   * render count cannot see an eviction arm because an evicted entry is never
   * asked for again.
   */
  rendered: RenderCache;
  scrollOffsets: ScrollOffsets;
  cameras: Cameras;
  overlays: ReturnType<typeof createOverlayManager>;
  history: Awaited<ReturnType<typeof openHistory>>;
  editor: ReturnType<typeof createEditor>;
  theme: ThemeStore;
  runner: ProcessRunner;
  lifecycle: TerminalLifecycle;
  scheduler: ReturnType<typeof createFrameScheduler>;
  router: ReturnType<typeof createRouter>;
  /**
   * `ctx.ask`'s host, exposed because **C22 raises the exit confirm** (C23 I36).
   *
   * The Ctrl-C ladder's top rung asks the same question a local handler does and
   * must ask it the same way — a second confirm mechanism for the session's own
   * would be two renderings of one thing, and the one nobody looks at is the one
   * that rots.
   */
  confirm: ConfirmHost;
  /**
   * C16's stored focus, exposed because the **frame** needs it too (C16 §3).
   *
   * C09's `FocusState` is derived from this plus C13's `liveId`, and the
   * transcript path is where that derivation belongs — it is the only place
   * that knows which entry is being rendered.
   */
  focus: ReturnType<typeof createFocusStore>;
  pipeline: Pipeline;
  session: SessionStore;
  log: readonly Step[];
}>;

/**
 * A cause a reader can act on.
 *
 * `String(cause)` on a `ManifestError[]` is `[object Object],[object Object],…`,
 * and until C22 I23 that was unreachable: the object arm threw a hand-written
 * `Error` and the path arm never ran, so **no manifest error had ever been
 * formatted**. The first one to arrive said nothing at all — which is the
 * failure mode of a message on a path nothing exercises.
 */
function describe(cause: unknown): string {
  if (Array.isArray(cause)) {
    return cause
      .map((e: unknown) =>
        typeof e === "object" && e !== null && "message" in e
          ? `${String((e as { path?: unknown }).path ?? "")}: ${String((e as { message: unknown }).message)}`
          : String(e),
      )
      .join("; ");
  }
  return String(cause);
}

export class ConstructionError extends Error {
  constructor(
    readonly step: Step,
    cause: unknown,
  ) {
    super(`construction failed at step \`${step}\`: ${describe(cause)}`, { cause });
    this.name = "ConstructionError";
  }
}

export async function constructGraph(
  config: ResolvedConfig,
  deps: ConstructDeps,
): Promise<Graph> {
  const log: Step[] = [];
  const at = <T>(step: Step, fn: () => T): T => {
    let value: T;
    try {
      value = fn();
    } catch (cause) {
      throw new ConstructionError(step, cause);
    }
    log.push(step);
    return value;
  };

  // --- 2. capabilities ------------------------------------------------------
  // Before the registries, because a block definition may vary by capability
  // (A02 §3) — and a record built after them would give a table in ASCII beside
  // a sparkline that is not, which is the thing C02 exists to prevent.
  // The overrides are C02's to validate — an unknown key is ignored and a bad
  // value is rejected with a warning that surfaces where C02's others do. This
  // line's whole job is that they arrive at all (I49).
  const detection = at("capabilities", () =>
    detectCapabilities(config.env, config.capabilities),
  );

  // --- 3. registries: blocks, adapters, manifest, completion sources --------
  // **Manifest before completion sources**, within the step: the default
  // sources are manifest-derived (§2), so built first they would answer over an
  // empty tool list and never refill.
  // **Recency ranking, and the shell owns the mapping** (C19 I26, §3a).
  //
  // The engine takes `(value) => number | null` and never a history handle:
  // C19 and C20 are both L3, so the edge is sideways and must stay a
  // function. What *run* means is this layer's to answer — a candidate's
  // value at the verb slot is `ps` and a history line is `/ps --mine`, so
  // the mapping needs the prefix convention and the sub-verb depth, which
  // neither component below holds.
  //
  // **Rebuilt per submission, not per keystroke.** The cap is 10,000 and the
  // menu opens on every keystroke, so scanning would put 200,000 comparisons
  // on the input path — I2's *completion never blocks input* failing exactly
  // where §6a made it continuous. `entries` only grows on `append`, so its
  // **length is a version**: rebuild when it moves, answer from the map
  // otherwise.
  //
  // Declared before the store it reads because construction is ordered and
  // this is the earlier half of it. The closure is called on a keystroke,
  // long after `history` is assigned, and answers `null` until then — which
  // is the unranked order the engine already had.
  //
  // **`recency: recencyOf` and not `{ recency }`, and that is a finding rather
  // than a style.** MG24's record arm counts a member as consumed when it sees
  // `name:` or `.name`, and object shorthand is neither — so `{ recency }`
  // supplied the member and the rule fired anyway. Widening the arm to accept
  // a bare `name` before `,` or `}` was measured and is refused: 8 of the 75
  // members it would newly call consumed, and most are not consumers at all —
  // `VerbRatio.ratio` matched a `ratio` in `theme/index.ts`, and two
  // `HistoryStore` members matched their own barrel's `export { … }`. **An arm
  // that reads a re-export as a consumer is F83's class from a third
  // direction.** The local carries a different name from the member, which
  // costs nothing and leaves the rule able to see the seam.
  let historyStore: Awaited<ReturnType<typeof openHistory>> | null = null;
  let recencyAt = -1;
  let recencyIndex = new Map<string, number>();
  const recencyOf = (value: string): number | null => {
    const entries = historyStore?.entries ?? null;
    if (entries === null) return null;
    if (entries.length !== recencyAt) {
      recencyIndex = new Map<string, number>();
      for (const e of entries) {
        // **The first token as typed, prefix included** — because a verb
        // candidate's `value` is `/ps` and not `ps` (`sources.ts:61` builds
        // it as `/${head}`). The ruling was written the other way round and
        // the implementation falsified it: an index keyed on the bare head
        // would have matched nothing and ranked nothing, with every row still
        // green — a stable sort over keys that are all `null` IS the source
        // order the rows assert. A later entry overwrites an earlier one, so
        // the map holds the most recent run of each verb.
        const head = e.command.trimStart().split(/\s+/u)[0] ?? "";
        if (head !== "") recencyIndex.set(head, e.ts);
      }
      recencyAt = entries.length;
    }
    return recencyIndex.get(value) ?? null;
  };

  const built = await (async () => {
    // **What C09's containments swallowed** (C09 I29, C22 I6a). The registry
    // reports every occurrence and the deduplication is here, beside C23's own
    // `recordFault` and for its reason: a measurer that gives way is called at
    // frame cadence, so a flood is the default shape and one line is the intent.
    //
    // A pull rather than an emit, so this joins `diagnostics()` with C02's and
    // C20's — the component decides what is wrong, C22 §8 step 3 decides when
    // the reader is told, and a diagnostic painted onto the alternate screen is
    // discarded with it.
    // **Still a pull, and now also a record of what is owed** (C22 I69, I70).
    // The messages half is unchanged; the second half exists because a fault is
    // the only thing that knows which block gave way, and the shell has to
    // address one to reserve rows for it.
    const blockFaults = new BlockFaultLog();
    const blocks = createBlockRegistry({ defaults: true, onError: blockFaults.report });
    // **The three the framework itself produces** (C09 §1, I13). `defaults`
    // ships C09's fourteen; `table`, `plot` and `patch` register through the
    // public mechanism, and until this line nobody called it — so a stock
    // session had no renderer for a `table` and every one fell through to the
    // fallback, which draws the block's JSON. The framework's own `/history`
    // returns a table, so it was rendering its own output as source.
    //
    // Before `config.blocks`, so an app may still replace any of them.
    blocks.register(tableDefinition as unknown as BlockDefinition);
    blocks.register(plotDefinition as unknown as BlockDefinition);
    blocks.register(patchDefinition as unknown as BlockDefinition);
    for (const definition of config.blocks) blocks.register(definition);

    const adapters = createAdapterRegistry(config.adapters);

    const manifest = createManifestStore();

    // **Both arms are parsed here, and that is the whole of I23** (C22 §3a).
    //
    // The object arm used to be taken as already-parsed and refused when it
    // lacked Calcium's six verbs — which no author could supply, because
    // `parseManifest` derives them and is exported from no entry point. The path
    // arm handed `readFile`'s **string** to a function that requires a record,
    // with no `JSON.parse` between them, so it had never run. `createTui` could
    // not be called from the public surface by either route, and every harness
    // in this repository reaches through the package boundary for
    // `parseManifest`, so nothing inside the package could see it. The reference
    // app found it on its first start.
    //
    // Construction still appends nothing and derives nothing — it *parses*. The
    // single-producer argument that refused an append here is untouched; what
    // changes is that the object arm stops demanding the parser's own output.
    const document: Result<unknown, readonly ManifestError[]> =
      typeof config.manifest === "string"
        ? await readDocument(config)
        : { ok: true, value: config.manifest };
    if (!document.ok) throw new ConstructionError("registries", document.error);

    const parsed = parseManifest(document.value);
    if (!parsed.ok) throw new ConstructionError("registries", parsed.error);

    // **`/theme`'s values, supplied where both facts are held** (C10 I27). The
    // manifest describes the verb and the config declares the themes, and this
    // is the one place with each — so the enum, the completion and the usage
    // text all name the set the session actually holds.
    manifest.load(withThemeNames(parsed.value, Object.keys(config.theme)));

    const completion = createEngine({ now: config.clock, recency: recencyOf });
    // **The framework's six first, then the app's** (I3b). §2 called
    // manifest-derived completion a working default and nothing built it, so
    // `Tab` produced no candidates in any real session while every C19 tier
    // passed on every source.
    for (const source of frameworkSources({
      manifest: () => built.manifest.manifest,
      readDir: config.fs.readDir,
      path: () => (config.env["PATH"] ?? "").split(":").filter((p) => p !== ""),
    })) {
      completion.register(source);
    }
    for (const source of config.completionSources) completion.register(source);

    return { blocks, adapters, manifest, completion, blockFaults };
  })().catch((cause: unknown) => {
    throw cause instanceof ConstructionError ? cause : new ConstructionError("registries", cause);
  });
  log.push("registries");

  // --- 4. seal the three registries that have a seal ------------------------
  // **Three, not four.** C19's engine has no `seal` and never had one:
  // `register` returns a `Disposable` because a dynamic source is meant to come
  // and go within a session (C19 §2). The step list said "all four" against a
  // line naming three components, and what made the disagreement visible was
  // writing `completion.seal()` and watching it not compile. C23's registry is
  // the fourth seal, at step 10.
  at("seal", () => {
    built.blocks.seal();
    built.adapters.seal();
    built.manifest.seal();
  });

  // --- 5. stores ------------------------------------------------------------
  //
  // **The viewport's dimensions come from `terminalSize`, not from a
  // lifecycle**, and that is the pair §3a could not see because it lives in
  // another component. The viewport takes `width` and `height` here (C14 §2);
  // only `terminal/lifecycle.ts` may read them (C01 I13, SS42); and the
  // lifecycle is step 7 and cannot move earlier, because C01 takes
  // `beforeRelease` at construction and it closes over the history store and
  // the runner (I1).
  //
  // Written the obvious way — construct the lifecycle first and call `size()` —
  // this silently inverts I1, and nothing fails: every explicit exit path still
  // cleans up, and only a signal arriving during construction finds a
  // `beforeRelease` closed over `undefined`. C01 I13 is a rule about a **file**
  // rather than about an object, so the read moved to a free function in that
  // file and neither invariant has to give.
  const size = terminalSize(config.stdout);
  /** Roadmap 30 — the chip's display number, per session. */
  let chipCount = 0;

  const stores = await (async () => {
    const transcript = createTranscriptStore(
      config.retainPayloads > 0 ? { retainPayloads: config.retainPayloads } : {},
    );
    // The store *is* the view (C13 §2, `TranscriptStore extends TranscriptView`)
    // — C14 takes the reader half, and passing the store satisfies it.
    const viewport = createViewport(transcript, {
      width: size.columns,
      // **The region's height, not the terminal's** (C22 I34, C14 I22). The
      // first `#render` overwrites this from the composed frame; it is computed
      // rather than left at `size.rows` because `visible()` is answerable before
      // that frame exists, and an initial value in the wrong axis is the same
      // defect with a shorter life. One row of prompt is the floor, which is
      // what a session opens with.
      height: initialRegionHeight(size),
      measureSequence: (blocks, width) => built.blocks.measureSequence(blocks, width),
      // C14 I20 / C22 I33 — the command line is chrome the composer draws, so
      // it is part of the height the index virtualises against. **The same
      // function that draws it**, or the two arithmetics part company and the
      // viewport describes a document it is not showing.
      chromeRows: (entry, width) => commandRows(entry.doc.command, width, detection.capabilities).length,
    });

    // **The render cache's two C13 arms, beside C14's** (I58, §6c trace rows 8
    // and 9). `rev`, width, focus and theme are all *in the key*, so `append`,
    // `patch` and `settle` need no handler — a moved `rev` simply misses. What
    // the key cannot express is an entry that no longer exists: its slot would
    // hold a rendered document nothing can reach, for the life of the session.
    // C14's `HeightCache` takes the same two changes for the same reason.
    const rendered = new RenderCache();
    // **One subscription for both** (C04 I48). The rendered rows and the offset
    // that chose them are the same fact about the same entry, and two callbacks
    // would be two places for a future eviction path to reach one and miss the
    // other.
    const scrollOffsets = new ScrollOffsets();
    // **The camera joins the same subscription**, for the reason the comment
    // above gives about the offsets: a third callback would be a third place for
    // an eviction path to reach two and miss one (C22 I71).
    const cameras = new Cameras();
    transcript.subscribe((change) => {
      if (change.kind === "evict") {
        for (const id of change.ids) {
          rendered.delete(id);
          scrollOffsets.delete(id);
          cameras.delete(id);
        }
      } else if (change.kind === "clear") {
        rendered.clear();
        scrollOffsets.clear();
        cameras.clear();
      }
    });

    const overlays = createOverlayManager({ registry: built.blocks });
    // **The state directory has to exist before anything writes into it**, and
    // nothing created it. `FileSystem.mkdir` was declared, implemented at
    // `session.ts`, and called by nowhere in `src/` — so on a machine without
    // the directory every history write failed ENOENT, C20 rewound correctly
    // rather than dropping the row, and the retry failed identically forever.
    // Correct error handling one layer up is what turned a missing call into a
    // permanent silent failure. FINDINGS F96.
    //
    // **C22's, not C20's.** `HistoryFs` deliberately omits `mkdir` — its own
    // declaration says a wider type would let a later edit reach for something
    // the component never needed — so widening it to fix this would trade one
    // defect for the shape F58b and F85 are about. C22 owns `FileSystem` and
    // owns `stateDir`, and directory management belongs with both.
    //
    // **Warn and continue, never throw**, which is the precedent thirty lines
    // below: history repairs a corrupt file at open rather than failing,
    // because a session that refuses to start over a preference file has made a
    // preference into a dependency. An unwritable state directory costs
    // persistence, not the session.
    // `mkdir` is `recursive: true` at the one place it is implemented, so the
    // ordinary case — the directory already exists — succeeds silently and no
    // notice is drawn. Only a genuinely unwritable path reaches the catch.
    try {
      await config.fs.mkdir(config.stateDir);
      // **The directory ignores itself** (I67). `.calcium` sits beside the
      // project, so a theme preference is committable today and a persisted
      // transcript is the moment a verb declares one (C13 I20). Writing the
      // rule here rather than documenting it means it does not depend on the
      // app author having thought of it, and `*` inside the directory beats
      // whatever the project's own ignore file says.
      //
      // Unconditional rather than written-if-absent: an app that deliberately
      // un-ignored this directory has done something the framework should not
      // be helping with, and a read-then-write would be two syscalls to reach
      // the same place. Failure is silent — the `catch` below is for a
      // directory that could not be made at all, which is the case worth a
      // notice.
      await config.fs.writeFile(`${config.stateDir}/.gitignore`, "*\n").catch(() => undefined);
    } catch {
      transcript.append(
        noticeDoc(
          "",
          `history will not persist: \`${config.stateDir.slice(0, 60)}\` could not be created`,
          "warn",
          { origin: "refresh" },
        ),
      );
    }
    const history = await openHistory({
      fs: config.fs,
      clock: config.clock,
      stateDir: config.stateDir,
    });
    // The later half of C19 I26's seam — see `recency` above.
    historyStore = history;
    const editor = createEditor();
    const themed = loadTheme(config.theme);
    if (!themed.ok) throw new ConstructionError("stores", themed.error);

    // **The persisted variant, repaired on read** (I40). C20's precedent one
    // component up: history repairs a corrupt file at open rather than
    // failing, and the reasoning transfers whole — a session that refuses to
    // start because a preference file has a stray byte in it has made a
    // preference into a dependency.
    //
    // Anything the set does not hold as a name is treated as absent, and
    // `themeWarning` is what stops "absent" and "corrupt" looking the same to
    // a user who chose light and got dark. The notice is committed at step 8,
    // once there is a transcript to put it in.
    //
    // **Absent, empty and unusable are one arm here** (I68, §6h.2 rows 6 and 7).
    // They were already the same for this rule's purposes — an unreadable file
    // leaves the base theme standing — and the polarity below is what makes the
    // collapse load-bearing rather than tidy: *a preference that cannot be
    // honoured is not a preference*, so all three fall through to the terminal.
    const persisted = await readOrAbsent(config.fs, themePath(config.stateDir));
    const trimmed = persisted?.trim() ?? "";
    // **A membership test against the set, not a comparison to two literals**
    // (C10 I27). The migration is nothing — `dark` and `light` are names in
    // the shipped set — and a literal pair here would refuse a legitimate
    // name the moment a third theme existed.
    const stated = themed.value.names.includes(trimmed);
    if (stated) themed.value.setTheme(trimmed);
    else if (trimmed !== "") {
      // Appended here rather than carried out to `start()`: the transcript
      // exists at this point and a warning threaded through the graph is a
      // second record of the same fact. `origin: "refresh"` because no user
      // command produced it.
      //
      // **The set's own names, not `dark or light`** (F215). The literal pair
      // survived C10 I27's fork in this string and in three documents, and on a
      // set holding `high-contrast` it names two of the three themes available
      // and calls the third a mistake. Nothing asserted the sentence, which is
      // why it was free to be wrong.
      transcript.append(
        noticeDoc(
          "",
          `theme preference ignored: \`${trimmed.slice(0, 40)}\` is not ` +
            `${themed.value.names.join(", ")}`,
          "warn",
          { origin: "refresh" },
        ),
      );
    }

    // **The terminal's own polarity, where the reader has not usably stated a
    // preference** (I68, §6h). C02 reads `COLORFGBG` and answers `dark`, `light`
    // or `unknown`; the third value is what makes this branch expressible, since
    // *nothing stated* and *stated light* would otherwise be one fact.
    //
    // **A search of the set by `variant`, and not a switch to a name.** C10 I27
    // keyed the set by name and made polarity a property a theme declares, so
    // there is no `setTheme(polarity)` to call — and the search is the first
    // reader of `variant` outside `store.ts`, which is the use I27 published it
    // for. The variants come from `config.theme` rather than through a new C10
    // accessor: the set is the argument `loadTheme` was given, already in hand.
    //
    // **Declaration order, on `loadTheme`'s own precedent** — `opening` defaults
    // to the set's first key rather than to a literal — and **silent when it
    // matches nothing**: the set is the app author's, and a notice would be the
    // framework reporting on their choice to their user (§6h.2 rows 4 and 5).
    //
    // **Never persisted.** `${stateDir}/theme` has one writer and it is
    // `/theme`'s handler (I40). A written inference is indistinguishable from a
    // statement on the next read, and that distinction is what the `stated`
    // branch above runs on (§6h.3 row 1).
    if (!stated) {
      const polarity = detection.capabilities.backgroundPolarity;
      const match =
        polarity === "unknown"
          ? undefined
          : themed.value.names.find((n) => config.theme[n]?.variant === polarity);
      // Cannot throw: every name here came from the store's own list (§6h.5).
      if (match !== undefined) themed.value.setTheme(match);
    }

    // **§8's seventh severity, and the only one that had no home.** Six of the
    // seven conditions throw inside the components that own them —
    // `validateConfig` for a missing field, `checkSchema` for an unsupported
    // adapter schema, `validateTokens` for contrast and for a `meaning` palette
    // with no typographic fallback, `KeymapError` for a duplicate binding, the
    // block registry for a shadowed kind. This one is a *warning*, so nothing
    // that throws could express it and nothing did.
    //
    // **Appended rather than delivered through a config hook**, and the
    // precedent is three commits old: C24 §3 declined to export
    // `ThemeStore.applyOverrides` because overrides would arrive as a
    // `TuiConfig` field and no such field is specified — a missing ruling at
    // the shell rather than a surface to widen. A `TuiConfig.onWarning` here
    // would be that same invention, so this goes where the theme-preference
    // warning above already goes, for the reasons already written there.
    //
    // Checked against `config.adapters` rather than against the registry: the
    // registry has no accessor listing what it holds, and the app's own map is
    // the honest subject anyway — the question is which verbs *this app*
    // registered for, not what the fallback can also route.
    const tools = new Set((built.manifest.manifest?.tools ?? []).map((t) => t.name));
    const orphans = Object.keys(config.adapters)
      .filter((verb) => !tools.has(verb))
      .sort();
    if (orphans.length > 0) {
      // A warning and not an error because a manifest legitimately shrinks
      // between versions, and an app that refuses to start when the far side
      // drops a verb is worse than one that says so (§8).
      transcript.append(
        noticeDoc(
          "",
          `adapter${orphans.length === 1 ? "" : "s"} registered for ` +
            `${orphans.length === 1 ? "a verb" : "verbs"} the manifest does not declare: ` +
            `${orphans.join(", ")} — dead code, and probably a typo`,
          "warn",
          { origin: "refresh" },
        ),
      );
    }

    // **Session resume** (C13 I20, roadmap 44). Off unless the app declared a
    // policy, and the decision is taken here because L4 is the one place that
    // holds the manifest, the config and the store at once — A02 Seam 4, and
    // the reason C13 knows nothing about verbs.
    const policy = persistPolicy(built.manifest.manifest ?? null, config);
    const persisting = policy.all || policy.declared.size > 0;
    const transcriptWriter = createTranscriptWriter(
      config.fs,
      `${config.stateDir}/transcript.ndjson`,
    );
    if (persisting) {
      const loaded = await loadTranscript(config.fs, `${config.stateDir}/transcript.ndjson`);
      transcriptWriter.seed(loaded.rows);
      // Appended in order, so the session opens at the bottom on the newest of
      // them — 44's ruling, and it falls out of `append` rather than needing a
      // rule: no scroll offset, no container offset and no focus is restored
      // because none of them is written.
      for (const doc of loaded.docs) transcript.append(doc);

      // **A dropped line is said out loud** (F35's class). Silently discarding
      // part of a resume file is absence indistinguishable from failure: the
      // session looks like one that had fewer commands in it, and nothing
      // anywhere says otherwise.
      if (loaded.discarded > 0) {
        transcript.append(
          noticeDoc(
            "",
            `${String(loaded.discarded)} line${loaded.discarded === 1 ? "" : "s"} of the ` +
              `saved transcript could not be read and ${loaded.discarded === 1 ? "was" : "were"} ` +
              `skipped`,
            "warn",
            { origin: "refresh" },
          ),
        );
      }

      // **What is written is decided on `settle`, and on an `append` that is
      // already settled.** A non-streaming entry is settled the moment it
      // arrives — `streaming` is what unsettled means (C13 §2) — so both
      // changes carry an entry that will not move again, and no other change
      // does. `patch` deliberately writes nothing: a row written before it
      // stopped changing is the whole of §5b.2.
      transcript.subscribe((change) => {
        if (change.kind !== "append" && change.kind !== "settle") return;
        const entry = transcript.entries.find((e) => e.id === change.id);
        if (entry === undefined || entry.streaming) return;
        if (!persists(policy, entry.doc)) return;
        transcriptWriter.write(entry.doc);
      });
    }

    return {
      transcript,
      viewport,
      rendered,
      scrollOffsets,
      cameras,
      overlays,
      history,
      editor,
      theme: themed.value,
      transcriptWriter,
    };
  })().catch((cause: unknown) => {
    throw cause instanceof ConstructionError ? cause : new ConstructionError("stores", cause);
  });
  log.push("stores");

  // --- 6. the process runner ------------------------------------------------
  const runner = at("runner", () =>
    createProcessRunner({
      env: config.env,
      stdin: config.stdin,
      ...(deps.debug === undefined ? {} : { debug: deps.debug }),
    }),
  );

  const session = createSessionStore({
    cwd: config.cwd,
    env: {},
    cluster: config.cluster,
    version: config.version,
  });

  // --- 7. the lifecycle, and the handlers it registers ----------------------
  // After 5 and 6 (I1): `beforeRelease` closes over the history store and the
  // runner, and C01's signal handlers exit the process after releasing — so
  // cleanup not wired by now never runs on a signal path at all.
  const lifecycle = at("lifecycle", () =>
    createTerminalLifecycle({
      stdout: config.stdout,
      stdin: config.stdin,
      capabilities: detection.capabilities,
      onFatal: deps.onFatal,
      beforeRelease: makeBeforeRelease(runner, stores.history, [stores.transcriptWriter]),
      ...(deps.debug === undefined ? {} : { debug: deps.debug }),
    }),
  );

  // --- 8. the frame scheduler -----------------------------------------------
  // After the lifecycle: C03 takes `lifecycle` and `write`, so there is nothing
  // to construct before it exists.
  const scheduler = at("scheduler", () =>
    createFrameScheduler({
      render: deps.render,
      repaint: deps.repaint,
      capabilities: detection.capabilities,
      lifecycle,
      write: (s) => void lifecycle.writer.write(s),
    }),
  );

  // --- 8a. the two cross-layer effects C22 owns (A02 Seam 4) ----------------
  //
  // Both are pushes *from* C22 rather than reaches *by* the component, which is
  // the whole of Seam 4: C14 never calls the scheduler and never learns its own
  // width, and C01 never knows a viewport exists.
  //
  // **The anchor is captured before the cache is dropped** — C14's `resize`
  // does that internally (C14 I8), which is why this hands over one snapshot
  // and does not compute anything from it.
  /**
   * Step 11's anchor refresh, reachable from step 8's handler.
   *
   * **A forward reference made explicit rather than left implicit.** The resize
   * subscription is registered at step 8 and the effect table is built at step
   * 11, so naming `keys` inside the handler is a temporal-dead-zone read that
   * is safe only because construction is synchronous and no signal can
   * interleave. That is a true argument and a fragile one — it stops holding
   * the day any step awaits — and the failure it would produce is a throw
   * inside a signal handler.
   */
  let refreshAnchors: () => void = () => undefined;

  at("resize", () => {
    lifecycle.onResize(() => {
      // **The viewport is not resized here, and that is where the 544 ms was**
      // (C03 I15, F423). The comment this replaces said *the width, and not the
      // height* — two writers with different ideas of one quantity, which is
      // C22 I34's own sentence about the height. It was true one field over:
      // `render-frame.ts` already resizes the viewport from the composed frame,
      // **width and height together**, before any row is read, and C14 I21 makes
      // the second call a no-op. So this line's only effect was to do the
      // re-measure per `SIGWINCH` instead of per frame — thirty full re-measures
      // of the transcript for a drag, 544 ms at a thousand entries.
      //
      // **Nothing here needs to know the new width**, and a frame composed for
      // any other reason cannot be stale: `compose` reads `lifecycle.size()`
      // fresh, and the only reader of viewport rows is `paintDeps`, whose two
      // call sites are both after the resize (C03 §8a, the classification
      // table's third row). The size argument is therefore unread, which is why
      // it is not taken.
      //
      // **`refreshAnchors` stays per signal rather than per frame**, and it is
      // cheap: `promptAnchor` composes for `region.height` and `promptRows`
      // only — layout, no paint — and reads `lifecycle.size()` fresh, so it
      // never depended on the viewport having been resized first.

      // **The anchors, before the frame is asked for** (C15 I14, C19 I23). An
      // anchored layer stores the row it was placed against, and every writer
      // of that row was a keystroke path — so a resize left an open menu
      // anchored to the previous region height until the next character. C15
      // clamps, so nothing faults and no number disagrees; the menu is simply
      // in the wrong place, which is a frame's finding and not an assertion's.
      refreshAnchors();
      scheduler.commit("resize");
    });
    // `SIGCONT` re-acquires and says so through `onResume`; C01 sets no
    // contamination flag (C01 §Signals), so the invalidate is C22's to issue —
    // exactly as it is after an orchestrated `resume()`.
    lifecycle.onResume(() => void scheduler.invalidate());
  });

  // --- 9. the input router --------------------------------------------------
  // Hoisted so the pipeline can read it: `/help` renders from the keymap rather
  // than a maintained list (C23 I26), so both must be the same table.
  const keymap = createKeymap(defaultKeymap);

  // Hoisted rather than inline: the effect table moves focus too, and a store
  // only `createRouter` could see is why `enterLiveBlock` had no caller for four
  // components (C16 I22).
  const focus = createFocusStore();

  /**
   * `ctx.ask`'s host (C23 I36, C16 I25).
   *
   * **Before the router and not thunked**, unlike the pipeline: it needs only
   * the overlay store and the scheduler, both of which exist by now, and rung 4
   * reads it on every keystroke at an open question. A thunk here would buy
   * nothing and add a nullable to the one path that must not answer quietly.
   */
  const confirm = createConfirmHost({
    overlays: stores.overlays,
    // The same anchor C19's menu takes, read at `ask` time (C15 I17).
    anchor: deps.frame.promptAnchor,
    overlayRegion: deps.frame.overlayRegion,
    invalidate: () => void scheduler.commit("input"),
  });

  const router = at("router", () =>
    createRouter({
      focus,
      keymap,
      now: config.clock,
      // **The thunk is the 10 → 9 pair** (§3a). `pipeline` is declared below and
      // read only when a key arrives, which is after step 11 admits input.
      // A `const` in the temporal dead zone rather than `let pipeline = null`:
      // the nullable form answers quietly, and a quiet `null` here is Ctrl-C
      // taking a lower rung over a running verb — C23 §8a A1 restored by its
      // own fix.
      deps: routerDeps(stores, runner, scheduler, deps.frame, () => pipeline, confirm),
    }),
  );

  // --- 10. the execution pipeline -------------------------------------------
  // Takes the router, because C23's submit row ends `resetFocus()` (Seam 4).
  // Seals its own registry here, which is I3's fifth.
  /**
   * The fullscreen patch view — the first producer of a `kind: "view"` layer.
   *
   * Built before the pipeline because C23's action dispatcher calls into it and
   * the pipeline closes over that dispatcher; the same ordering argument step
   * 11 makes about the router, one dependency earlier.
   */
  const patchView = createPatchView({
    overlays: stores.overlays,
    transcript: stores.transcript,
    region: deps.frame.overlayRegion,
    redraw: () => void scheduler.commit("input"),
  });

  /**
   * The document view — C22 §13a's producer, and `patchView`'s sibling.
   *
   * Built here for the same reason and one line later: C23 raises it when a
   * verb's declaration says its result is a view (C05 I20), so it must exist
   * before the pipeline that closes over it.
   *
   * `measure` comes from the sealed registry rather than from a second
   * measurer, because the window it computes has to agree with the one C15 uses
   * to place what it is handed — a window measured by anything else is C09 I1's
   * divergence with a whole view behind it.
   */
  const documentView = createDocumentView({
    overlays: stores.overlays,
    measureSequence: (blocks, width) => built.blocks.measureSequence(blocks, width),
    region: deps.frame.overlayRegion,
    redraw: () => void scheduler.commit("input"),
  });

  /**
   * `--no-bg`, for as long as the invocation that set it is the last `/theme`
   * (C22 I66).
   *
   * **Declared above the pipeline, not beside `lastInputAt`** — the handler's
   * writer closes over it at step 10, and a `let` executed later would be a
   * temporal dead zone the first time `/theme` ran. At graph scope for
   * `lastInputAt`'s reason: the frame reads it and a local
   * handler writes it. It is **not** a theme override — an override merges into
   * the tokens, bumps the serial and changes the theme's identity, which is
   * sticky by construction and would put a paint decision into every cache
   * keyed on that identity (C10 I25).
   */
  let suppressBackground = false;

  const pipeline = at("pipeline", () => {
    const p = config.pipeline({
      // A function, not a snapshot: the store freezes a fresh object per write,
      // so a value captured here could never show `stopping` and C23 I12 would
      // be unobservable (§3a step 10).
      session: () => session.snapshot,
      writes: session.execution,

      transcript: stores.transcript,
      scheduler,
      transport: config.transport ?? defaultTransport(config, runner, session),
      adapters: built.adapters,
      manifest: built.manifest,
      blocks: built.blocks,
      // C07 I19 — the **resolved** record, which is what `detection` holds after
      // C22 I49's overrides. Deriving it again anywhere else is F124.
      capabilities: detection.capabilities,
      // C07 I18 — the same region `documentView` reads, not a second one.
      region: deps.frame.overlayRegion,
      editor: stores.editor,
      overlays: stores.overlays,
      patchView,
      documentView,
      /**
       * C23 I46 — whether anyone is looking at a live part's host.
       *
       * **The entry arm is C14's answer and nothing else's.** Asking the
       * transcript whether an entry exists would answer a different question:
       * an entry scrolled a thousand rows above the viewport is present, live
       * and invisible, and it is exactly the one that should stop spawning.
       *
       * **A `view` host is visible while it is declared**, which is a ruling and
       * not a shortcut: popping the view is one of C23 I33's five release
       * triggers, so a declared view host is on screen by construction. The
       * consequence is recorded rather than left to be found — the pause reaches
       * transcript-hosted parts and does not reach a drill-in at all.
       */
      visible: (host) =>
        host.kind === "view" ||
        stores.viewport.visible().entries.some((e) => e.id === host.id),
      confirm,
      theme: stores.theme,
      // **On the change, not at exit** (I40). Fire-and-forget for the same
      // reason the handler does not await it: a failed write means the choice
      // does not survive the session, which is already what an unwritable
      // state directory means for history.
      persistTheme: (variant) => {
        void config.fs.writeFile(themePath(config.stateDir), `${variant}\n`).catch(() => {
          // Best effort. A03 SS33 bans `console.*` and the debug sink is C01's.
        });
      },
      setSuppressBackground: (next) => {
        suppressBackground = next;
      },
      history: stores.history,
      runner,
      lifecycle,

      // The seam the handoff's resume side calls (I25). A thunk, because the
      // decoder is built at step 12 and the pipeline at step 10 — the same
      // temporal-dead-zone shape as `pipeline` above, and for the same reason.
      resetInput: () => void decoder.reset(),
      resetFocus: () => router.resetFocus(),
      stop: deps.stop,
      clock: config.clock,
      schedule: config.schedule,
      openUrl: config.openUrl ?? defaultOpener(config.platform, runner, session),

      bindings: () =>
        keymap.entries().map((b) => ({ keys: keyText(b.key), does: `${b.target}: ${b.action}` })),
      binary: config.binary,
      commandPolicy: config.commandPolicy,
    });
    // **Before the seal** (I3a). C23 I27 reconciles the registry against the
    // manifest, and a handler registered after that check is a second window in
    // which the two records can differ — which is the window the seal exists to
    // close.
    for (const [verb, handler] of Object.entries(config.localHandlers)) {
      p.register(verb, handler);
    }
    p.seal();
    // **C23 I46's resume, heard rather than polled.** A source nobody is looking
    // at is not what the part timer arms to — arming to an overdue paused source
    // would spin it at zero — so the scroll back into view has to say so. C14
    // emits on `scroll`, `content` and `resize`, and all three can change which
    // entries are on screen.
    //
    // The same disposition C23 I33 takes for eviction, and the same reason: a
    // check on the next tick is correct and arrives one interval late, which is
    // long enough for a reader to see a panel that has not caught up.
    stores.viewport.subscribe(() => void p.visibilityChanged());
    return p;
  });

  // --- 11. register every handler -------------------------------------------
  // **Its own step, and that is §3a's finding.** The submit handler closes over
  // the pipeline built at 10, and the pipeline closes over the router built at
  // 9. Registering with the router would require one of the two to exist before
  // it does.
  /**
   * The live entry's elements, once (C26 §5).
   *
   * **One walk feeding three consumers**, which is the whole of §8b.4: `liveRows`,
   * `liveRowAction` and — through `graph.liveElements` — `session.ts`'s
   * `focusFor` all read this. Three copies is what the tree had, and the third
   * sat in another component where the comment warning about the second could
   * not see it.
   *
   * **A pull, recomputed per call** (C26 I11). C16 registers no subscription and
   * neither does this: C13 emits `append` then `evict` for one `append()`, so a
   * cached list read as current state is the half-applied store that cost C14 a
   * blank screen every assertion passed.
   *
   * The width is the region's, because that is the width the blocks were
   * measured and drawn at. A second width here would put the elements somewhere
   * the frame is not.
   */
  const liveElements = (): readonly Readonly<{ blockId: string; element: NavElement }>[] => {
    const id = stores.transcript.liveId;
    if (id === null) return [];
    const entry = stores.transcript.entries.find((e) => e.id === id);
    if (entry === undefined) return [];
    return built.blocks.elementsIn(entry.doc.blocks, deps.frame.overlayRegion().width);
  };

  /**
   * Page the focused container's own window (C04 I48, C26 I18).
   *
   * **Here rather than in `keys.ts`**, for `liveElements`'s reason: a page is
   * the container's height less one row of overlap, and the height is
   * `measure(block, width)` — a registry call at the frame's width, which is
   * this file's to make and not the effect table's.
   *
   * **Focus does not move**, which is the invariant and not an omission: the
   * store is nudged and nothing touches `focus`. A focused element outside the
   * box is the legal state C26 I18 names, and the next `↓` steps from it.
   */
  /**
   * The block focus is inside, **resolved through the tree** (F470).
   *
   * `elementsIn` walks into `panel` and `group` — a container declaring no
   * elements of its own yields its children's — so focus can land on a block a
   * top-level `find` cannot reach. Every effect here used that `find`, so a
   * table inside a `panel` could be focused and not paged, and a 3D plot inside
   * one could be focused and not turned. **`b.live` builds a panel**, which is
   * how a defect this shape stays invisible: the arrangement the framework
   * itself produces is the one that fails.
   *
   * C04's `descendants` rather than a fourth walk, for `animationIntervalOf`'s
   * reason — two copies of a traversal are two places to add a container kind.
   */
  const focusedBlock = (): Readonly<{ entryId: EntryId; block: Block }> | null => {
    const entryId = stores.transcript.liveId;
    if (entryId === null) return null;
    const at = focus.current;
    if (at.at !== "liveBlock" || at.element === null) return null;
    const wanted = at.element.blockId;
    const entry = stores.transcript.entries.find((e) => e.id === entryId);
    if (entry === undefined) return null;
    for (const top of entry.doc.blocks) {
      if (top.id === wanted) return { entryId, block: top };
      for (const child of descendants(top)) if (child.id === wanted) return { entryId, block: child };
    }
    return null;
  };

  const pageBlock = (direction: 1 | -1): void => {
    const found = focusedBlock();
    if (found === null) return;
    const { entryId, block } = found;

    // One row of overlap, which is what lets a reader join two screens — and
    // a floor of one, so a box of a single row still moves.
    const height = built.blocks.measure(block, deps.frame.overlayRegion().width);
    stores.scrollOffsets.nudge(entryId, block.id, direction * Math.max(1, height - 1));
    scheduler.commit("input");
  };

  /**
   * The focused plot, or `null` (C22 I71, I75, C12 I83).
   *
   * **`pageBlock`'s shape and one difference**: the camera effects read the
   * block's own declared `camera`, because the baseline a key is normalised
   * against is the view the block would be drawn from with no entry at all —
   * and only the block knows that (`cameras.ts`'s header).
   *
   * **A block that is not a plot, or a plot declaring no camera, is a no-op.**
   * The bindings are static and cannot see a block, so the gate is here — and a
   * plot with no `camera` declares no element either (C12 I85), so focus cannot
   * reach one and the second half of the gate is belt over braces.
   */
  const focusedPlot = (): Readonly<{ entryId: EntryId; plot: Plot }> | null => {
    const found = focusedBlock();
    if (found === null) return null;
    const { entryId, block } = found;
    if (block.kind !== "plot") return null;
    const plot = block as Plot;
    return plot.camera === undefined ? null : { entryId, plot };
  };

  /**
   * Turn the focused plot's camera one step (C22 I71, I75).
   *
   * One sixteenth of a turn, which reads as a rotation rather than a jump at the
   * sample counts this rung has. **Focus does not move**, exactly as paging does
   * not (C26 I18).
   */
  const orbitBlock = (direction: 1 | -1): void => {
    const at = focusedPlot();
    if (at === null) return;
    stores.cameras.nudge(at.entryId, at.plot.id, at.plot.camera, {
      azimuth: (direction * Math.PI) / 8,
    });
    scheduler.commit("input");
  };

  /**
   * Tilt the focused plot's camera (C22 I75).
   *
   * **Finer than the turn and deliberately unclamped.** The useful elevation
   * range is `π` where the azimuth's is `2π`, so a sixteenth of a half-turn is
   * the same visual step; and the pole is unreachable, because `cos(π/2)` is
   * `6.123e-17` and `basisOf`'s degenerate `right` vector cannot be produced —
   * measured, elevation exactly `π/2` draws a plan view (F467). A camera past
   * the pole is a view rather than a corruption, which is `cameras.ts`'s own
   * ruling and the reason nothing here normalises.
   */
  const tiltBlock = (direction: 1 | -1): void => {
    const at = focusedPlot();
    if (at === null) return;
    stores.cameras.nudge(at.entryId, at.plot.id, at.plot.camera, {
      elevation: (direction * Math.PI) / 16,
    });
    scheduler.commit("input");
  };

  /**
   * Dolly the focused plot's camera, **multiplicatively** (C22 I75).
   *
   * **A scaling control cannot reach the one degenerate value.** `distance: 0`
   * draws nothing and is the answer rather than a refusal (C12 §3al); measured,
   * it is the *only* such value — `0.01` inks 1776 cells and `−6` inks the same
   * 297 as `+6`, because a negative distance is the antipodal view. So the
   * hazard is passing **through** a blank frame with a working control, and
   * `× 1.25` never reaches zero from anywhere but zero.
   *
   * The store takes a delta and clamps nothing, so the step is computed here
   * from the live value — `pageBlock`'s seam, where the effect knows the
   * arithmetic and the store records what it is told.
   */
  const dollyBlock = (direction: 1 | -1): void => {
    const at = focusedPlot();
    if (at === null) return;
    const now = stores.cameras.cameraFor(at.entryId, at.plot.id, at.plot.camera).distance;
    const next = direction === 1 ? now / DOLLY : now * DOLLY;
    stores.cameras.nudge(at.entryId, at.plot.id, at.plot.camera, { distance: next - now });
    scheduler.commit("input");
  };

  /** Restore the focused plot's declared view, leaving the orbit alone (C22 I75). */
  const resetCamera = (): void => {
    const at = focusedPlot();
    if (at === null) return;
    stores.cameras.reset(at.entryId, at.plot.id, at.plot.camera);
    scheduler.commit("input");
  };

  /**
   * Start or stop the focused plot turning (C22 I72).
   *
   * **Off is the default and nothing declares otherwise**: a block cannot say
   * that it orbits (C04 I75), and an orbiting 3D plot is a full-frame redraw for
   * as long as it is on screen where a static one is a single cached render. So
   * the reader turns it on, and this is the only thing that can.
   */
  const toggleOrbit = (): void => {
    const at = focusedPlot();
    if (at === null) return;
    const on = !stores.cameras.orbiting(at.entryId, at.plot.id);
    stores.cameras.setOrbit(at.entryId, at.plot.id, at.plot.camera, on);
    // `input`, because a key caused it and the flag itself draws nothing — the
    // frame it asks for is the one that arms the ticker (C22 I60a).
    scheduler.commit("input");
  };

  const keys = createKeyEffects({
    editor: stores.editor,
    completion: built.completion,
    overlays: stores.overlays,
    history: stores.history,
    manifest: built.manifest.manifest,
    viewport: stores.viewport,
    schedule: config.schedule,
    anchor: deps.frame.promptAnchor,
    overlayRegion: deps.frame.overlayRegion,
    patchView,
    documentView,
    releaseView: () => void pipeline.releaseView(),
    focus,
    // The entry half of B1's pair; the exit is already on the `⌃c` rung below.
    enterCopyMode: deps.frame.enterCopyMode,
    // **One walk, and it is the registry's** (C26 §5, §8b.4). This asked C11
    // directly and tested `block.kind === "table"`, which was one of *three*
    // such walks — the two below and `focusFor` in `session.ts`. Each was a
    // separate answer to *what is here*, and the comment on the next one had
    // already named the hazard while sitting beside the walk it warned about.
    //
    // **It also only ever saw the top level**, so a table inside a `panel` could
    // not be focused at all. `elementsIn` recurses because the registry already
    // walks children for `measure` and `render` (C26 §8b.5).
    // **One dep where there were two** (C26 §8b.7). `liveRows` mapped this to a
    // flat list of ids and `liveRowAction` walked it again by id — two answers
    // to *what is here*, in the file whose comment named that hazard. The
    // second's stated reason (cheap on arrows, expensive on `enter`) was
    // falsified by this very walk: both call `liveElements()`.
    liveElements,
    pageBlock,
    orbitBlock,
    tiltBlock,
    dollyBlock,
    resetCamera,
    toggleOrbit,
    liveEntryId: () => stores.transcript.liveId,
    // C23 I16 — the dispatcher is C23's and is supplied, never built here.
    onAction: (action, from) => {
      pipeline.onAction(action, from);
    },
    // **I31 — an effect that settles after its batch commits its own frame.**
    // `"completion"` because its window is zero (C03 I2): by the time this
    // fires the screen is already showing a state that no longer holds, which
    // is the opposite of the case a coalescing window is for.
    redraw: () => void scheduler.commit("completion"),
  });
  // Step 8's handler reaches the anchors through this, declared above it.
  refreshAnchors = () => void keys.refreshAnchors();

  /**
   * When the last input batch landed, for the cursor's blink edge (C22 I64).
   *
   * At graph scope rather than inside the input block, because the frame reads
   * it and the input path writes it — the same reason `promptUnderMenu` is
   * here rather than recomputed in `session.ts`.
   */
  let lastInputAt = config.clock();

  /**
   * Is the prompt still answering keys under whatever is on the stack (I51)?
   *
   * **One definition, two readers.** The router's precedence and the cursor's
   * both ask it, and a second copy of the rule is how a cursor comes to claim
   * the prompt is inert while the prompt is taking keys. True for exactly one
   * layer: a completion menu holding no selection, which is a display of what
   * is available rather than a choice being made (C19 I20).
   */
  const promptUnderMenu = (): boolean =>
    stores.overlays.top?.id === MENU_ID && keys.selected === null;

  /** A bound action, or `null` when the key is not bound at this target. */
  const bound = (target: FocusTarget, e: InputEvent): (() => void) | null => {
    if (e.kind !== "key") return null;
    const binding = keymap.resolve(target, e.key);
    if (binding === null) return null;
    // A block keymap's action is a surface's string and dispatches through
    // C23 §3a; the built-in table is total over C16's union and has no entry
    // for one (C16 I19).
    return keys.table[binding.action as KeyAction] ?? null;
  };

  at("register", () => {
    /**
     * The prompt's own handler, named so the overlay's can call it (I51).
     *
     * **A layer that is chrome for the prompt does not stop typing.** With any
     * dismissable layer on the stack `activeTarget` answers `overlay`, that
     * handler consumes only what it binds, and step 3's `global` binds no
     * printable key — so a character typed with the menu up is dropped. Not
     * taken by the menu: dropped by nobody, measured against the same key with
     * no layer open. `Tab` alone made that survivable; a menu that opens as you
     * type (C19 I19) makes it typing stopping the moment it appears.
     */
    const promptKeys = (e: InputEvent): boolean => {
      const effect = bound("prompt", e);
      if (effect !== null) {
        effect();
        return true;
      }

      // **`enter`, not `return`** — C16 I17's rule applied to a handler rather
      // than to a keymap row. The decoder has only ever produced `enter` for
      // `\r`, so this test named a key nothing sends and Enter did not submit.
      // It was invisible because no decoded event ever reached the router: the
      // two halves were each correct about a name and never compared.
      if (e.kind === "key" && e.key.name === "enter") {
        // The line goes away, so the menu and `Esc`'s hold on the token go with
        // it (C19 I19): suppression is per token, and the next line's first
        // token starts at the same offset the dismissed one did.
        keys.reset();
        // **The one resolution site** (roadmap 30). C23 takes a string, C18
        // classifies one and C05 describes `argv`, so a chip becomes its content
        // here and no sentinel reaches the far side. Every other reader sees the
        // buffer as it is, because three of them read an index alongside it.
        pipeline?.submit(stores.editor.resolved);
        return true;
      }

      // A paste is one edit and one undo unit (C17 I5), which is why it is a
      // kind of its own here rather than a run of keys.
      // **A keystroke supersedes a pending completion** (I39, C19 §7). C19
      // holds the whole mechanism — `cancel()` invalidates the token and a
      // superseded request resolves with no candidates (C19 I13) — and nothing
      // in the shell was the caller, so typing after a `Tab` on a slow source
      // opened a menu a second later for a prefix the user had moved past.
      //
      // Not covered by the effect table's `mine !== seq` guard, which is why
      // that guard looked like the mechanism: it compares the shell's own
      // sequence, and a printable keystroke does not advance it.
      if (e.kind === "paste") {
        built.completion.cancel();
        // Numbered per session and never reset: `[#2]` after `[#1]` was deleted
        // is a reader seeing that something else was there, which is true.
        // Resetting would give one prompt two `[#1]`s across two submissions.
        // **A large paste becomes a chip** (roadmap 30). The threshold is lines
        // and not bytes, because what makes a paste unreadable in a prompt is
        // the rows it takes: a 4 KB single line wraps and is still one thing to
        // read past, while five short lines are five rows of prompt.
        //
        // **Line count only, and the kind detection is the named residue.** The
        // entry wants `[JSON · 47 lines]` — one parse attempt — and that is a
        // second decision with its own failure mode, a paste that *nearly*
        // parses. The first version says how big it is and nothing about what it
        // is, and the label is what a reader sees, so widening it later changes a
        // string rather than a mechanism.
        const lines = e.text.split("\n").length;
        if (lines >= CHIP_LINES) {
          chipCount += 1;
          stores.editor.insertChip({
            label: `[#${String(chipCount)} pasted · ${String(lines)} lines]`,
            content: e.text,
          });
        } else {
          stores.editor.insert(e.text, { atomic: true });
        }
        keys.afterEdit();
        return true;
      }

      if (e.kind === "key" && isPrintable(e.key)) {
        built.completion.cancel();
        stores.editor.insert(e.key.sequence);
        // **The menu opens as you type** (C19 I19). `suggest` is static and
        // synchronous, so this is a filter over an array and not a source call
        // — the half of C19 I3 that has to survive the menu learning to open
        // itself, and the one no assertion about candidates would notice.
        keys.afterEdit();
        return true;
      }

      return false;
    };

    router.register("prompt", promptKeys);

    router.register("overlay", (e) => {
      // **A completion menu holding no selection lets the prompt answer first**
      // (C19 I20). It is a display of what is available rather than a choice
      // being made, so `Enter` submits, `↑` is history, `Tab` is `complete` and
      // printable keys type. A precedence between two targets rather than a
      // list of key names, which would be a second keymap in the composition
      // root (C16 I23) — and `Esc` needs no exception, because the prompt does
      // not bind it and it falls through to `dismiss` below.
      if (promptUnderMenu() && promptKeys(e)) return true;

      const effect = bound("overlay", e);
      if (effect !== null) {
        effect();
        return true;
      }

      // The forward (I51). A requested menu needs it too: C19 §8's keystroke
      // cell narrows it in place, and that cell is unreachable while the
      // character is dropped before it arrives.
      if (stores.overlays.top?.id === MENU_ID) return promptKeys(e);

      // **A reverse search narrows as you type** (C20 §7), and this branch is
      // the one that did not exist. The forward above is the menu's, so a
      // printable key under a *search* matched no overlay binding, reached the
      // `return false` below, and was dropped — C20 declared `searchType` and
      // `searchBackspace`, `store.ts` implemented them, a revert test covered
      // them, and no caller existed anywhere in `src/`. FINDINGS F97.
      if (stores.overlays.top?.id === SEARCH_ID && e.kind === "key") {
        if (e.key.name === "backspace") {
          keys.searchTyped(null);
          return true;
        }
        if (isPrintable(e.key)) {
          keys.searchTyped(e.key.sequence);
          return true;
        }
      }
      return false;
    });

    // **The target `↓` now leads to** (C16 I22). Registered for the same reason
    // the others are: a binding with no handler is a key that resolves and does
    // nothing, and this target had neither bindings nor a handler while §3 said
    // focus goes here.
    router.register("liveBlock", (e) => {
      const effect = bound("liveBlock", e);
      if (effect === null) return false;
      effect();
      return true;
    });

    // **The target that had a name and no vocabulary** (C16 I24). `pushedView`
    // has been in the focus union since C16 was written; `activeTarget` resolved
    // to it and there was neither a binding nor a handler, so every key fell
    // through to step 3 — which is also why a `PgUp` over a view scrolled the
    // transcript underneath it. Vacuous only while nothing pushed a view.
    router.register("pushedView", (e) => {
      const effect = bound("pushedView", e);
      if (effect === null) return false;
      effect();
      return true;
    });

    // Scroll is Seam 4's C22 row: C14 moves and **C22 commits** (C14 I12). A
    // viewport that committed its own frame would be L2 reaching into L0.
    //
    // **The commit is the loop's, not this handler's** (I27). Two committers
    // means one frame too many for a scroll and none for whichever handler
    // forgets, and only the second is invisible.
    // **Everything that is a key resolves through the keymap** (C16 I23). The
    // four scroll keys used to be a `switch` here, which is a second mechanism
    // for one target's key handling and is why `/help` could not show them —
    // help renders from the table, and they were not in it. Two of the four
    // were reachable by nothing at all.
    //
    // The wheel stays, because a wheel event is not a key: it has no
    // `(target, key)` to resolve on. That is the boundary rather than an
    // exception to it.
    router.register("global", (e) => {
      const effect = bound("global", e);
      if (effect !== null) {
        effect();
        return true;
      }
      const move = wheelAmount(e);
      if (move === null) return false;
      move(stores.viewport);
      return true;
    });
  });

  // --- 12. the read loop ----------------------------------------------------
  // Startup step 8's mechanism (I24). C16's decoder owns no timer and C01
  // delivers bytes and interprets none; neither is wired to the other by
  // existing, and nothing else in the tree may read stdin.
  const decoder = at("decoder", () =>
    createDecoder({ capabilities: detection.capabilities, now: config.clock }),
  );

  at("input", () => {
    let wake: Disposable | null = null;
    let blinkWake: Disposable | null = null;

    /**
     * One commit per decoded batch, and no handler commits (I27).
     *
     * **`arm()` runs on every chunk, including the ones that decode to
     * nothing** (I32). The early return used to sit above it, and an empty
     * batch is exactly the state that needs a wake: a lone `Esc` is held for
     * the 50 ms disambiguation window and emits no event at all, so the
     * deadline was never armed and the key arrived only when the *next* one
     * did. That is the symptom `arm()`'s own comment describes — a key that
     * appears to do nothing until you press another one — and the guard added
     * for the empty case defeated the mechanism written for it.
     *
     * The commit still belongs to a non-empty batch: nothing changed, so
     * nothing needs drawing.
     */
    const deliver = (events: readonly InputEvent[]): void => {
      if (events.length > 0) {
        for (const e of events) router.dispatch(e);
        stampInput();
        scheduler.commit("input");
      }
      arm();
    };

    /**
     * The cursor's blink edge (C22 I64, §6f).
     *
     * **A wake on the driver's own scheduler, never a `setInterval` in
     * `paint.ts`** — the constraint that survived the expiry of its premise.
     * *Steady on a keystroke* is free, because a keystroke already composes a
     * frame (I27); only the **idle edge** has no frame of its own, which is
     * I31's shape reached through a third timer.
     *
     * **Armed only where a declared style blinks.** The spinner arms
     * unconditionally on the argument that it is cheap, and its wake follows a
     * *request*; this one would follow every keystroke, so an application
     * declaring no cursor would pay one composed frame per typing pause for a
     * resolution that emits nothing.
     *
     * **A burst of keys arms one wake, and the mechanism is the disposal rather
     * than a generation guard.** The spinner's shape was copied here first —
     * `seq += 1`, `if (mine === seq)` — and the mutation pass found it dead:
     * `schedule` returns a disposable that calls `clearTimeout`, so a cancelled
     * wake never fires and the counter can never disagree. **The spinner's own
     * guard is not dead, and the difference is the reason**: it arms without
     * cancelling, so the counter is its only mechanism. Copying the shape
     * without the reason is what produced code that read as careful and
     * forbade nothing.
     */
    const blinks = anyBlinking(config.cursor);
    const stampInput = (): void => {
      lastInputAt = config.clock();
      if (!blinks) return;
      blinkWake?.[Symbol.dispose]();
      blinkWake = config.schedule(() => {
        blinkWake = null;
        scheduler.commit("input");
      }, CURSOR_BLINK_MS);
    };

    // The three timeouts C16 reports and does not fire: the escape window, the
    // paste heuristic, the exit arming. Without this a lone `Esc` is delivered
    // when the *next* key arrives — a key that appears to do nothing until you
    // press another one.
    function arm(): void {
      wake?.[Symbol.dispose]();
      wake = null;
      const at = decoder.nextDeadline();
      if (at === null) return;
      wake = config.schedule(() => {
        wake = null;
        deliver(decoder.poll());
      }, Math.max(0, at - config.clock()));
    }

    lifecycle.onInput((chunk) => void deliver(decoder.push(chunk)));
  });

  return Object.freeze({
    /**
     * I51 — the router's precedence, for the one other reader of it.
     *
     * On the graph rather than recomputed in `session.ts`, because the cursor
     * and the dispatch must not be able to disagree about whether the prompt is
     * taking keys.
     */
    promptUnderMenu,
    suppressBackground: () => suppressBackground,
    /**
     * Whether the cursor is past its idle threshold (C22 I64).
     *
     * A **paint-time read**, on the same terms as `spinning` and the ghost
     * (I38, I50): it changes with the clock rather than with the frame, so a
     * value captured when the key arrived could never become true.
     */
    cursorIdle: () => config.clock() - lastInputAt >= CURSOR_BLINK_MS,
    liveElements,
    pageBlock,
    orbitBlock,
    tiltBlock,
    dollyBlock,
    resetCamera,
    toggleOrbit,
    capabilities: detection.capabilities,
    /**
     * C22 I6a — construction, then the session, then what the session contained.
     *
     * **Two of these three were collected and read by nothing**: C20's
     * `warnings` reached no caller in `src/`, so a corrupt history file or a
     * read-only home was detected, described and discarded for the life of every
     * session, and C23 collected nothing at all (F15). C02's ruling —
     * *the component decides what is wrong, never when the user is told* — is
     * only half a ruling until something drains them.
     *
     * **Four sources now, and the fourth's absence was structural rather than an
     * omission** (C09 I29, F223): L1 cannot reach this list, so a contained
     * renderer had nowhere to report and reported nowhere — for the life of the
     * registry, and with T3.14's own row saying `logged` the whole time.
     *
     * The four are kept contiguous deliberately. `c23-faults` mutates this list
     * by removing members, and a comment between two of them makes an anchor
     * that spans the list unmatchable — which is how a mutation quietly becomes
     * a different mutation (F219).
     */
    diagnostics: () =>
      Object.freeze([
        ...detection.warnings,
        ...stores.history.warnings,
        ...built.blockFaults.messages,
        ...pipeline.faults,
      ]),
    blocks: built.blocks,
    blockFaults: built.blockFaults,
    adapters: built.adapters,
    manifest: built.manifest,
    completion: built.completion,
    ...stores,
    runner,
    lifecycle,
    scheduler,
    router,
    focus,
    pipeline,
    session,
    confirm,
    log: Object.freeze([...log]),
  });
}

/**
 * The wheel, which is the only scroll input that is not a key.
 *
 * **This function used to hold the keys too, and that was the defect** (C16
 * I23). A key handled here is one `/help` cannot render, because help renders
 * from the keymap — so PageUp has always scrolled and has never been
 * discoverable — and two of the four arms, `home` and `end`, were reachable by
 * nothing at all: the prompt binds both and resolves ahead of `global` at every
 * moment it has focus. They are `global` bindings now, and the document's
 * extremes are `⌃Home`/`⌃End`.
 *
 * A wheel event has no `(target, key)` to resolve on, so it stays. `null` means
 * "not a scroll", which is what lets the handler decline without consuming
 * (C16 I5).
 */
type Scroller = ReturnType<typeof createViewport>;

const WHEEL_ROWS = 3;

function wheelAmount(e: InputEvent): ((v: Scroller) => void) | null {
  if (e.kind === "mouse" && e.press) {
    if (e.button === "wheelUp") return (v) => void v.scrollBy(-WHEEL_ROWS);
    if (e.button === "wheelDown") return (v) => void v.scrollBy(WHEEL_ROWS);
  }
  return null;
}

/**
 * C16's sixteen pulls, every one supplied here — seventeen until `busy` and
 * `shellChild` became one `inFlight` that returns the route (C16 §5).
 *
 * **Every one is a pull and none is a subscription** (C16 §2). C13 emits
 * `append` then `evict` for one call, so a consumer reading deltas as current
 * state sees a half-applied store — which cost C14 a blank screen that every
 * assertion passed.
 */
function routerDeps(
  stores: {
    transcript: ReturnType<typeof createTranscriptStore>;
    overlays: ReturnType<typeof createOverlayManager>;
    editor: ReturnType<typeof createEditor>;
  },
  runner: ProcessRunner,
  scheduler: ReturnType<typeof createFrameScheduler>,
  frame: FrameQueries,
  pipeline: () => Pipeline | null,
  confirm: ConfirmHost,
): RouterDeps {
  const top = (): Readonly<{ kind: "overlay" | "view"; id: string; dismissable: boolean }> | null => {
    const layer = stores.overlays.top;
    return layer === null
      ? null
      : { kind: layer.kind, id: layer.id, dismissable: layer.dismissable };
  };

  return {
    overlayTop: top,
    overlayAnswerCallback: confirm.answerHandler,
    overlayRegion: frame.overlayRegion,
    placed: () => stores.overlays.layout(frame.overlayRegion()),
    popLayer: () => void stores.overlays.pop(),
    copyMode: frame.copyMode,
    exitCopyMode: frame.exitCopyMode,
    // `liveId`, not a `live` entry: C13 exposes the id and C16 only compares it.
    liveEntry: () => {
      const id = stores.transcript.liveId;
      return id === null ? null : { id };
    },
    entryAtRow: frame.entryAtRow,
    // **Rungs 1 and 2, from C23 rather than from the runner** (C16 §5, C23 §8a
    // A1). `runner.live` is empty through the window C23 I3 opens on purpose —
    // the pending entry is appended before the transport is invoked — so a
    // runner-sourced answer says "idle" while a verb is in flight, and Ctrl-C
    // fell past every rung and cleared the prompt.
    inFlight: () => pipeline()?.inFlight ?? null,
    // §5's subscription rung. Read through the same accessor as `inFlight`,
    // because the pipeline is constructed after the router and a captured
    // reference here would be the null one.
    liveStreams: () => pipeline()?.liveStreams ?? 0,
    cancelNewestStream: () => pipeline()?.cancelNewestStream() ?? false,
    // C23's, not `runner.killAll`: killing the child leaves the entry streaming
    // forever, and C23 I10 settles it `partial` with its output retained.
    cancel: () => void pipeline()?.cancel(),
    signalShellChild: () => {
      for (const handle of runner.live) handle.signal("SIGINT");
    },
    region: frame.region,
    mouseEnabled: frame.mouseEnabled,
    promptHasText: () => stores.editor.text.length > 0,
    clearPrompt: () => {
      stores.editor.setText("");
      scheduler.commit("input");
    },
    raiseExitConfirm: frame.raiseExitConfirm,
  };
}


/**
 * The subprocess transport, when the app supplies no router.
 *
 * **C22 always owed this and never built it**, because nothing consumed it:
 * `resolveConfig` passed `transport` through possibly-undefined and the graph
 * had no field for one. A02 §3 and C22 §2 both say the default is subprocess,
 * and C23 is the first thing that would have noticed it was absent.
 *
 * `cwd` is a function rather than a value (C06 commitment 14, C22 I12): a `cd`
 * between two verbs has to move the second one, and a value read here cannot.
 */
function defaultTransport(
  config: ResolvedConfig,
  runner: ProcessRunner,
  session: SessionStore,
): TransportRouter {
  return createTransportRouter({
    default: createTransport({
      mode: "subprocess",
      binary: config.binary,
      runner,
      clock: { now: config.clock, schedule: config.schedule },
      env: config.env,
      cwd: session.cwd,
    }),
  });
}

/** `open`, `start` or `xdg-open` — the OS handler, by platform. */
const OPENER: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "open",
  win32: "start",
};

/**
 * The default `openUrl`, and the second thing C22 owed with no consumer.
 *
 * **It spawns and never shells** (C23 I17, A01 D18). A URL from a far-side
 * envelope is untrusted data, and `spawnShell("open " + url)` would be an
 * injection through the one path that otherwise has none — so the URL travels as
 * an argv element, where no shell can read it as syntax.
 *
 * The scheme check is C23's and stays C23's (I17). Doing it here as well would be
 * two guards over one condition, which is the arrangement C16's rung 1 was in.
 */
function defaultOpener(
  platform: NodeJS.Platform,
  runner: ProcessRunner,
  session: SessionStore,
): (url: URL) => Promise<void> {
  const command = OPENER[platform] ?? "xdg-open";
  return async (url) => {
    // `cwd` is the function, not its value — C21 I10 reads it at spawn.
    runner.spawn([command, url.href], { cwd: session.cwd });
    return Promise.resolve();
  };
}

/**
 * A key that types a character, as opposed to one that means something.
 *
 * The test is on the modifiers and on the sequence being one printable
 * codepoint, rather than on a list of named keys: a list is the shape that goes
 * stale as the decoder learns new names, and every name it learns would
 * otherwise start typing itself into the prompt.
 */
function isPrintable(key: Key): boolean {
  if (key.ctrl || key.meta) return false;
  if (key.sequence.length === 0) return false;
  const [first] = [...key.sequence];
  if (first === undefined || [...key.sequence].length !== 1) return false;
  const code = first.codePointAt(0) ?? 0;
  return code >= 0x20 && code !== 0x7f;
}
