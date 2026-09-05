// SS56 — one grammar for a notice, and the fourteen L4 sites that hand-composed
// one (C22 T2.40, C24 I5; F777).
//
// **The frame before is the frame after, byte for byte, colour included.** Each
// row drives the real site — a local verb through the pipeline, the confirm
// through its host, the stall detector through the clock — and compares the
// rendered lines with the capture taken at 73882a4f, before any site was
// migrated to `b.notice`. A row here is therefore a *record*: it says what the
// literal drew, and the migration's whole claim is that the family draws the
// same bytes. Three of the fourteen are not frame rows and are cited instead:
// `truncated` (execution.test.ts T-row on `output truncated`, which needs the
// unit harness's `adaptPatch`), `refused` (T1.17) and the view route's
// `finish` (T1.43, T1.45) — structural rows on the text, and they still fence
// the tone and the glyph through `block()`'s C04 I6 check.
//
// **Read in colour.** `visible()` would strip the SGR that the glyph and tone
// resolve to, and a muted notice with the wrong tone reads identically once
// stripped. So the expectation holds the escape bytes.
import { describe, expect, it } from "vitest";

import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { createConfirmHost } from "../../src/shell/confirm.js";
import type { RawPatch } from "../../src/data/transport/index.js";
import { registry as overlayRegistry } from "../support/overlay.js";
import { pipelineHarness, settled } from "../support/execution.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";

const registry = createBlockRegistry({ defaults: true });
const frame = (blocks: readonly Block[]): readonly string[] =>
  renderSequenceToLines(registry, blocks, 80, { theme: DARK_THEME, capabilities: FULL_CAPS }).map((l) =>
    l.trimEnd(),
  );
/** The frame the site draws now, against the frame its literal drew at 73882a4f. */
const check = (name: string, lines: readonly string[]): void => {
  expect(lines).toEqual(BEFORE[name]);
};

/** The blocks of the entry a local verb appended — the last entry in the transcript. */
const lastBlocks = (h: ReturnType<typeof pipelineHarness>): readonly Block[] =>
  h.transcript.entries[h.transcript.entries.length - 1]?.doc.blocks ?? [];

const runLocal = async (line: string): Promise<readonly string[]> => {
  const h = pipelineHarness();
  h.pipeline.submit(line);
  await settled();
  // **Without the card's header** (C23 I55): a local verb settles as a card
  // since 2026-09-05, and block 0 is the shell's `⏺ verb · ok` — the family's
  // bytes are the handler's, under it. The stream rows (N11, N13) keep theirs:
  // there the header was always part of the literal.
  return frame(lastBlocks(h).filter((blk, i) => !(i === 0 && blk.kind === "notice" && blk.glyph === "step")));
};

/** Captured at 73882a4f — the literal's frame. */
const BEFORE: Record<string, readonly string[]> = {
  "confirm-question": [
    "\u001b[38;2;138;138;138m┌\u001b[38;2;232;168;124m Confirm \u001b[38;2;138;138;138m─────────────────────────────────────────────────────────────────────┐\u001b[39m",
    "\u001b[38;2;138;138;138m│\u001b[38;2;212;179;90m▲ remove 3 containers?\u001b[39m                                                        \u001b[38;2;138;138;138m│\u001b[39m",
    "│                                                                              │",
    "│{\"kind\":\"table\",\"id\":\"confirm-choices\",\"gapBefore\":true,\"columns\":[{\"key\":\"ma…│",
    "\u001b[38;2;138;138;138m└──────────────────────────────────────────────────────────────────────────────┘\u001b[39m",
  ],
  cleared: [
    "\u001b[38;2;98;98;98mtranscript cleared\u001b[39m",
  ],
  "theme-usage": [
    "\u001b[38;2;212;179;90m▲ usage: /theme dark|light|high-contrast — got ``\u001b[39m",
  ],
  theme: [
    "\u001b[38;2;98;98;98mtheme: dark\u001b[39m",
  ],
  "theme-nobg": [
    "\u001b[38;2;98;98;98mtheme: light\u001b[39m",
    "\u001b[38;2;212;179;90m▲ light assumes a light terminal; without its background it may be unreadable\u001b[39m",
  ],
  "debug-none": [
    "\u001b[38;2;212;179;90m▲ no entry 99 back — the transcript holds 0\u001b[39m",
  ],
  exit: [
    "\u001b[38;2;98;98;98mexiting\u001b[39m",
  ],
  stalled: [
    "\u001b[38;2;98;98;98m  ⎿ no output for 2m\u001b[39m",
  ],
  // **Both halves of this row were wrong and this table recorded them** (C23 §3b,
  // 2026-09-05). The figure was measured from the notice, not from the last patch —
  // `1m` under a notice saying `2m`, one silence with two numbers — and the hook was
  // dropped on replacement, so the row changed column. A snapshot records; it does
  // not check.
  resumed: [
    "\u001b[38;2;98;98;98m  ⎿ resumed after 2m\u001b[39m",
  ],
  // C23 I54 — block 0 is the running card's header, and the verdict is in it:
  // `truncated` and `failed` are the two error arms' one-word outcomes (§8f P8).
  truncated: [
    // `tail`, not `tail()`: F795 ruled a bare verb a bare header (C23 §3), the one
    // deliberate byte change in this table since it was captured.
    "\u001b[38;2;127;174;207m⬤ tail · truncated\u001b[39m",
    "\u001b[38;2;127;174;207mt1\u001b[39m",
    "\u001b[38;2;212;179;90m▲ output truncated: append: id \"same\" is already in the document (C04 I14) —\u001b[39m",
    "\u001b[38;2;212;179;90m  ViewPatch addresses blocks by id, so a duplicate has no correct target\u001b[39m",
  ],
  "shell-failed": [
    "\u001b[38;2;198;40;40m✗ The command exited with code 1.\u001b[39m",
    "cat: nothing: No such file or directory",
    "",
  ],
  "stream-error": [
    "\u001b[38;2;127;174;207m⬤ tail · failed\u001b[39m",
    "\u001b[38;2;198;40;40m✗ stream failed: Error: socket closed\u001b[39m",
  ],
};

