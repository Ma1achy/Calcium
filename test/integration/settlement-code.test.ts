// C23 I101 — an entry settles with one code, and its document and C20 both
// carry it (ruling 100, F1508, F1510, §8a A6.9).
//
// **Indexed by route, and every route C23 names is a row**: I29's list — app,
// local, shell, handoff, refusal, parse error, a cleared queue — with the app
// route taken apart by how it settles, because that is where the two writers
// are. The funnel's routes agree by construction today (`recordHistory` reads
// the document it appends), and they are rows anyway: a route that leaves the
// funnel is the change this table exists to catch, and it would not announce
// itself.
import { describe, expect, it } from "vitest";

import { pipelineHarness, settled } from "../support/execution.js";
import { result } from "../support/transport.js";
import { doc } from "../support/blocks.js";
import { b } from "../../src/shell/builders/index.js";
import type { RawPatch, RawResult } from "../../src/data/transport/index.js";
import type { Block, Notice } from "../../src/data/viewmodel/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { callHead } from "../../src/shell/documents.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS, registry, visible } from "../support/render.js";

type Harness = ReturnType<typeof pipelineHarness>;

/** A stream the row feeds by hand; an `Error` pushed is thrown from the loop. */
function heldStream(): { stream: () => AsyncIterable<RawPatch>; push: (p: RawPatch | Error) => void } {
  const queue: (RawPatch | Error)[] = [];
  let wake: (() => void) | null = null;
  return {
    stream: () =>
      (async function* () {
        for (;;) {
          const next = queue.shift();
          if (next === undefined) {
            await new Promise<void>((r) => {
              wake = r;
            });
            wake = null;
            continue;
          }
          if (next instanceof Error) throw next;
          yield next;
          if (next.kind === "end") return;
        }
      })(),
    push: (p) => {
      queue.push(p);
      wake?.();
    },
  };
}

/** One appended `raw` per data patch. */
function appender(): () => { op: "append"; block: ReturnType<typeof b.raw> } {
  let n = 0;
  return () => {
    n += 1;
    return { op: "append", block: b.raw(`line ${String(n)}`, { id: `o${String(n)}` }) };
  };
}

const key = (name: string) => ({ kind: "key" as const, key: { name, ctrl: false, meta: false, shift: false, sequence: name } });

/** Turns until C20 has a record or the route has had forty chances — the shell route awaits the emulator. */
const recorded = async (h: Harness, n = 1): Promise<void> => {
  for (let i = 0; i < 80 && h.recorded.length < n; i += 1) await new Promise((r) => void setTimeout(r, 0));
};

/**
 * One route's settlement: the entry's code and C20's, and whether it settled.
 * **Both codes, side by side**, because the defect was the two disagreeing —
 * a row reading one passes the build that fixes the other.
 */
const codes = (h: Harness, at = 0): string => {
  const e = h.transcript.entries[at];
  const record = h.recorded[at];
  return `${e?.streaming === false ? "settled" : "open"} · meta ${String(e?.doc.meta.exitCode)} · recorded ${record === undefined ? "nothing" : String(record.exitCode)}`;
};

