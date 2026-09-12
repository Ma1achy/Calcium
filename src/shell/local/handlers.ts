/**
 * The local handlers Calcium ships — the concerns it owns (C23 §2).
 *
 * An app registers its own alongside them, and `seal()` reconciles both against
 * the manifest (C23 I27). These six exist because the framework owns what they
 * touch: the manifest, the transcript, the theme, history, an entry's invocation
 * record, and the session's life.
 *
 * **`/help` renders from the manifest and C16's keymap, never from a maintained
 * list** (C23 I26). A hand-written help text guarantees drift eventually: every
 * verb it names is one C05 will accept and every binding it shows is one C16 will
 * dispatch, because both are read rather than restated.
 */

import { visibleTools } from "../../data/manifest/index.js";
import type { Manifest } from "../../data/manifest/index.js";
import { block } from "../../data/viewmodel/index.js";
import type { Block, LocalDocument } from "../../data/viewmodel/index.js";
import type { TranscriptStore } from "../../viewport/transcript/index.js";
import type { HistoryEntry } from "../../interaction/history/types.js";
import { glyphs } from "../../presentation/blocks/index.js";
import type { GlyphCaps } from "../../presentation/blocks/index.js";
import type { ThemeStore } from "../../presentation/theme/index.js";
import { b } from "../builders/index.js";
import { blockId, compose, warnNotice } from "../documents.js";
import { CARDS, SECTIONS, profileCard } from "../profiling/panes/index.js";
import { ms } from "../profiling/panes/kit.js";
import type { ProfileSection } from "../profiling/panes/index.js";
import { TIER_RANK } from "../profiling/types.js";
import type { CaptureResult, ProfileReport } from "../profiling/types.js";
import type { ProfileView } from "../profile-view.js";
import type { LocalHandler } from "./registry.js";
import type { StopReason } from "../types.js";

export type HandlerDeps = Readonly<{
  manifest: () => Manifest | null;
  transcript: TranscriptStore;
  theme: ThemeStore;
  /**
   * Persist the chosen variant (C22 I40).
   *
   * Optional, because this file is the local verbs and a harness driving them
   * has no state directory. A session always supplies it.
   */
  persistTheme?: (name: string) => void;
  /**
   * `--no-bg` for this invocation (C22 I66).
   *
   * Not optional, unlike `persistTheme`: that one reaches a disk a harness has
   * no reason to have, and this one is session state every caller holds.
   */
  setSuppressBackground: (suppressed: boolean) => void;
  history: () => readonly HistoryEntry[];
  /** Every binding C16 will dispatch, for `/help` (C23 I26). */
  bindings: () => readonly Readonly<{ keys: string; does: string }>[];
  stop: (reason: StopReason) => Promise<number>;
  /**
   * C28 §3c's view, for `/profile` (C23 I68) — the way `stop` is for `/exit`.
   *
   * **Required, because the row is.** `FRAMEWORK_TOOLS` declares seven verbs
   * and C23 I27 refuses a row without a handler at every startup, so the view
   * has to arrive whether or not a profiler does: the root always builds one,
   * and a view with no recorder behind it refuses through the route rather than
   * vanishing (T4.67). This was optional, with the handler included only when a
   * view was handed in, while the row and `execution.ts`'s call site were
   * outside the round that wrote it (T1.64's second arm watched that).
   */
  profileView: ProfileView;
  /**
   * The report, for `/profile snapshot` and `/profile live` (C23 I69, amended).
   *
   * **A reader and not a profiler.** The two verbs put a card in the transcript
   * and neither may raise the tier — a transcript part has no close, so a raise
   * would pin the tier for the session and reset the ring doing it (C28 I50,
   * I18). Handing over `() => ProfileReport | null` rather than the recorder is
   * what makes `setTier` unreachable from here rather than merely unused.
   *
   * `null` when the session was built without `TuiConfig.profile`, which is the
   * same state `profileView.open` refuses on.
   */
  profileReport: () => ProfileReport | null;
  /**
   * `/profile capture`'s one operation, `null` where no profiler exists
   * (C28 I64).
   *
   * **A capability rather than the recorder**, so the verb cannot raise a tier
   * even by mistake — the raise resets the ring (C28 I18), which turns *let me
   * look* into *discard what I was watching*. The refusal below `deep` is read
   * off the report's own `regime.tier` and nothing here can change it.
   */
  profileCapture: ((ms: number) => Promise<CaptureResult>) | null;
}>;

