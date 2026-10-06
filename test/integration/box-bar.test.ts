// C22 I146 — a press on a scroll box's bar jumps that box and moves no focus
// (review batch 4, M14.3; `R-BLK-363`).
//
// **Read off a painted session**: the bar's column is found where it is drawn,
// the offset is read from the box's residue row, and focus is read the way
// split.test's divider row reads it — a letter lands in the prompt only while
// focus is there.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

const ESC = "\u001b";
const press = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}M`;
const release = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}m`;

const raws = (prefix: string, n: number): readonly unknown[] =>
  Array.from({ length: n }, (_, i) => ({ kind: "raw", id: `${prefix}${String(i)}`, text: `${prefix}${String(i)}` }));

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    { name: "one", local: true, summary: "a box of 3 over 12", args: [], flags: [] },
    { name: "nest", local: true, summary: "a box in a box", args: [], flags: [] },
    { name: "fits", local: true, summary: "a box whose content fits", args: [], flags: [] },
  ],
};

const view = (command: string, blocks: readonly unknown[]) =>
  (() => ({ schema: "tui.view/1", command, status: "ok", blocks })) as never;

const handlers: NonNullable<TuiConfig["localHandlers"]> = {
  one: view("one", [{ kind: "scroll", id: "a", height: 3, children: raws("A", 12) }]),
  nest: view("nest", [
    {
      kind: "scroll",
      id: "outer",
      height: 4,
      children: [{ kind: "scroll", id: "inner", height: 2, children: raws("K", 6) }, ...raws("O", 6)],
    },
  ]),
  fits: view("fits", [{ kind: "scroll", id: "f", height: 5, children: raws("F", 2) }]),
};

const drive = async (verb: string) => {
  const stdin = fakeStdin();
  const session = await buildSession(
    { manifest: MANIFEST, localHandlers: handlers, stdin: stdin as unknown as NodeJS.ReadStream },
    { columns: 80, rows: 30 },
  );
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };
  const rows = (): readonly string[] => session.screen().rows;
  const click = async (col: number, row: number): Promise<void> => {
    await type(press(col + 1, row + 1));
    await type(release(col + 1, row + 1));
  };
  /** Every residue row's `n above`, top to bottom — one per box that overflows. */
  const aboveAll = (): readonly number[] =>
    rows().flatMap((r) => {
      const n = /(\d+) above/u.exec(r);
      return n === null ? [] : [Number(n[1])];
    });
  /** The row holding `text`, and the last drawn column on it — the bar where one is drawn. */
  const rowOf = (text: string): Readonly<{ at: number; last: number }> => {
    const at = rows().findIndex((r) => r.includes(text));
    return { at, last: (rows()[at] ?? "").trimEnd().length - 1 };
  };
  const promptTook = async (): Promise<boolean> => {
    await type("q");
    const took = rows().some((r) => r.trimEnd().endsWith("❯ q"));
    await type("\u007f");
    return took;
  };
  const resize = async (columns: number): Promise<void> => {
    session.resize({ columns, rows: 30 });
    await new Promise((r) => setTimeout(r, 50));
  };
  await type(`/${verb}\r`);
  return { type, rows, click, aboveAll, rowOf, promptTook, resize, stop: () => session.tui.stop("exit") };
};

describe("C22 I146 — the box's bar under the pointer", () => {
  it("C22 T4.118 (I146, C26 I32): a press on the bar jumps by proportion, the inner bar moves the inner box, and a box that fits has no bar", async () => {
    // ---- one box: 12 rows in 3, a ceiling of 9 -----------------------------
    const one = await drive("one");
    const first = one.rowOf("A0");
    expect(first.at, "the box is on screen").toBeGreaterThan(0);
    const bar = first.last;
    expect((one.rows()[first.at] ?? "").slice(0, bar).trimEnd().endsWith("A0"), "the bar stands clear of the text").toBe(true);
    expect(one.aboveAll()).toEqual([0]);

    // **The last row, the middle row, the first**: 9, round(4.5) = 5 — which
    // floor would make 4 — and 0. Focus stays at the prompt throughout.
    await one.click(bar, first.at + 2);
    expect(one.aboveAll(), "the last row is the ceiling").toEqual([9]);
    await one.click(bar, first.at + 1);
    expect(one.aboveAll(), "the middle row rounds").toEqual([5]);
    await one.click(bar, first.at);
    expect(one.aboveAll(), "the first row is the top").toEqual([0]);
    expect(await one.promptTook(), "focus did not move").toBe(true);

    // **The control: one column in** is the child, and nothing jumps.
    await one.click(bar - 1, first.at + 2);
    expect(one.aboveAll(), "no jump off the bar").toEqual([0]);
    expect(await one.promptTook(), "and the press focused the child").toBe(false);

    // **The jump latches the box** (C26 I32). Focus is on A2 now; the bar puts
    // the window at the ceiling, and a resize — which re-pulls an unlatched box
    // to its focused child — leaves it there.
    await one.click(bar, first.at + 2);
    expect(one.aboveAll(), "the bar jumped with a child focused").toEqual([9]);
    await one.resize(90);
    expect(one.aboveAll(), "latched: the resize did not pull the box back to A2").toEqual([9]);
    await one.stop();

    // ---- a box in a box: the inner bar is one column in from the outer -----
    const nest = await drive("nest");
    const inner = nest.rowOf("K0");
    const outerBar = inner.last;
    expect(nest.aboveAll(), "both boxes at their tops").toEqual([0, 0]);
    await nest.click(outerBar - 1, inner.at + 1);
    expect(nest.aboveAll(), "the inner box moved to its ceiling of 4, the outer did not").toEqual([4, 0]);
    await nest.click(outerBar, inner.at + 3);
    expect(nest.aboveAll().at(-1), "and the outer bar moves the outer box").toBeGreaterThan(0);
    await nest.stop();

    // ---- a box that fits draws no bar, so the column is the child's --------
    const fits = await drive("fits");
    const f = fits.rowOf("F0");
    await fits.click(bar, f.at);
    expect(fits.aboveAll(), "no residue, no bar").toEqual([]);
    expect(await fits.promptTook(), "the press focused the child").toBe(false);
    await fits.stop();
  });
});
