/**
 * C23 §3a — action dispatch, and the four kinds.
 *
 * **C23 supplies `onAction` and nothing else may** (C23 I16). An action is a
 * submission by another route, and routing submissions is what this component
 * does; a block library that dispatched its own would be L1 causing an effect in
 * L2 and L4 at once.
 *
 * Two rules here are the whole security surface of the component.
 *
 * **`open` never goes through a shell** (C23 I17, A01 D18). A URL arriving from a
 * far-side envelope is untrusted data, and `spawnShell("open " + url)` would be
 * an injection through the one path that otherwise has none. The scheme check is
 * here rather than in the opener because C22's default opener is replaceable —
 * an app supplying its own must not be the thing standing between a `javascript:`
 * URL and the OS handler.
 *
 * **An action from a frozen entry is refused** (C23 I18, A01 D5, C13 §2). Frozen
 * entries hold stale data, and firing `↑ promote` from one is the footgun that
 * rule exists to prevent. Frozen-but-streaming is refused for the same reason.
 *
 * **Reachable from a keyboard since C26 §4g**, which is when the ruling was
 * first pressed: a settled row can be focused and `⏎` arrives here with the
 * settled entry as its origin. All five kinds stay refused — the two consumers
 * that wanted something from a settled entry (a notebook's *re-run this cell*,
 * an agent harness's *retry that tool call*) wanted its **recorded command**,
 * which is not one of the five and is not stale; `rerunEntry` in `keys.ts` is
 * that route, and the notice below names the command so the reader has it.
 */

import type { Action } from "../data/viewmodel/index.js";
import type { EntryId, TranscriptStore } from "../viewport/transcript/index.js";

/** The schemes an `open` action may use. Nothing else reaches the OS handler. */
const ALLOWED_SCHEMES = Object.freeze(["http:", "https:"]);

export type ActionDeps = Readonly<{
  transcript: TranscriptStore;
  editor: Readonly<{ setText: (text: string, cursor?: number) => void }>;
  scheduler: Readonly<{ commit: (reason: "input") => void }>;
  openUrl: (url: URL) => Promise<void>;
  /** §2's normal path — `exec` re-enters it rather than shortcutting (I16). */
  submit: (line: string) => void;
  /**
   * A refusal, **patched into the entry it declined to act on** (C23 I18).
   *
   * Never an append: an append freezes the block the action came from, so the
   * next action on it is refused as *frozen* rather than for its own reason and
   * the selection A01 D7 preserves is cleared. C23 §4's pop row is one section
   * over and rules the same hazard. A frozen entry still accepts patches, which
   * is what C13 §2's frozen-is-not-finished distinction was for.
   */
  refuse: (from: EntryId | null, text: string) => void;
  /** For a refusal with no entry to patch — a malformed URL from a chrome action. */
  notify: (text: string) => void;
  /**
   * Raise the fullscreen view over `target` (C23 I31, C25 §3b).
   *
   * Returns a refusal string, or `null` when the view opened. **A string rather
   * than a throw**, and that is the second half of the ruling: C15's `push`
   * throws when a view is raised onto a non-empty stack (C15 I1), and this
   * dispatcher runs inside a renderer's callback where an `OverlayError` has no
   * frame to be reported in. The owner checks and answers instead.
   */
  pushView: (from: EntryId | null, target: string) => string | null;
}>;

/**
 * Whether an action fired from `entryId` may run at all.
 *
 * Exported because the refusal is the interesting half and a test that derives
 * its expectation from the same walk agrees with itself.
 */
export function isFrozen(transcript: TranscriptStore, entryId: EntryId | null): boolean {
  if (entryId === null) return false;
  return transcript.liveId !== entryId;
}