const isSection = (x: unknown): x is ProfileSection =>
  typeof x === "string" && (SECTIONS as readonly string[]).includes(x);

/**
 * `/profile [section]` — open C28's view (C23 I68, I69).
 *
 * **It appends a notice and never the cards.** The deck is drawn in the layer
 * the view refreshes; a document holding a report would freeze one reading into
 * the transcript's record and read as current on every later frame, which is
 * I18's stale-data shape with the framework's own figures inside it. The two
 * verbs that *do* put a card in the transcript — `snapshot` and `live` — carry a
 * stamp or a cadence for exactly that reason (C23 I69, amended).
 *
 * **The section comes from `ctx.args`, never from `argv[0]`** (C22 I66), for
 * `/theme`'s reason: C05 parsed and enum-checked it, and a second reader of one
 * fact drifts from the first. `argv` is read on the failure arm alone — `args`
 * is empty there, because a local verb is not gated on validation — to quote
 * the token that was typed, and to tell *no argument* from *a bad one*.
 *
 * Every refusal is a document on this route rather than a throw (C23 I2): the
 * view's own strings for *no profiler* and *something is open*, and a usage
 * line for a section that is not one of C28's three.
 */
/**
 * The stamp (C23 I69, amended).
 *
 * **Four fields, and the reason each is there is that a reader a week later
 * cannot work it out.** The frame range and the elapsed time say *when*; the
 * tier says what was being recorded, because a figure at `counters` is a count
 * and not a duration; and the ring's reset point says how far back the window
 * reaches, since a raise resets it (C28 I18) and a percentile over a reset ring
 * describes the time since, not the session.
 *
 * A stamp claims the opposite of current on its own face, forever, which is the
 * property I69's first form tried to get by forbidding the document.
 */
const sepOf = (caps: GlyphCaps): string => ` ${glyphs(caps).separator} `;

const stampOf = (r: ProfileReport, card: string, caps: GlyphCaps): string => {
  const frames = `${String(r.frames)} frames`;
  const dropped = r.dropped.frames > 0 ? `, ${String(r.dropped.frames)} past the ring` : "";
  const elapsed = `${(r.regime.durationMs / 1000).toFixed(1)} s`;
  const reset = r.regime.ringReset > 0
    ? `ring reset ${(r.regime.ringReset / 1000).toFixed(1)} s in`
    : "ring never reset";
  // **The separator is resolved, never written** (C09 I49, F828). A title is a
  // head measured in cells, and `·` is ambiguous-width — T2.116 caught the
  // literal here, which is the rule doing exactly what it is for.
  const sep = sepOf(caps);
  return [
    card,
    `${frames}${dropped}`,
    `captured ${elapsed}`,
    `tier ${r.regime.tier}`,
    reset,
  ].join(sep);
};

/** How often a live card refetches — the view's cadence, for the view's reasons. */
const LIVE_EVERY_MS = 1000;

/**
 * The rows a snapshot card is drawn at.
 *
 * **A figure and not the region**, which is the whole of why the verb exists:
 * the overlay is one screen and does not scroll, so an icicle of a 47 ms frame
 * is cramped there and right in scrollback, where it can be scrolled past and
 * compared with the next one. `ctx.height` is the *viewport's* height and would
 * reproduce the cramping in the one place that is not bound by it.
 *
 * The width is `ctx.width` — that one is a real constraint, and a card drawn
 * wider than the transcript wraps (C01's width rule, the direction that
 * corrupts).
 */
const SNAPSHOT_ROWS = 32;

/**
 * The card a document verb draws, named or defaulted.
 *
 * **The verdict rather than whatever the view is showing**, and the difference
 * matters: the prompt takes no keys while a view is top (C16 §3), so a reader
 * who has walked to `frame on a clock` has to close the view before they can
 * type `/profile snapshot` — and by then there is no open card to mean. The
 * card is named on the line or it is the verdict.
 */
