// C22 §6k — the footer's row budget (I79, I80), roadmap entry 29.
//
// Two rules meet here: the four regions sum to `rows` (S01 §3, C01 §5's whole
// reason) and a harness needs more than one footer row (AGENT_TUI_DESIGN §16).
// At HEAD the footer was a constant, so the three-line footer was refused by
// construction. These rows are the walk's cells asserted: the derived maximum
// (§6k.2 row 2), the sweep to the minimum from both sides (§6k.4 D), the
// pre-frame correction (row 5), a frame read with the footer on the rows the
// budget says (row 3), and the golden claim — the default frame is byte for
// byte what it was.
import { describe, expect, it } from "vitest";

import { compose, heightsSum, initialRegionHeight, type Composed } from "../../src/shell/frame.js";
import { paint, type PaintDeps } from "../../src/shell/paint.js";
import {
  DEFAULT_FOOTER_ROWS,
  HEADER_ROWS,
  MAX_FOOTER_ROWS,
  MIN_ROWS,
  resolveConfig,
  validateConfig,
  type Ambient,
} from "../../src/shell/config.js";
import { ConfigError, type Chrome, type SessionSnapshot, type TuiConfig } from "../../src/shell/types.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { block } from "../../src/data/viewmodel/index.js";
import { displayCells } from "../../src/presentation/text.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const SESSION: SessionSnapshot = Object.freeze({
  cwd: "/work",
  env: Object.freeze({}),
  lastUuid: null,
  identity: null,
  cluster: "fmx-prod",
  health: "live",
  version: "1.0.0",
  retained: null,
  stopping: false,
});

const NOW = 1_700_000_000_000;

function frameAt(rows: number, chrome: Chrome, wanted = 1, columns = 80): Composed {
  return compose({
    chrome,
    session: () => SESSION,
    copyMode: () => false,
    now: () => NOW,
    size: () => ({ columns, rows }),
    promptRows: () => wanted,
  });
}

const EMPTY = (footerRows: number): Chrome => ({ header: () => [], footer: () => [], footerRows });

function deps(over: Partial<PaintDeps> = {}): PaintDeps {
  const registry = createBlockRegistry({ defaults: true });
  return {
    registry,
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
    transcriptRows: () => [],
    promptRows: () => [""],
    spinning: () => false,
    ghost: () => null,
    overlays: () => [],
    promptCursor: () => ({ row: 0, col: 2 }),
    promptSelection: () => [],
    suppressBackground: () => false,
    promptFocused: () => true,
    ...over,
  };
}

const BASE: TuiConfig = {
  name: "t",
  binary: "t",
  manifest: { tools: [] } as unknown as TuiConfig["manifest"],
  theme: {} as TuiConfig["theme"],
};

const AMBIENT: Ambient = {
  clock: () => NOW,
  cwd: "/work",
  fs: {} as Ambient["fs"],
  schedule: () => ({ [Symbol.dispose]: () => undefined }),
  platform: "linux",
};

