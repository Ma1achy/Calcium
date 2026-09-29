// C14 I62 — the transcript's bar in the margin column (review batch 4, shell
// lane, C22 §6q.2).
//
// **Through `paint`, not through `withTranscriptBar`**: the helper is private,
// and the claim is about the frame — that the bar is the last cell of every
// region row and nothing else on the row moved. Each row is compared with the
// same frame painted with no bar, so a bar drawn over content (rather than in
// the margin the content leaves) is a difference the comparison sees.
import { describe, expect, it } from "vitest";

import { compose, type Composed } from "../../src/shell/frame.js";
import { paint, type PaintDeps } from "../../src/shell/paint.js";
import { scrollbarColumn, scrollbarSet, createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { SGR_RESET, sgr } from "../../src/terminal/escapes.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { SessionSnapshot } from "../../src/shell/types.js";

const MEASURE = createBlockRegistry({ defaults: true }).measureSequence;
const SESSION: SessionSnapshot = Object.freeze({
  cwd: "/work",
  env: Object.freeze({}),
  lastUuid: null,
  identity: null,
  cluster: "corp-prod",
  health: "live",
  version: "1.0.0",
  retained: null,
  stopping: false,
});

function frameAt(columns: number, rows: number): Composed {
  return compose({
    chrome: { header: () => [], footer: () => [] },
    measureSequence: MEASURE,
    session: () => SESSION,
    owner: () => null,
    ownerArmed: () => false,
    capabilities: () => null,
    now: () => 1_700_000_000_000,
    size: () => ({ columns, rows }),
    promptRows: () => 1,
  });
}

function deps(over: Partial<PaintDeps>): PaintDeps {
  return {
    registry: createBlockRegistry({ defaults: true }),
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
    transcriptRows: () => [],
    promptRows: () => [""],
    spinning: () => false,
    ghost: () => null,
    overlays: () => [],
    promptReplaced: () => false,
    promptCursor: () => ({ row: 0, col: 2 }),
    promptSelection: () => [],
    promptChips: () => [],
    suppressBackground: () => false,
    promptFocused: () => true,
    ...over,
  };
}

describe("C14 I62 — the transcript's bar in the margin column", () => {
  it("T1.83 (C14 I62): the bar over a 40-row transcript in a 10-row region is scrollbarColumn's column on the margin, at every offset; a transcript that fits draws none; accent in the transcript and muted at the prompt", () => {
    const frame = (() => {
      for (let rows = 8; rows < 40; rows += 1) {
        const f = frameAt(40, rows);
        if (f.region.height === 10) return f;
      }
      throw new Error("no terminal height gives a 10-row region");
    })();
    const { top, height } = frame.region;
    const lines = Array.from({ length: height }, (_, i) => `row ${String(i)}`);
    const regionOf = (out: readonly string[]) => out.slice(top, top + height);
    const bare = regionOf(paint(frame, deps({ transcriptRows: () => lines })));
    const ink = (focused: boolean) =>
      sgr(resolveTone(focused ? "accent" : "muted", DARK_THEME, FULL_CAPS));

    const columns: string[][] = [];
    for (const topRow of [0, 15, 30]) {
      const column = scrollbarColumn(height, 40, topRow, scrollbarSet(FULL_CAPS));
      expect(column, "a 40-row transcript over 10 rows overflows").not.toBeNull();
      columns.push([...column!]);
      const drawn = regionOf(
        paint(frame, deps({ transcriptRows: () => lines, transcriptBar: () => ({ topRow, totalRows: 40, focused: true }) })),
      );
      drawn.forEach((row, i) => {
        const tail = `${SGR_RESET}${ink(true)}${column![i]}${SGR_RESET}`;
        expect(row.endsWith(tail), `row ${String(i)} at topRow ${String(topRow)} ends with the bar`).toBe(true);
        // Everything before the bar is the bare row less its last cell.
        expect(row.slice(0, -tail.length).trimEnd(), "and the content is untouched").toBe(bare[i]!.trimEnd());
      });
    }
    // **The thumb moves** — three offsets, three columns: a bar pinned to one
    // offset passes every per-row check above.
    expect(new Set(columns.map((c) => c.join(""))).size).toBe(3);

    // A transcript that fits, exactly, draws nothing: the rows are the bare ones.
    const fits = regionOf(
      paint(frame, deps({ transcriptRows: () => lines, transcriptBar: () => ({ topRow: 0, totalRows: height, focused: true }) })),
    );
    expect(fits).toEqual(bare);

    // Muted at the prompt: the same column in the other tone.
    const muted = regionOf(
      paint(frame, deps({ transcriptRows: () => lines, transcriptBar: () => ({ topRow: 15, totalRows: 40, focused: false }) })),
    );
    expect(muted[0]!.endsWith(`${SGR_RESET}${ink(false)}${columns[1]![0]}${SGR_RESET}`)).toBe(true);
    expect(ink(false), "the two tones differ, so the row can tell them apart").not.toBe(ink(true));
  });
});