const cardFor = (wanted: unknown): string =>
  typeof wanted === "string" && CARDS.some((c) => c.id === wanted) ? wanted : "verdict";

/**
 * How long `/profile capture` samples for, and what a reader may ask instead.
 *
 * **400 ms rather than a second**, because a capture blocks the prompt and the
 * route shows a stall notice past its own threshold: a window long enough to
 * hold a few hundred samples at V8's 100 µs interval, and short enough that
 * pressing it does not read as a hang. The bounds are the honest ones — under
 * 50 ms a window holds too few samples to be a distribution, and over 10 s the
 * profile is large enough that the cap starts deciding what it holds.
 */
const CAPTURE_MS = 400;
const CAPTURE_MIN = 50;
const CAPTURE_MAX = 10_000;

const profileHandler =
  (view: ProfileView, report: () => ProfileReport | null,
   take: ((ms: number) => Promise<CaptureResult>) | null): LocalHandler =>
  async (argv, ctx) => {
  const wanted = ctx.args["section"];
  const card = cardFor(ctx.args["card"]);

  // --- the capture verb (C28 I64) --------------------------------------------
  if (wanted === "capture") {
    const r = report();
    if (r === null || take === null) {
      return doc("/profile capture", [
        warnNotice(
          "no profiler to capture with — this session was built without `TuiConfig.profile`",
          blockId("profile-refused"),
        ),
      ]);
    }
    // **It names the tier and does not take it** (C28 I64, I18). The inspector
    // exists only at `deep`, and a verb that raised the tier to get one would
    // reset the ring the reader has been watching — so the refusal is the
    // whole of the arm, and the sentence says what to change rather than what
    // went wrong.
    if (TIER_RANK[r.regime.tier] < TIER_RANK.deep) {
      return doc("/profile capture", [
        warnNotice(
          `a CPU capture needs tier \`deep\` and this session is at \`${r.regime.tier}\` — ` +
            "set `profile: { tier: \"deep\" }` and restart; raising it from here would reset " +
            "the ring every figure on the deck is drawn from (C28 I18)",
          blockId("profile-capture-tier"),
        ),
      ]);
    }
    const asked = Number(ctx.args["card"] ?? CAPTURE_MS);
    const window = Number.isFinite(asked)
      ? Math.min(CAPTURE_MAX, Math.max(CAPTURE_MIN, asked))
      : CAPTURE_MS;
    const result = await take(window);
    const stacks = result.stacks;
    const sep = sepOf(ctx.capabilities);
    if (stacks === null) {
      return doc("/profile capture", [
        warnNotice(
          `nothing was sampled in ${String(window)} ms${sep}the process was idle for the ` +
            `whole window, or every sample fell in a synthetic frame${sep}${result.path}`,
          blockId("profile-capture-empty"),
        ),
      ]);
    }
    const idle = Object.values(stacks.excluded).reduce((n: number, us: number) => n + us, 0);
    // **The measured window, not the asked one.** `setTimeout(r, ms)` is a
    // floor, and V8's `timeDeltas` describe what actually elapsed: measured at
    // 700 asked against 710.6 sampled on an idle process, and **839 against the
    // same 700 under the running TUI**. Printing the ask beside shares of the
    // real window put two incommensurable figures in one sentence, and read on
    // the frame as 140 + 699 of 700.
    return doc("/profile capture", [
      b.notice(
        "info",
        `captured over ${ms(result.durationMs)} ms${sep}${ms(stacks.root.total / 1000)} ms on the stack` +
          `${sep}${ms(idle / 1000)} ms in synthetic frames${sep}${result.path}` +
          `${sep}\`/profile framework\` and walk to \`sampled-stacks\``,
        undefined,
        { id: blockId("profile-capture") },
      ),
    ]);
  }

  // --- the two document verbs (C23 I69, amended) -----------------------------
  if (wanted === "snapshot" || wanted === "live") {
    const r = report();
    if (r === null) {
      return doc("/profile", [
        warnNotice(
          "no profiler to show — this session was built without `TuiConfig.profile`",
          blockId("profile-refused"),
        ),
      ]);
    }
    if (wanted === "snapshot") {
      // **One-shot and stamped**, which is the pair: the document is a reading
      // taken at a moment and it says which moment on its own title.
      return doc("/profile snapshot", [
        b.panel(stampOf(r, card, ctx.capabilities), [...profileCard(r, card, { w: ctx.width, rows: SNAPSHOT_ROWS }, ctx.capabilities)], {
          id: blockId("profile-snapshot"),
        }),
      ]);
    }
    // **Live and unstamped**, which is the other half: a part that refetches is
    // current because it is refreshed, so a stamp on it would be a second claim
    // about the same fact and the two would disagree between ticks.
    //
    // **It calls no `setTier`** — there is no recorder here to call it on. At a
    // tier below `spans` it draws C28's own notice rather than silently turning
    // the profiler on behind the reader, which is what makes the rule honest
    // rather than merely observed.
    return doc("/profile live", [
      b.live({
        id: blockId("profile-live"),
        // The same resolved separator as the stamp's (C09 I49) — a title is a
        // head, whichever verb composed it.
        title: `${card}${sepOf(ctx.capabilities)}live`,
        every: LIVE_EVERY_MS,
        fetch: () => Promise.resolve(report()),
        render: (data, pctx) => {
          const now = (data as ProfileReport | null) ?? r;
          if (TIER_RANK[now.regime.tier] < TIER_RANK.spans) {
            return b.notice(
              "warn",
              `the tier is \`${now.regime.tier}\` and a live card never raises it — ` +
                "open `/profile` to watch the deck, which raises to `spans` while it is open " +
                "and restores the tier on close (C28 I50)",
              undefined,
              { id: `${blockId("profile-live")}-tier` },
            );
          }
          const rows = pctx.height ?? 24;
          const only = profileCard(now, card, { w: pctx.width, rows }, pctx.capabilities)[0];
          return only ?? b.notice("warn", `no card \`${card}\``, undefined, { id: `${blockId("profile-live")}-gone` });
        },
      }),
    ]);
  }

  const section: ProfileSection | null = isSection(wanted)
    ? wanted
    : argv.length === 0
      ? "verdict"
      : null;
  if (section === null) {
    return doc("/profile", [
      warnNotice(
        `usage: /profile [${SECTIONS.join("|")}|snapshot|live|capture] [card] — got \`${argv[0] ?? ""}\``,
        blockId("profile-usage"),
      ),
    ]);
  }
  const refused = view.open(section);
  if (refused !== null) {
    return doc("/profile", [warnNotice(refused, blockId("profile-refused"))]);
  }
  return doc("/profile", [
    b.notice("muted", `profiler: ${section}`, undefined, { id: blockId("profile") }),
  ]);
};

