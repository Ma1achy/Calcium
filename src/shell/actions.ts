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
 * rule exists to prevent. Frozen-but-streaming is refused for the same reason:
 * it is not focusable, so an action on it can only have arrived by mistake.
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
  /** Where a refusal goes. An action refused silently is indistinguishable from one that did nothing. */
  notify: (text: string) => void;
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
      deps.notify(`\`${action.label}\` is from a frozen entry — its data is stale`);
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

          deps.transcript.patch(from, {
            op: "replace",
            blockId: b.id,
            block: {
              ...b,
              rows: b.rows.map((r) =>
                r.id === action.target ? { ...r, expanded: r.expanded !== true } : r,
              ),
            },
          });
          deps.scheduler.commit("input");
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