export function createActionDispatcher(deps: ActionDeps) {
  return (action: Action, from: EntryId | null = null): void => {
    // C23 I18 — before the switch, because every kind is refused and putting the
    // check inside each arm is three places to forget it.
    if (isFrozen(deps.transcript, from)) {
      // **Every kind, including the one that only fills the prompt** (C23 I18).
      // `fill`'s command was composed against rows that may no longer exist,
      // and reading a stale identifier before running it is not the protection
      // A01 D8 meant. What a settled entry holds that is *not* stale is its
      // recorded command, so the notice names it: a reader can type it, and
      // `⇧⏎`/`⌥⏎` on the entry does the same through C23 §2 (`rerunEntry`).
      // Named by command rather than by key, because a key named in a notice
      // is a second keymap that drifts under rebinding (C16 I19's argument).
      const command = deps.transcript.entries.find((e) => e.id === from)?.doc.command ?? "";
      const hint = command === "" ? "" : ` Re-run \`${command}\` for a live copy.`;
      deps.refuse(from, `\`${action.label}\` is from a frozen entry — its data is stale.${hint}`);
      return;
    }

    switch (action.kind) {
      case "fill":
        // A01 D8's default: populating the prompt rather than running is what
        // makes `production cancel <uuid>` readable before it happens.
        deps.editor.setText(action.command, action.command.length);
        deps.scheduler.commit("input");
        return;

      case "exec":
        // C23 I16 — through §2's guard and routes, indistinguishable from typing
        // it. Only filter pills use this, because a filter is reversible.
        deps.submit(action.command);
        return;

      case "open": {
        // C23 I17. Parsed rather than pattern-matched: `http://x@evil/` and
        // `https:/\/\evil` are the shapes a substring check lets through, and
        // `URL` is the thing that already knows.
        let url: URL;
        try {
          url = new URL(action.url);
        } catch {
          deps.notify(`\`${action.url}\` is not a URL`);
          return;
        }
        if (!ALLOWED_SCHEMES.includes(url.protocol)) {
          deps.notify(`refusing to open a \`${url.protocol}\` URL — http and https only`);
          return;
        }
        void deps.openUrl(url).catch((cause: unknown) => {
          deps.notify(`could not open ${url.href}: ${String(cause)}`);
        });
        return;
      }

      case "view": {
        // **The target is resolved against the source entry and nowhere wider**
        // (C04 I34, C23 I31). `expand` needs no resolution — it names a row on
        // the entry already in hand — and this is the first kind whose target is
        // a free string an adapter supplies. Resolved against the transcript it
        // would let one entry's action fill the screen with another's data;
        // resolved against nothing it is a key that does nothing and says
        // nothing. The owner does the lookup because it holds the entry.
        const refusal = deps.pushView(from, action.target);
        if (refusal !== null) deps.refuse(from, refusal);
        return;
      }

      case "expand": {
        // **A `replace` patch toggling the row's `expanded` flag** (C23 §3a,
        // C04 §3). Expansion is a document patch and not view state (C11 T4.7's
        // mechanism), so a frozen block records its own expansion — which is
        // also why C25 I11 says there is no `expanded` flag on a `Hunk`:
        // expansion *is* the rewrite.
        //
        // `target` names a row, so the block holding it has to be found. The
        // alternative — carrying the block id on the action — was C09's to
        // choose and it did not, because a row knows its own id and a renderer
        // building an action for a row it is drawing does not know which block
        // the caller will address it as.
        if (from === null) return;

        const entry = deps.transcript.entries.find((e) => e.id === from);
        if (entry === undefined) return;

        for (const b of entry.doc.blocks) {
          if (b.kind !== "table") continue;
          const row = b.rows.find((r) => r.id === action.target);
          if (row === undefined) continue;

          const outcome = deps.transcript.patch(
            from,
            {
              op: "expand",
              blockId: b.id,
              rowId: action.target,
              expanded: row.expanded !== true,
            },
            // The shell speaking about an entry it holds. The op names the
            // operation; the origin is what gets it past a settled entry.
            "shell",
          );
          if (outcome.ok) deps.scheduler.commit("input");
          return;
        }

        // A target no row carries. Said rather than swallowed: an action that
        // does nothing is indistinguishable from one that worked.
        deps.notify(`nothing to expand — no row \`${action.target}\``);
        return;
      }
    }
  };
}