describe("C23 I101 — one code per settlement", () => {
  it("T4.102 (C23 I101, I29, ruling 100, F1508, F1510): every settlement route's meta.exitCode equals the code C20 recorded", async () => {
    const seen: string[] = [];
    const heads: string[] = [];
    const row = async (route: string, h: Harness, line: string, then?: () => unknown, at = 0): Promise<void> => {
      h.pipeline.submit(line);
      await settled();
      await then?.();
      await settled();
      await recorded(h, at + 1);
      seen.push(`${route}: ${codes(h, at)}`);
    };

    // --- the app route, invoke arm (§3 steps 4–7) ---------------------------
    // The adapter's own code, 3, so the row can tell a record read from the
    // document from one that defaulted.
    await row("answered", pipelineHarness({ adapt: () => doc({ command: "ps", meta: { ...doc().meta, exitCode: 3 } }) }), "/ps");
    await row("transport throws", pipelineHarness({ invoke: () => Promise.reject(new Error("gone")) }), "/ps");
    {
      const h = pipelineHarness({ invoke: () => new Promise<RawResult>(() => undefined) });
      await row("⌃c", h, "/ps", () => h.pipeline.cancel());
    }

    // --- the approval (C23 I60, I94) ----------------------------------------------
    {
      const h = pipelineHarness({ approval: () => ({}) });
      await row("denied", h, "/ps", () => h.confirm.answerHandler()?.(key("n")));
    }
    {
      // The harness's confirm host takes its timer, so this expires on `tick`.
      const h = pipelineHarness({ approval: () => ({ expiresAfterMs: 5_000 }) });
      await row("expired", h, "/ps", () => h.tick(6_000));
    }
    {
      const asker = new AbortController();
      const h = pipelineHarness({ approval: () => ({ signal: asker.signal }) });
      await row("withdrawn", h, "/ps", () => asker.abort());
    }

    // --- the app route, stream arm (§3, §8a A2, A3, §8g row 13) ---------------
    for (const [route, ending] of [
      ["end 0", { exitCode: 0 }],
      ["end 1", { exitCode: 1 }],
      ["end SIGKILL", { exitCode: null, signal: "SIGKILL" }],
    ] as const) {
      const s = heldStream();
      const h = pipelineHarness({ stream: s.stream, adaptPatch: appender() });
      await row(route, h, "/tail web.log", () => s.push({ kind: "end", result: result(ending) }));
      // **The head is the same number** (C23 I54): it read `exit null` over
      // `succeeded` while the child had been killed.
      const head = h.transcript.entries[0]?.doc.blocks[0];
      heads.push(`${route}: ${head?.kind === "notice" ? `${String(head.state)} · ${head.text}` : String(head?.kind)}`);
    }
    {
      const s = heldStream();
      // A replace naming a block the entry does not hold: C13's `patch` arm.
      const h = pipelineHarness({ stream: s.stream, adaptPatch: () => ({ op: "replace", blockId: "absent", block: b.raw("x", { id: "x" }) }) });
      await row("malformed patch", h, "/tail web.log", () => s.push({ kind: "data", value: {} }));
    }
    {
      const s = heldStream();
      const h = pipelineHarness({ stream: s.stream, adaptPatch: appender() });
      await row("stream throws", h, "/tail web.log", () => s.push(new Error("pipe closed")));
    }
    {
      const s = heldStream();
      const h = pipelineHarness({ stream: s.stream, adaptPatch: appender() });
      await row("stream cancelled", h, "/tail web.log", () => h.pipeline.cancelNewestStream());
    }

    // --- C23 I29's other routes ----------------------------------------------------
    await row("local", pipelineHarness(), "/guide");
    await row(
      "shell",
      pipelineHarness({
        spawnShell: () =>
          ({
            stdout: (async function* () {})(),
            stderr: (async function* () {})(),
            exited: Promise.resolve({ code: 3, signal: null }),
            overflowed: false,
            signal: () => false,
          }) as never,
      }),
      "!x",
    );
    await row("handoff exit 1", pipelineHarness({ handoff: () => Promise.resolve({ code: 1, signal: null }) }), "/tty vim");
    await row("handoff never started", pipelineHarness({ handoff: () => Promise.resolve({ code: null, signal: null }) }), "/tty vim");
    await row("refusal", pipelineHarness(), "/ps --nonsense");
    await row("parse error", pipelineHarness(), "/nosuchverb");
    {
      // A held `/ps` and a line behind it; `⌃c` settles the one and clears the other (C23 I5).
      const h = pipelineHarness({ invoke: () => new Promise<RawResult>(() => undefined) });
      h.pipeline.submit("/ps");
      await settled();
      await row("cleared queue", h, "/ps --quiet", () => h.pipeline.cancel(), 1);
    }
    await row("built-in", pipelineHarness(), "cd");

    expect(seen).toEqual([
      "answered: settled · meta 3 · recorded 3",
      "transport throws: settled · meta 1 · recorded 1",
      "⌃c: settled · meta 130 · recorded 130",
      "denied: settled · meta 126 · recorded 126",
      "expired: settled · meta 126 · recorded 126",
      "withdrawn: settled · meta 130 · recorded 130",
      "end 0: settled · meta 0 · recorded 0",
      "end 1: settled · meta 1 · recorded 1",
      "end SIGKILL: settled · meta 137 · recorded 137",
      "malformed patch: settled · meta 1 · recorded 1",
      "stream throws: settled · meta 1 · recorded 1",
      "stream cancelled: settled · meta 130 · recorded 130",
      "local: settled · meta 0 · recorded 0",
      "shell: settled · meta 3 · recorded 3",
      "handoff exit 1: settled · meta 1 · recorded 1",
      "handoff never started: settled · meta -1 · recorded -1",
      "refusal: settled · meta 1 · recorded 1",
      "parse error: settled · meta 1 · recorded 1",
      "cleared queue: settled · meta -1 · recorded -1",
      "built-in: settled · meta 0 · recorded 0",
    ]);
    expect(heads, "each stream head's word is the code its meta carries").toEqual([
      "end 0: succeeded · tail(web.log)",
      "end 1: failed · tail(web.log) · exit 1",
      "end SIGKILL: failed · tail(web.log) · exit 137",
    ]);
  });

  it("T4.105 (C23 I60, C23 I94, C23 I81, ruling 103 a, F1518): a denied, expired, withdrawn and cancelled head is muted in the cancelled state at every rung", async () => {
    // **Read as a frame, at three rungs** (C09 I45): above 1 bit the tone is the
    // only thing saying which state the `●` is in, and at 1 bit and in ASCII the
    // mark is. The oracle is a head built in each state and drawn the same way,
    // so the row asks *which state's drawing is this* and not *which colour*.
    const reg = registry();
    const rungs = [
      ["full", FULL_CAPS],
      ["1-bit", MONO_UNICODE_CAPS],
      ["ascii", ASCII_CAPS],
    ] as const;
    /** The row's lead: its SGR opener and its mark, which is what the state draws. */
    const lead = (blk: Block, caps: TerminalCapabilities): string => {
      const [row] = renderSequenceToLines(reg, [blk], 60, { theme: DARK_THEME, capabilities: caps });
      const mark = visible(row ?? "").charAt(0);
      return `${(row ?? "").slice(0, (row ?? "").indexOf(mark))}${mark}`;
    };
    const oracle = (state: "cancelled" | "failed", caps: TerminalCapabilities): string =>
      lead(callHead({ id: "o", name: "ps", args: "", state, outcome: "x" }, FULL_CAPS), caps);

    const endings: [string, Harness][] = [];
    {
      const h = pipelineHarness({ approval: () => ({}) });
      h.pipeline.submit("/ps");
      await settled();
      h.confirm.answerHandler()?.(key("n"));
      await settled();
      await settled();
      endings.push(["denied", h]);
    }
    {
      const h = pipelineHarness({ approval: () => ({ expiresAfterMs: 5_000 }) });
      h.pipeline.submit("/ps");
      await settled();
      h.tick(6_000);
      await settled();
      await settled();
      endings.push(["expired", h]);
    }
    {
      const asker = new AbortController();
      const h = pipelineHarness({ approval: () => ({ signal: asker.signal }) });
      h.pipeline.submit("/ps");
      await settled();
      asker.abort();
      await settled();
      await settled();
      endings.push(["withdrawn", h]);
    }
    {
      const h = pipelineHarness({ invoke: () => new Promise<RawResult>(() => undefined) });
      h.pipeline.submit("/ps");
      await settled();
      h.pipeline.cancel();
      await settled();
      endings.push(["⌃c", h]);
    }
    // **The control**: a stream ending `exit 1` is failed, and draws failed's lead.
    {
      const s = heldStream();
      const h = pipelineHarness({ stream: s.stream, adaptPatch: appender() });
      h.pipeline.submit("/tail web.log");
      await settled();
      s.push({ kind: "end", result: result({ exitCode: 1 }) });
      await settled();
      await settled();
      endings.push(["exit 1", h]);
    }

    const seen = endings.map(([label, h]) => {
      const entry = h.transcript.entries[0];
      const head = entry?.doc.blocks[0] as Notice | undefined;
      const drawn = rungs.map(([rung, caps]) => {
        const row = head === undefined ? "" : lead(head, caps);
        const as = row === oracle("cancelled", caps) ? "cancelled" : row === oracle("failed", caps) ? "failed" : "neither";
        return `${rung} ${visible(row)} as ${as}`;
      });
      return `${label}: ${String(head?.state)} · ${String(head?.tone)} · ${head?.text ?? ""} · ${drawn.join(" · ")} · ran ${String(h.calls.includes("invoke"))}`;
    });
    expect(seen).toEqual([
      "denied: cancelled · muted · ps · denied · full ● as cancelled · 1-bit ⊘ as cancelled · ascii / as cancelled · ran false",
      "expired: cancelled · muted · ps · 6s · expired · full ● as cancelled · 1-bit ⊘ as cancelled · ascii / as cancelled · ran false",
      "withdrawn: cancelled · muted · ps · cancelled · full ● as cancelled · 1-bit ⊘ as cancelled · ascii / as cancelled · ran false",
      "⌃c: cancelled · muted · ps · cancelled · full ● as cancelled · 1-bit ⊘ as cancelled · ascii / as cancelled · ran true",
      "exit 1: failed · error · tail(web.log) · exit 1 · full ● as failed · 1-bit ✗ as failed · ascii x as failed · ran false",
    ]);
  });
});
