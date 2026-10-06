// C22 §6u.2 — the new-messages button (I154, I155, §067).
//
// T1.188 steps the counter through the section's trace and asserts the whole
// state after every row: a count read only at the end cannot tell a patch that
// was counted and later reset from one that was never counted.
import { describe, expect, it } from "vitest";

import { createNewBelow } from "../../src/shell/new-below.js";
import { compose, type Composed } from "../../src/shell/frame.js";
import { newBelowText, paint, type PaintDeps } from "../../src/shell/paint.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import type { SessionSnapshot } from "../../src/shell/types.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS } from "../support/render.js";

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
const frameAt = (columns: number, rows: number): Composed =>
  compose({
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
const depsFor = (over: Partial<PaintDeps>): PaintDeps => ({
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
});
// eslint-disable-next-line no-control-regex
const plain = (row: string): string => row.replace(/\u001b\[[0-9;]*m/gu, "");

type Origin = "user" | "action" | "agent" | "refresh" | "defect";
type Entry = { id: string; streaming: boolean; doc: { meta: { origin: Origin } } };
type Change =
  | { kind: "append"; id: string }
  | { kind: "patch"; id: string }
  | { kind: "settle"; id: string }
  | { kind: "evict"; ids: readonly string[] }
  | { kind: "clear" };

const rig = () => {
  const entries: Entry[] = [];
  const watchers = new Set<(c: Change) => void>();
  const views = new Set<() => void>();
  const scroll = { followTail: true };
  const transcript = {
    entries,
    subscribe: (cb: (c: Change) => void) => {
      watchers.add(cb);
      return { [Symbol.dispose]: () => void watchers.delete(cb) };
    },
  };
  const viewport = {
    scroll,
    subscribe: (cb: () => void) => {
      views.add(cb);
      return { [Symbol.dispose]: () => void views.delete(cb) };
    },
  };
  const counter = createNewBelow({ transcript: transcript as never, viewport: viewport as never });
  const emit = (c: Change): void => void [...watchers].forEach((w) => w(c));
  return {
    counter,
    append: (id: string, streaming: boolean, origin: Origin = "agent"): void => {
      entries.push({ id, streaming, doc: { meta: { origin } } });
      emit({ kind: "append", id });
    },
    settle: (id: string): void => {
      const e = entries.find((x) => x.id === id);
      if (e !== undefined) e.streaming = false;
      emit({ kind: "settle", id });
    },
    patch: (id: string): void => emit({ kind: "patch", id }),
    clear: (): void => {
      entries.length = 0;
      emit({ kind: "clear" });
    },
    follow: (on: boolean): void => {
      scroll.followTail = on;
      [...views].forEach((v) => v());
    },
  };
};

describe("C22 I154 — the count", () => {
  it("T1.188 (C22 I154, §6u.2 trace rows 1-12): the whole state after each row", () => {
    const r = rig();
    const n = (): number => r.counter.count();

    // 1 — at the tail an entry settles: it is followed, not counted.
    r.append("a", true);
    r.settle("a");
    expect(n(), "row 1").toBe(0);

    // 2 — the reader scrolls up two rows: nothing yet.
    r.follow(false);
    expect(n(), "row 2").toBe(0);

    // 3 — a streaming append: the running entry has not arrived.
    r.append("b", true);
    expect(n(), "row 3").toBe(0);

    // 4 — it settles.
    r.settle("b");
    expect(n(), "row 4").toBe(1);

    // 5 — a patch is not an arrival.
    r.patch("a");
    r.patch("b");
    expect(n(), "row 5").toBe(1);

    // 6 — a born-settled append.
    r.append("c", false);
    expect(n(), "row 6").toBe(2);

    // 7 — the reader's own submit (`origin: user`) appends a streaming entry: not counted at the append...
    r.append("mine", true, "user");
    expect(n(), "row 7").toBe(2);
    r.append("tapped", false, "action");
    expect(n(), "row 7: a gesture's born-settled entry is the reader's too").toBe(2);

    // 8 — ...a refresh's notice lands settled in between and is counted, and the own entry's settle is not.
    r.append("notice", false, "refresh");
    r.settle("mine");
    expect(n(), "row 8").toBe(3);

    // 9/10 — back at the tail by any route: the same reset.
    r.follow(true);
    expect(n(), "row 9/10").toBe(0);

    // 12 — an entry settling now is followed.
    r.append("d", true);
    r.settle("d");
    expect(n(), "row 12").toBe(0);

    // 11 — clear after a count.
    r.follow(false);
    r.append("e", false);
    expect(n(), "before clear").toBe(1);
    r.clear();
    expect(n(), "row 11").toBe(0);

    // The reset is the viewport's: scrolling up again starts from zero, not from a stale count.
    r.follow(true);
    r.follow(false);
    expect(n(), "a fresh scroll-up").toBe(0);
  });

  it("T1.188 (C22 I154): defect and agent origins count, user and action do not, at the settle as at the append", () => {
    for (const [origin, counted] of [["agent", 1], ["refresh", 1], ["defect", 1], ["user", 0], ["action", 0]] as const) {
      const r = rig();
      r.follow(false);
      r.append("x", true, origin);
      r.settle("x");
      expect(r.counter.count(), `${origin} settle`).toBe(counted);
      const q = rig();
      q.follow(false);
      q.append("y", false, origin);
      expect(q.counter.count(), `${origin} append`).toBe(counted);
    }
  });
});

describe("C22 I155 — the button's text", () => {
  it("T1.189 (C22 I155, §6u.2 rulings e, f): padded at colour, bracketed at 1-bit, Down at ASCII, one message singular", () => {
    expect(newBelowText(3, 80, FULL_CAPS)).toBe(" ↓ 3 new messages ");
    expect(newBelowText(1, 80, FULL_CAPS), "1 messages is sloppy").toBe(" ↓ 1 new message ");
    expect(newBelowText(3, 80, { ...FULL_CAPS, colourDepth: 1 })).toBe("[↓ 3 new messages]");
    expect(newBelowText(3, 80, ASCII_CAPS)).toBe(" Down 3 new messages ");
  });

  it("T1.189 (C22 I155, §6u.2 ruling f): width sheds the words and never the number, then the button", () => {
    // room = width - 1 (the bar) - 2 (the indent); " ↓ 3 new messages " is 18 cells.
    expect(newBelowText(3, 21, FULL_CAPS)).toBe(" ↓ 3 new messages ");
    expect(newBelowText(3, 20, FULL_CAPS), "one short: the noun goes").toBe(" ↓ 3 new ");
    expect(newBelowText(3, 12, FULL_CAPS), "the shortest that holds `new`").toBe(" ↓ 3 new ");
    expect(newBelowText(3, 11, FULL_CAPS), "one short again: `new` goes").toBe(" ↓ 3 ");
    expect(newBelowText(3, 8, FULL_CAPS), "the number alone fits").toBe(" ↓ 3 ");
    expect(newBelowText(3, 7, FULL_CAPS), "not even that: no button, not a cut one").toBeNull();
    expect(newBelowText(214, 8, FULL_CAPS), "a wider number sheds the same way").toBeNull();
  });
});

describe("C22 I155 — the button in the frame", () => {
  const frame = frameAt(80, 24);
  const { top, height } = frame.region;
  const lines = Array.from({ length: height }, (_, i) => `row ${String(i)}`);
  const drawn = (over: Partial<PaintDeps>): readonly string[] =>
    paint(frame, depsFor({ transcriptRows: () => lines, ...over })).slice(top, top + height);

  it("T1.189 (C22 I155, §6u.2 ruling b): the button is the region's last row, the rows above it are untouched and the count of rows is the region's", () => {
    const bare = drawn({});
    const withButton = drawn({ newBelow: () => 3 });
    expect(withButton, "the region keeps its height").toHaveLength(height);
    expect(withButton.slice(0, -1), "every row above the last is the bare frame's").toEqual(bare.slice(0, -1));
    expect(plain(withButton.at(-1)!).trimEnd(), "the figure's row: the margin, the pad, the words").toBe("   ↓ 3 new messages");
    expect(withButton.at(-1), "painted: a ground, not plain text").not.toBe(plain(withButton.at(-1)!));
    expect(bare.at(-1), "and the bare frame has none of it").not.toContain("new message");
  });

  it("T1.189 (C22 I155): nothing is drawn at a count of zero, and not in a region too short to spare the row", () => {
    expect(drawn({ newBelow: () => 0 })).toEqual(drawn({}));
    // The frame whose region is two rows: the button would hide half of it (ruling b).
    const tiny = (() => {
      for (let rows = 4; rows < 20; rows += 1) {
        const f = frameAt(80, rows);
        if (f.region.height === 2) return f;
      }
      throw new Error("no terminal height gives a 2-row region");
    })();
    const rowsOf = (over: Partial<PaintDeps>): readonly string[] =>
      paint(tiny, depsFor({ transcriptRows: () => ["row 0", "row 1"], ...over })).slice(tiny.region.top, tiny.region.top + 2);
    expect(rowsOf({ newBelow: () => 5 }), "a 2-row region keeps both rows").toEqual(rowsOf({}));
  });

  it("T1.189 (C22 I155, §6u.2 ruling e): at 1-bit the brackets carry the button, and no row carries a ground", () => {
    const row = drawn({ newBelow: () => 1, capabilities: { ...FULL_CAPS, colourDepth: 1 } }).at(-1)!;
    expect(plain(row).trimEnd()).toBe("  [↓ 1 new message]");
    expect(row, "no SGR at all at 1-bit").toBe(plain(row));
  });

  it("T1.189 (C22 I155): the ASCII rung draws no character above U+007F", () => {
    const row = drawn({ newBelow: () => 12, capabilities: ASCII_CAPS }).at(-1)!;
    expect(plain(row).trimEnd()).toBe("   Down 12 new messages");
    expect([...row].filter((c) => (c.codePointAt(0) ?? 0) > 127)).toEqual([]);
  });
});