describe("C22 §6k — the footer's row budget", () => {
  it("T1.35 (C22 I79): the budget is refused outside [1, MAX_FOOTER_ROWS], naming the field, and the maximum is derived", () => {
    // **The derivation, not the figure** (§6k.4 B). Six is what the constants
    // give today; the row moves when `MIN_ROWS` moves and a hand-written `6`
    // would still read as correct the day the gate changed.
    expect(MAX_FOOTER_ROWS).toBe(MIN_ROWS - HEADER_ROWS - Math.floor(MIN_ROWS / 2) - 1);
    expect(MAX_FOOTER_ROWS, "and the figure, so a reader has it").toBe(6);
    expect(HEADER_ROWS).toBe(1);
    expect(DEFAULT_FOOTER_ROWS).toBe(1);

    const chrome = (footerRows: number): TuiConfig => ({
      ...BASE,
      chrome: { header: () => [], footer: () => [], footerRows },
    });
    for (const bad of [0, MAX_FOOTER_ROWS + 1, 1.5, Number.NaN, -1]) {
      let caught: unknown = null;
      try {
        validateConfig(chrome(bad));
      } catch (e) {
        caught = e;
      }
      expect(caught, `footerRows ${String(bad)} is refused`).toBeInstanceOf(ConfigError);
      expect((caught as ConfigError).field).toBe("chrome.footerRows");
    }
    for (let b = 1; b <= MAX_FOOTER_ROWS; b += 1) {
      expect(() => validateConfig(chrome(b)), `footerRows ${String(b)} is accepted`).not.toThrow();
    }

    // Absent, the resolved budget is the default — and the default chrome
    // carries it, so `compose` never reads a `??`.
    expect(resolveConfig(BASE, AMBIENT).chrome.footerRows).toBe(DEFAULT_FOOTER_ROWS);
    expect(resolveConfig(chrome(3), AMBIENT).chrome.footerRows).toBe(3);
  });

  it("T1.36 (C22 I80, §6k.4 D): the sum holds for every budget down to 2b + 1, and clamps at 2b", () => {
    for (let b = 1; b <= MAX_FOOTER_ROWS; b += 1) {
      for (let rows = 2 * b + 1; rows <= 60; rows += 1) {
        for (const wanted of [1, 200]) {
          const f = frameAt(rows, EMPTY(b), wanted);
          const promptRows = Math.max(1, Math.min(wanted, Math.floor(rows / 2)));
          expect(heightsSum(f), `b=${String(b)} rows=${String(rows)} wanted=${String(wanted)}`).toBe(
            true,
          );
          expect(f.footerRows).toBe(b);
          expect(f.region.top).toBe(HEADER_ROWS);
          expect(f.region.height).toBe(rows - HEADER_ROWS - promptRows - b);
          expect(f.overlayRegion.height, "C22 I28 — one number, not two").toBe(f.region.height);
        }
      }
      // **The boundary from the other side**: at `2b` with the prompt at its cap
      // the region would be −1; it clamps to 0 and the sum is false, which is
      // what `render-frame.ts` draws the fallback on.
      const short = frameAt(2 * b, EMPTY(b), 200);
      expect(short.region.height, `b=${String(b)} at ${String(2 * b)} rows clamps`).toBe(0);
      expect(heightsSum(short)).toBe(false);
    }

    // Control: at b = 1 every figure is HEAD's — 24 rows, one-row prompt, 21.
    expect(frameAt(24, EMPTY(1)).region.height).toBe(21);
    // And the design's numbers: 24 rows, three lines, a two-row prompt → 18.
    expect(frameAt(24, EMPTY(3), 2).region.height).toBe(18);
    // At MIN_ROWS with the prompt at its cap the largest budget leaves one row.
    expect(frameAt(MIN_ROWS, EMPTY(MAX_FOOTER_ROWS), 200).region.height).toBe(1);
  });

  it("T1.37 (C22 I34, §6k.2 row 5): the pre-frame height takes the budget, and without it the first frame corrects by b − 1", () => {
    const size = { columns: 80, rows: 30 };
    const first = frameAt(30, EMPTY(3));
    expect(initialRegionHeight(size, 3)).toBe(first.region.height);
    // The caller that passes one argument (construct.ts:652, owed) overstates
    // the region by two rows for a three-row footer; compose overwrites it on
    // the first render, which is C22 I34's whole claim.
    expect(initialRegionHeight(size)).toBe(first.region.height + 2);
    expect(initialRegionHeight(size)).toBe(frameAt(30, EMPTY(1)).region.height);
  });

  it("T3.38 (C22 I80, §6k.4 F): frame read — the footer is on the last b rows, truncated to b, and the default frame is unchanged", () => {
    const notice = (id: string, text: string): Block =>
      block({ kind: "notice", id, tone: "muted", text }); // a chrome fixture, not a surface
    const three = (): readonly Block[] => [
      notice("f1", "footer one"),
      notice("f2", "footer two"),
      notice("f3", "footer three"),
    ];
    const strip = (s: string): string => s.replace(/\[[0-9;]*m/g, "").trimEnd();

    const f2 = frameAt(24, { header: () => [], footer: three, footerRows: 2 });
    const lines = paint(f2, deps());
    expect(lines).toHaveLength(24);
    expect(f2.region.height).toBe(20);
    // Rows 22 and 23 are the footer's first two blocks; the third is on no row
    // (row 3 of the classification table — truncated, never scrolled).
    expect(strip(lines[22] ?? "")).toBe("footer one");
    expect(strip(lines[23] ?? "")).toBe("footer two");
    expect(lines.map(strip).some((l) => l.includes("footer three"))).toBe(false);
    // The prompt is the row above the footer.
    expect(strip(lines[21] ?? "")).toBe("❯");
    for (const line of lines) expect(displayCells(line)).toBe(80);

    // One block in a two-row budget: the second row is blank (row 4 — padded).
    const f2one = frameAt(24, { header: () => [], footer: () => [notice("f1", "footer one")], footerRows: 2 });
    const one = paint(f2one, deps());
    expect(strip(one[22] ?? "")).toBe("footer one");
    expect(strip(one[23] ?? "")).toBe("");

    // **The golden claim.** With the budget at its default the frame is byte
    // for byte the frame HEAD painted — asserted against the one-row budget
    // spelled explicitly and against the resolved default chrome, rather than
    // by regenerating anything.
    const explicit = paint(frameAt(24, { header: () => [], footer: () => [], footerRows: 1 }), deps());
    const resolved = resolveConfig(
      { ...BASE, chrome: { header: () => [], footer: () => [] } },
      AMBIENT,
    ).chrome;
    expect(resolved.footerRows).toBe(1);
    expect(paint(frameAt(24, resolved), deps())).toEqual(explicit);
    expect(explicit).toHaveLength(24);
    expect(strip(explicit[22] ?? "")).toBe("❯");
    expect(strip(explicit[23] ?? "")).toBe("");
  });

  it("T3.39 (C22 I28, §6k.2 row 8): with a three-row footer the layer region is the transcript region and paint returns rows lines", () => {
    const f = frameAt(30, EMPTY(3));
    expect(f.overlayRegion.height).toBe(f.region.height);
    expect(f.region.height).toBe(30 - 1 - 1 - 3);
    expect(paint(f, deps())).toHaveLength(30);
  });
});