describe("SS56 — the fourteen notices draw the same bytes through the family", () => {
  it("N1 `confirm.ts` — `confirm-question`", () => {
    const overlays = createOverlayManager({ registry: overlayRegistry });
    const confirm = createConfirmHost({
      overlays,
      anchor: () => ({ row: 8, rows: 1 }),
      overlayRegion: () => ({ width: 80, height: 24 }),
      invalidate: () => undefined,
    });
    void confirm.ask({
      question: "remove 3 containers?",
      choices: [
        { key: "y", label: "yes" },
        { key: "n", label: "no", default: true },
      ],
    });
    const top = overlays.top;
    if (top === null) throw new Error("the confirm pushed no layer");
    check("confirm-question", frame(top.content));
  });

  it("N2 `local/handlers.ts` — `cleared`", async () => {
    check("cleared", await runLocal("/clear"));
  });

  it("N3 `local/handlers.ts` — `theme-usage`", async () => {
    check("theme-usage", await runLocal("/theme"));
  });

  it("N4 `local/handlers.ts` — `theme`", async () => {
    check("theme", await runLocal("/theme dark"));
  });

  it("N5 `local/handlers.ts` — `theme-nobg`", async () => {
    check("theme-nobg", await runLocal("/theme light --no-bg"));
  });

  it("N6 `local/handlers.ts` — `debug-none`", async () => {
    check("debug-none", await runLocal("/debug 99"));
  });

  it("N7 `local/handlers.ts` — `exit`", async () => {
    check("exit", await runLocal("/exit"));
  });

  it("N8, N9 `refresh.ts` — `STALL_BLOCK`, the silence and the resumption", async () => {
    let resume: (() => void) | undefined;
    let n = 0;
    const h = pipelineHarness({
      // A patch that lands, or `sawPatch` never fires and the stall is never resolved.
      adaptPatch: () => {
        n += 1;
        return { op: "append", block: { kind: "raw", id: `line-${String(n)}`, text: `line ${String(n)}` } };
      },
      stream: () =>
        (async function* () {
          yield { kind: "data", value: {} } as RawPatch;
          await new Promise<void>((r) => {
            resume = r;
          });
          yield { kind: "data", value: {} } as RawPatch;
          await new Promise(() => undefined);
        })(),
    });
    h.pipeline.submit("/tail");
    await settled();
    h.tick(60_000);
    h.tick(70_000);
    const stall = (): readonly Block[] => lastBlocks(h).filter((b) => b.id === "stall-notice");
    expect(stall(), "the silence is one block").toHaveLength(1);
    check("stalled", frame(stall()));

    resume?.();
    await settled();
    check("resumed", frame(stall()));
  });

  it("N13 `execution.ts` — `truncated`", async () => {
    let n = 0;
    const h = pipelineHarness({
      stream: () =>
        (async function* () {
          yield { kind: "data", value: {} } as RawPatch;
          yield { kind: "data", value: {} } as RawPatch;
        })(),
      // The second patch reuses the first's id — malformed under C04 I14, so C13
      // refuses it and the entry settles with what it kept (§8a A2).
      adaptPatch: () => {
        n += 1;
        return { op: "append", block: { kind: "notice", id: "same", tone: "info", text: `t${String(n)}` } };
      },
    });
    h.pipeline.submit("/tail");
    await settled();
    await settled();
    check("truncated", frame(lastBlocks(h)));
  });

  it("N10 `execution.ts` — `shell-failed`", async () => {
    const h = pipelineHarness({
      spawnShell: () => ({
        stdout: (async function* () {
          /* nothing on stdout */
        })(),
        stderr: (async function* () {
          yield "cat: nothing: No such file or directory\n";
        })(),
        exited: Promise.resolve({ code: 1, signal: null }),
        overflowed: false,
      }) as never,
    });
    h.pipeline.submit("cat nothing");
    await settled();
    await settled();
    check("shell-failed", frame(lastBlocks(h)));
  });

  it("N11 `execution.ts` — `stream-error`", async () => {
    const h = pipelineHarness({
      stream: () =>
        (async function* () {
          yield { kind: "data", value: {} } as RawPatch;
          throw new Error("socket closed");
        })(),
    });
    h.pipeline.submit("/tail");
    await settled();
    await settled();
    check("stream-error", frame(lastBlocks(h)));
  });
});
