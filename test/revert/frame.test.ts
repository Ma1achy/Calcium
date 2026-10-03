// C22 §6l.9 — the region's width, and the revert that a frame cannot see.
//
// **The landing's whole hazard in one row.** A frame carries two widths after
// I109: the terminal's, which the paint pads every row to, and the region's,
// which the document is measured and drawn at. A composer reading the wrong one
// produces a frame that is arithmetically self-consistent — `heightsSum` holds,
// every containment assertion passes, every row is `size.columns` cells — and
// overruns the content's gutter by one cell. So the revert is asserted on a
// *measured width* and on a *wrap point*, never on a height: the margin takes a
// column and no rows (§6l.9 row 8), which is why no existing row could catch it.
import { describe, expect, it } from "vitest";

import { compose, type Composed } from "../../src/shell/frame.js";
import { commandRows } from "../../src/shell/paint.js";
import { hardWrapCells } from "../../src/presentation/text.js";
import { CONTENT_MARGIN_R, RAIL_COLUMNS, regionWidth, transcriptWidth } from "../../src/shell/config.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { block } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { Chrome, SessionSnapshot } from "../../src/shell/types.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const REGISTRY = createBlockRegistry({ defaults: true });

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

const CHROME: Chrome = { header: () => [], footer: () => [] };

const frameAt = (columns: number): Composed =>
  compose({
    chrome: CHROME,
    session: () => SESSION,
    owner: () => null,
      ownerArmed: () => false,
    capabilities: () => null,
    now: () => 0,
    size: () => ({ columns, rows: 24 }),
    promptRows: () => 1,
    measureSequence: REGISTRY.measureSequence,
  });

const notice = (text: string): Block => block({ kind: "notice", id: "n", tone: "muted", text });

const rowsAt = (text: string, width: number): number =>
  renderSequenceToLines(REGISTRY, [notice(text)], width, {
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
  }).length; // cells-ok — a row count

const words = (cells: number): string => {
  const out: string[] = [];
  let n = 0;
  while (n < cells) {
    out.push("ab");
    n += 3; // cells-ok — two ascii cells and a space
  }
  return out.join(" ").slice(0, cells);
};

describe("C22 I109 — the region's width", () => {
  it("T6.124 (C22 I109): handing `size.columns` to the resize instead of `region.width` → T3.42's wider document stops wrapping and T4.93's recorded widths move by one", () => {
    const f = frameAt(80);
    // The transcript's width is the region's less the rail's column (C14 I57).
    expect(f.region.width).toBe(transcriptWidth(80));
    expect(f.region.width).toBe(regionWidth(80) - RAIL_COLUMNS);

    // The revert, spelled as the number rather than as an edit: a composer that
    // hands the terminal's width down measures at 80 where the region says 78.
    const reverted = f.size.columns;
    expect(reverted, "the revert is the margin and the rail").toBe(
      f.region.width + CONTENT_MARGIN_R + RAIL_COLUMNS,
    );

    // **What it costs, and it is a wrap and not a height.** A document whose
    // widest row is exactly the region's width plus one wraps at the region and
    // does not wrap at the terminal — so the reverted frame draws content into
    // the gutter and every height in the frame is unchanged.
    const over = words(f.region.width + 1);
    expect(rowsAt(over, f.region.width), "at the region — wraps").toBe(2);
    expect(rowsAt(over, reverted), "at the terminal — does not").toBe(1);

    // And the overlay region goes with it: a layer's content is content
    // (§6l.9 row 5), so the revert moves a centred box by a column too. The
    // layer region is the content width — the transcript's plus the rail's
    // column (C22 I28, C14 I57).
    expect(f.overlayRegion.width).toBe(regionWidth(80));
    expect(f.overlayRegion.width).toBe(f.region.width + RAIL_COLUMNS);
    const centred = (width: number, box: number): number => Math.floor((width - box) / 2);
    expect(centred(f.overlayRegion.width, 40)).not.toBe(centred(reverted, 40));
  });
});

describe("C22 I33 — tier 6", () => {
  it("T6.137 (C22 I33): commandRows wrapping the command whole → T1.172 fails", () => {
    // **The revert, drawn**: the whole command through one wrap, as it shipped.
    // The break is measured as nothing, so a two-line command is one row, and
    // that row carries the line feed the terminal then acts on.
    const command = "echo a\necho b";
    const whole = hardWrapCells(command, 28);
    expect(whole, "one row holds both lines").toHaveLength(1);
    expect(whole[0], "and the break inside it").toContain("\n");
    expect(commandRows(command, 30, FULL_CAPS), "line by line, two rows and no break").toHaveLength(2);
  });
});