/**
 * **`origin` and `transport` left off since F13** — the shell fills both, along
 * with `verb`, `argv`, `durationMs`, `exitCode` and `stderr`, so supplying them
 * here was the same invention the reference app's four helpers were making.
 * `command` is likewise the shell's (I15) and stays only because `compose`
 * wants one to build with.
 */
const doc = (command: string, blocks: readonly Block[]): LocalDocument => {
  // `compose` still runs, because it is what validates and normalises; only its
  // `meta` is dropped, since `runLocal` fills every field of it. Building the
  // document here instead would trade one invented `meta` for a second
  // construction path, which is the trade C04 I1 exists to refuse.
  const { meta, ...rest } = compose({ command, blocks });
  void meta;
  return rest;
};

/**
 * The six, as one map so registration cannot miss one.
 *
 * A map rather than six `register` calls at the call site: the set is a fact
 * about what the framework owns, and a call site that lists them is a second
 * place the list lives — the duplication SP4 is about, one layer down.
 */
export function shippedHandlers(deps: HandlerDeps): Readonly<Record<string, LocalHandler>> {
  return {
    /**
     * C23 I26 — from the manifest and the keymap, never a maintained list.
     *
     * `visibleTools` rather than `manifest.tools`: hidden tools are hidden from
     * help for the same reason they are hidden from completion (C05 §3a), and
     * reading the raw list here would make `/help` the one surface that ignores
     * it.
     */
    /**
     * **`/help` answers about verbs; `/help keys` answers about keys.**
     *
     * It emitted both, verbs first and every binding last — and the bindings are
     * the longer half by a distance. Measured at thirty app verbs on a 44-row
     * terminal: the visible frame was **entirely bindings**, with every verb
     * scrolled off the top. The section a reader almost never wants is the only
     * one they can see, and it gets worse with each binding added rather than
     * with each verb.
     *
     * That is not the failure the grouping ruling was written against, which
     * assumed the verb list was the wall. Grouping thirty verbs into panels
     * leaves the forty binding rows exactly where they were.
     *
     * So the split is by *question asked* rather than by length. `/help` with no
     * argument is the front door and stays one answer; the keymap is a second
     * question with its own name. Both still render from the manifest and C16's
     * keymap and never from a maintained list (I26).
     */
    help: (argv) => {
      const manifest = deps.manifest();
      const visible = manifest === null ? [] : visibleTools(manifest);

      if (argv[0] === "keys") {
        return doc("/help keys", [
          block({
            kind: "keyValue",
            id: blockId("help-keys"),
            rows: deps.bindings().map((bnd) => ({ label: bnd.keys, value: bnd.does })),
          }),
        ]);
      }

      // **Grouped by C05 §3's partition**, and this is its second consumer.
      // `/clear` and `/exit` are different in kind from `/ps` and `/promote`,
      // and a flat list hides that. Derived from `appTools` rather than from a
      // name check against the framework's set: a filter would infer a fact the
      // manifest already records.
      const appNames = new Set((manifest?.appTools ?? []).map((t) => t.name));
      const app = visible.filter((t) => appNames.has(t.name));
      const shell = visible.filter((t) => !appNames.has(t.name));

      return doc("/help", [
        block({
          kind: "keyValue",
          id: blockId("help-verbs"),
          rows: app.map((t) => ({ label: `/${t.name}`, value: t.summary })),
        }),
        block({
          kind: "keyValue",
          id: blockId("help-shell"),
          gapBefore: true,
          rows: shell.map((t) => ({ label: `/${t.name}`, value: t.summary })),
        }),
        // **A pointer, not the payload.** One line naming the other question,
        // so the keymap is discoverable without being the whole answer.
        block({
          kind: "tip",
          id: blockId("help-more"),
          gapBefore: true,
          text: "/help keys",
          actions: [{ kind: "fill", label: "Use", command: "/help keys" }],
        }),
      ]);
    },

    /**
     * C13 I16 — command history is C20's and is untouched.
     *
     * The two are separate stores answering different questions: what is on
     * screen, and what was typed. Clearing one because the other was cleared is
     * the conflation that makes `/clear` destroy work.
     */
    clear: () => {
      deps.transcript.clear();
      return doc("/clear", [
        b.notice("muted", "transcript cleared", undefined, { id: blockId("cleared") }),
      ]);
    },

    /**
     * A02 Seam 4's theme row: `theme.setTheme` → the caller invalidates.
     *
     * **The variant comes from `ctx.args`, not from `argv[0]`** (C22 I66). C05
     * parsed it and enum-checked it against the declared values, and re-deriving
     * it here was a second reader of one fact — the duplication the widening
     * closes rather than a field it adds. On the failure arm `args` is empty and
     * the usage notice below is what answers, which is the arm it exists for:
     * a local verb is not gated on validation.
     */
    theme: (argv, ctx) => {
      const wanted = ctx.args["variant"];
      // **Per invocation, and every `/theme` sets it** (C22 I66). Absent means
      // `false`, so `/theme light --no-bg` then `/theme dark` paints again — a
      // sticky flag is invisible state, and repeating it is one keystroke with
      // `↑` recalling the whole line.
      deps.setSuppressBackground(ctx.args["no-bg"] === true);
      // **A string is all this arm can test for** (C10 I27). Which strings are
      // themes is the set's question, and `/theme`'s `enum` — whose values are
      // the set's keys — has already answered it on every path that validated.
      // This branch is the one that did not: a local verb is not gated on
      // validation, so a malformed invocation arrives with nothing parsed.
      if (typeof wanted !== "string") {
        return doc("/theme", [
          // **The message names the token, and `argv` is where it is.** The
          // decision is `args`' — one reader — but this arm is reached with
          // nothing parsed, so quoting the parsed value would say *got ``* to
          // someone who typed `/theme purple`. The failure arm is exactly
          // where `args` is empty, which is why the two differ here and
          // nowhere else.
          warnNotice(`usage: /theme ${deps.theme.names.join("|")} — got \`${argv[0] ?? ""}\``, blockId("theme-usage")),
        ]);
      }
      deps.theme.setTheme(wanted);
      // **Written on the change, not at exit** (C22 I40). A session killed by
      // `SIGKILL` runs no shutdown path (C01 §5), and a preference that
      // survives a clean exit and not a crash is one people stop trusting.
      // `/theme` is rare enough that a write per invocation costs nothing.
      //
      // Fire-and-forget: the notice below is the answer to the command, and a
      // handler that awaited a disk would block the frame on it. A failed write
      // means the choice does not survive the session, which is what the state
      // directory being unwritable already means for history (C20).
      deps.persistTheme?.(wanted);

      // **Warn and comply, and only where the flag suppresses an actual paint**
      // (C22 I66, C10 §4c row 5). `/theme light --no-bg` on a dark terminal
      // re-enters the state the background ruling exists to fix, deliberately,
      // at the user's request — transparency is a real reason and a framework
      // refusing a preference because it knows better is worse than a legible
      // warning. Against a theme that inherits anyway the flag changes nothing,
      // and a notice for it would be the framework talking about itself.
      const suppressed =
        ctx.args["no-bg"] === true && deps.theme.current.tokens.background === "surface";

      return doc("/theme", [
        b.notice("muted", `theme: ${wanted}`, undefined, { id: blockId("theme") }),
        ...(suppressed
          ? [
              warnNotice(
                `${wanted} assumes a ${wanted} terminal; without its background it may be unreadable`,
                blockId("theme-nobg"),
              ),
            ]
          : []),
      ]);
    },

    history: (argv) => {
      const all = deps.history();
      const n = Number.parseInt(argv[0] ?? "20", 10);
      const take = Number.isNaN(n) ? 20 : Math.max(1, n);
      const recent = all.slice(-take);

      return doc("/history", [
        block({
          kind: "keyValue",
          id: blockId("history"),
          rows: recent.map((e, i) => ({
            label: String(all.length - recent.length + i + 1),
            value: e.command,
          })),
        }),
      ]);
    },

    /**
     * `/debug` — what actually ran (C23 §2, C23 I23).
     *
     * **It reads an entry's `meta` and reaches no transport.** Nothing re-runs,
     * nothing touches the far side, and the stale-data footgun C23 I18 exists to
     * prevent does not arise — which is why it is a local command and not an
     * action, since an action is refused on every entry worth inspecting.
     */
    debug: (argv) => {
      const back = Math.max(1, Number.parseInt(argv[0] ?? "1", 10) || 1);
      const entries = deps.transcript.entries;
      const entry = entries[entries.length - back];

      if (entry === undefined) {
        return doc("/debug", [
          warnNotice(`no entry ${String(back)} back — the transcript holds ${String(entries.length)}`, blockId("debug-none")),
        ]);
      }

      const m = entry.doc.meta;
      const blocks: Block[] = [
        block({
          kind: "keyValue",
          id: blockId("debug"),
          rows: [
            { label: "argv", value: m.argv.join(" ") },
            { label: "transport", value: m.transport },
            { label: "origin", value: m.origin },
            { label: "exitCode", value: String(m.exitCode) },
            { label: "durationMs", value: String(m.durationMs) },
            { label: "adapter", value: m.adapter },
          ],
        }),
      ];
      if (m.stderr !== "") {
        blocks.push(block({ kind: "raw", id: blockId("debug-stderr"), gapBefore: true, text: m.stderr }));
      }
      return doc("/debug", blocks);
    },

    /** C22's `stop`. Not awaited: the document is the last thing this session shows. */
    exit: () => {
      void deps.stop("exit");
      return doc("/exit", [
        b.notice("muted", "exiting", undefined, { id: blockId("exit") }),
      ]);
    },

    // The seventh (C23 §2, I68).
    profile: profileHandler(deps.profileView, deps.profileReport, deps.profileCapture),
  };
}
