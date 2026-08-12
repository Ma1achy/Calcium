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
import type { ThemeStore } from "../../presentation/theme/index.js";
import { blockId, compose } from "../documents.js";
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
  persistTheme?: (variant: "dark" | "light") => void;
  history: () => readonly HistoryEntry[];
  /** Every binding C16 will dispatch, for `/help` (C23 I26). */
  bindings: () => readonly Readonly<{ keys: string; does: string }>[];
  stop: (reason: StopReason) => Promise<number>;
}>;

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
        block({ kind: "notice", id: blockId("cleared"), tone: "muted", text: "transcript cleared" }),
      ]);
    },

    /** A02 Seam 4's theme row: `theme.setVariant` → the caller invalidates. */
    theme: (argv) => {
      const wanted = argv[0];
      if (wanted !== "dark" && wanted !== "light") {
        return doc("/theme", [
          block({
            kind: "notice",
            id: blockId("theme-usage"),
            tone: "warn",
            glyph: "warn",
            text: `usage: /theme dark|light — got \`${wanted ?? ""}\``,
          }),
        ]);
      }
      deps.theme.setVariant(wanted);
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
      return doc("/theme", [
        block({ kind: "notice", id: blockId("theme"), tone: "muted", text: `theme: ${wanted}` }),
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
          block({
            kind: "notice",
            id: blockId("debug-none"),
            tone: "warn",
            glyph: "warn",
            text: `no entry ${String(back)} back — the transcript holds ${String(entries.length)}`,
          }),
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
        block({ kind: "notice", id: blockId("exit"), tone: "muted", text: "exiting" }),
      ]);
    },
  };
}
