// C28 §3c — the profiler's view (docs/components/C28_profiler.md §10), tiers 1
// and 3, with C15 I25's row and C24 I33's, because the owner whose state those
// two invariants protect lives here.
//
// **The rig is a real recorder, a real overlay manager and a held timer.** The
// recorder because the rows are about what the profiler *records* when the view
// redraws — a fake that returned a flag would be asserting the view called the
// flag, which is the mechanism and not the wiring (C28 T4.4's lesson, one
// component down). The manager because C15 I25 is about what the manager emits,
// and the view's teardown is a subscriber to it. The timer held rather than
// waited for, because a row that sleeps for a second measures the scheduler.
//
// `redraw` is wired the way `construct.ts` wires the commit seam and `session.ts`
// brackets a frame: `commit(reason, false)`, then `beginFrame`/`endFrame`. So a
// redraw inside `profiler.own` records a `selfInflicted` frame and one outside
// does not, and *inside the bracket* is read off the report rather than off a
// spy on `own`.
import { describe, expect, it } from "vitest";

import * as api from "../../src/index.js";
import type { Block, KeyValue, Notice, Table } from "../../src/data/viewmodel/index.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { PANES, paneTitle, profilePane } from "../../src/shell/profiling/panes.js";
import type { PaneName } from "../../src/shell/profiling/panes.js";
import type { CommitReason, ProfileReport, Profiler, Tier } from "../../src/shell/profiling/types.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import {
  createProfileView,
  PROFILE_VIEW_ID,
  VIEW_REFRESH_MS,
} from "../../src/shell/profile-view.js";
import type { ProfileView } from "../../src/shell/profile-view.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import type { OverlayChange, OverlayManager } from "../../src/viewport/overlay/index.js";
import type { GlyphCaps } from "../../src/presentation/blocks/index.js";
import { centred } from "../support/overlay.js";
import { ASCII_CAPS, FULL_CAPS, measurable } from "../support/render.js";

/**
 * The registry the rows measure with: C09's defaults plus `table` and `plot`,
 * registered as `construct.ts` registers them (F959).
 *
 * `test/support/overlay.ts`'s `registry` had neither when this was written, and
 * through it a plot or a table fell to `raw` and measured as the wrapped lines
 * of its own JSON — the overview read 26 rows at twelve frames there and was
 * 40 through this one, so every window the rows here asserted was a window on
 * the JSON. That fixture carries the three definitions now (F959); a row about
 * what fits has to measure what is drawn, and T1.100 builds a bare registry of
 * its own as the control that shows the difference.
 */
const kit = measurable({ capabilities: FULL_CAPS, definitions: [tableDefinition, plotDefinition] });
// **The control's registry, built bare here on purpose.** It used to borrow
// `test/support/overlay.ts`'s, which was bare when this row was written and
// carries the three definitions since F959 — so the control went equal to its
// subject the day the fixture was repaired. A control has to own its defect.
const bareRegistry = measurable({ capabilities: FULL_CAPS }).registry;
const registry = {
  measureSequence: (blocks: readonly Block[], width: number): number =>
    kit.registry.measureSequence(blocks, width),
};

/** A counter clock. Every row here asks *what was drawn*, never *how long*. */
const counterClock = (): (() => number) => {
  let t = 0;
  return () => (t += 1);
};

type Rig = Readonly<{
  profiler: Profiler;
  overlays: OverlayManager;
  view: ProfileView;
  /** Every change the manager emitted, in order. */
  changes: OverlayChange[];
  /** Every `redraw` the view asked for, by reason. */
  redraws: ("input" | "stream")[];
  /** Every `setTier` the view made, on a spy over the recorder. */
  setTierCalls: Tier[];
  /** Every report the view took — the one it drew is the last. */
  reports: ProfileReport[];
  /** Fire the held timer; throws when none is armed. */
  tick: () => void;
  /** The held callback, or `null` — for the row that fires a disarmed one. */
  held: () => (() => void) | null;
  armed: () => boolean;
  disposals: () => number;
  /** Mutable, so a row can shrink the region under an open view (T3.14). */
  region: { width: number; height: number };
  /** The layer's content, or a throw — a row asserting on a missing layer is about nothing. */
  content: () => readonly Block[];
}>;

/** A reader's own frame — a commit outside the bracket, then a frame for it. */
const readerFrame = (p: Profiler): void => {
  p.commit("input", false);
  p.beginFrame("input");
  p.endFrame("frame");
};

/**
 * Every commit reason, from the type rather than a list with a birthday: a
 * member added to `CommitReason` fails the `satisfies` here instead of leaving
 * T1.100 measuring a smaller overview than the pane can be.
 */
const ALL_REASONS = Object.keys({
  input: true, completion: true, resize: true, stream: true, spinner: true,
} satisfies Record<CommitReason, true>) as readonly CommitReason[];

/** One frame under `reason`; `measured` adds three spans, a counter and two caches. */
const frameOf = (p: Profiler, reason: CommitReason, measured: boolean): void => {
  p.commit(reason, false);
  // A second commit in the same window, so *saved by coalescing* is a non-zero
  // figure somewhere in the table and not a column of zeroes.
  if (reason === "stream") p.commit(reason, false);
  p.beginFrame(reason);
  if (measured) {
    {
      using _a = p.span("compose");
      {
        using _b = p.span("measure");
      }
    }
    {
      using _c = p.span("paint");
    }
    p.count("bytes.written", 4000);
    p.hit("height");
    p.miss("height", "width");
    p.hit("layout");
  }
  p.endFrame("frame");
};

/** The four reports C28 §3c's table walks, as seeds for the rig. */
const seeds: Readonly<Record<"empty" | "twelve" | "full" | "reasons", (p: Profiler) => void>> = {
  empty: () => undefined,
  twelve: (p) => {
    for (let i = 0; i < 12; i += 1) frameOf(p, "input", false);
  },
  full: (p) => {
    for (let i = 0; i < 12; i += 1) frameOf(p, "input", true);
  },
  reasons: (p) => {
    for (let i = 0; i < 20; i += 1) frameOf(p, ALL_REASONS[i % ALL_REASONS.length] as CommitReason, true);
  },
};

const rig = (
  opts: Readonly<{
    tier?: Tier;
    caps?: GlyphCaps;
    region?: { width: number; height: number };
    /** `null` builds the view with no profiler — the C23 I68 arm. */
    profiler?: null;
    /** Frames to record before the view opens, so a row can open on a report of its choosing. */
    seed?: (p: Profiler) => void;
  }> = {},
): Rig => {
  const changes: OverlayChange[] = [];
  const redraws: ("input" | "stream")[] = [];
  const setTierCalls: Tier[] = [];
  const reports: ProfileReport[] = [];
  const region = opts.region ?? { width: 80, height: 24 };

  const real = createProfiler({ tier: opts.tier ?? "spans" }, { elapsed: counterClock() });
  opts.seed?.(real);
  // A spy that delegates: `tier` and `own` are closure-backed getters on the
  // recorder, so a prototype view reads them live and only the two members a
  // row counts are shadowed.
  const spied = Object.create(real) as Profiler;
  spied.setTier = (tier: Tier): void => {
    setTierCalls.push(tier);
    real.setTier(tier);
  };
  spied.report = (): ProfileReport => {
    const r = real.report();
    reports.push(r);
    return r;
  };
  const profiler = opts.profiler === null ? null : spied;

  const overlays = createOverlayManager({ registry });
  overlays.subscribe((c) => void changes.push(c));

  let held: (() => void) | null = null;
  let disposals = 0;
  const view = createProfileView({
    overlays,
    profiler,
    capabilities: opts.caps ?? FULL_CAPS,
    measureSequence: (blocks, width) => registry.measureSequence(blocks, width),
    region: () => region,
    schedule: (fn, ms) => {
      expect(ms, "the view arms at its own cadence and no other").toBe(VIEW_REFRESH_MS);
      held = fn;
      return {
        [Symbol.dispose]: () => {
          disposals += 1;
          if (held === fn) held = null;
        },
      };
    },
    redraw: (reason) => {
      redraws.push(reason);
      if (profiler === null) return;
      profiler.commit(reason, false);
      profiler.beginFrame(reason);
      profiler.endFrame("frame");
    },
  });

  return {
    profiler: spied,
    overlays,
    view,
    changes,
    redraws,
    setTierCalls,
    reports,
    tick: () => {
      const fn = held;
      if (fn === null) throw new Error("no tick is armed");
      fn();
    },
    held: () => held,
    armed: () => held !== null,
    disposals: () => disposals,
    region,
    content: () => {
      const layer = overlays.stack.find((l) => l.id === PROFILE_VIEW_ID);
      if (layer === undefined) throw new Error("the view is not on the stack");
      return layer.content;
    },
  };
};

const measure = (blocks: readonly Block[], width = 80): number =>
  registry.measureSequence(blocks, width);

const kvValue = (blocks: readonly Block[], id: string, label: string): string | undefined =>
  (blocks.find((x): x is KeyValue => x.kind === "keyValue" && x.id === id))?.rows.find(
    (r) => r.label === label,
  )?.value;

const lastReport = (r: Rig): ProfileReport => {
  const last = r.reports.at(-1);
  if (last === undefined) throw new Error("the view has taken no report");
  return last;
};

describe("C28 §3c — the profiler's view", () => {
  it("T1.92 (C28 I49): a frame only the view raised is self-inflicted; a frame the reader also raised is not", () => {
    const r = rig();
    expect(r.view.open(), "opened").toBeNull();

    // `open` redrew once, inside the bracket, and the rig drew a frame for it.
    const mine = r.profiler.report();
    expect(mine.frames, "a frame was drawn").toBe(1);
    expect(mine.excluded.selfInflicted, "and it is the profiler's own").toBe(1);
    expect(mine.latency?.work.count, "in no histogram").toBe(0);
    expect(mine.timeline, "and on no timeline — the report keeps what the reader waited on").toEqual([]);

    // **A tick alone is the view's frame too.** `open` has a bracket of its own
    // and the timer's redraw goes through `render`; a row that stopped at the
    // open would pass with `render`'s bracket removed (measured: it did).
    r.tick();
    const ticked = r.profiler.report();
    expect(ticked.frames).toBe(2);
    expect(ticked.excluded.selfInflicted, "the tick's frame is excluded too").toBe(2);
    expect(ticked.latency?.work.count).toBe(0);

    // **The control is the mixed frame** (C28 I12 says *every*). A reader's
    // commit in the same window as the tick's, then the tick's frame: a bracket
    // that marked the frame on *any* own commit would exclude it too.
    r.profiler.commit("input", false);
    r.tick();
    const mixed = r.profiler.report();
    expect(mixed.frames).toBe(3);
    expect(mixed.excluded.selfInflicted, "excluded did not move for a frame the reader waited on").toBe(2);
    expect(mixed.latency?.work.count, "and the histogram gained it").toBe(1);
    expect(mixed.timeline.map((f) => f.selfInflicted)).toEqual([false]);
  });

  it("T1.93 (C28 I50): raised only when below, restored only when raised, and never `setTier` on an unchanged tier", () => {
    // Arm 1: below `spans`, so raised — and restored.
    const low = rig({ tier: "counters" });
    low.view.open();
    expect(low.profiler.tier).toBe("spans");
    expect(low.view.pop()).toBe(true);
    expect(low.profiler.tier).toBe("counters");
    expect(low.setTierCalls, "once up, once down").toEqual(["spans", "counters"]);

    // Arm 2: above `spans`, so left alone — and the ring with it. `setTier`
    // resets the ring (C28 I18), so *not raised* has to mean *not called*.
    const high = rig({ tier: "alloc" });
    readerFrame(high.profiler);
    readerFrame(high.profiler);
    const before = high.profiler.report().timeline;
    expect(before, "two frames recorded before the view opened").toHaveLength(2);
    high.view.open();
    expect(high.profiler.tier).toBe("alloc");
    expect(high.profiler.report().timeline.slice(0, 2), "still there while open").toEqual(before);
    high.view.pop();
    expect(high.profiler.report().timeline.slice(0, 2), "and after closing").toEqual(before);
    expect(high.setTierCalls, "no call either way").toEqual([]);

    // **Arm 3 is the row.** At `spans` exactly, a restore that calls
    // `setTier(remembered)` unconditionally is green on the tier — the recorder
    // short-circuits an unchanged one — and this spy is what sees the call.
    const level = rig({ tier: "spans" });
    level.view.open();
    level.view.pop();
    expect(level.profiler.tier).toBe("spans");
    expect(level.setTierCalls, "zero calls across open and close").toEqual([]);
  });

  it("T1.94 (C28 I50, C15 I25): a non-owner's `pop()` reaches the owner through the change stream, and only for its own id", () => {
    const r = rig({ tier: "counters" });
    r.view.open();
    expect(r.profiler.tier).toBe("spans");
    expect(r.armed(), "the refresh is armed while open").toBe(true);

    // The ⌃c ladder's call: `overlays.pop()`, asking no owner (F944).
    const popped = r.overlays.pop();
    expect(popped?.id).toBe(PROFILE_VIEW_ID);
    expect(r.overlays.stack, "the stack is empty").toEqual([]);
    expect(r.view.pane, "the owner knows").toBeNull();
    expect(r.profiler.tier, "the tier is restored").toBe("counters");
    expect(r.armed(), "and a later tick fires nothing — the timer is gone").toBe(false);
    expect(() => r.tick()).toThrow("no tick is armed");

    // **The control**: a dismissable overlay above the view, popped the same
    // way. Its change carries *its* id, and a teardown on any removal would
    // close the view under a menu (§9b S11).
    expect(r.view.open(), "reopened for the control").toBeNull();
    r.overlays.push(centred("menu", 2));
    const menu = r.overlays.pop();
    expect(menu?.id).toBe("menu");
    expect(r.changes.at(-1)).toEqual({ kind: "pop", id: "menu", layerKind: "overlay" });
    expect(r.view.pane, "the view is untouched").toBe("overview");
    expect(r.profiler.tier, "the tier stays raised").toBe("spans");
    expect(r.overlays.stack.map((l) => l.id)).toEqual([PROFILE_VIEW_ID]);
    expect(r.armed()).toBe(true);
  });

  it("T1.95 (C28 I51): the timer redraws in place, one `content` change and one bracketed `stream` commit per tick, and disposal is what stops it", () => {
    const r = rig();
    r.view.open();
    const afterOpen = { changes: r.changes.length, redraws: r.redraws.length };
    expect(r.redraws).toEqual(["input"]);
    expect(r.profiler.report().excluded.selfInflicted).toBe(1);

    // Nothing between ticks.
    expect(r.changes.length).toBe(afterOpen.changes);

    for (let n = 1; n <= 2; n += 1) {
      r.tick();
      const fresh = r.changes.slice(afterOpen.changes);
      expect(fresh, `tick ${String(n)}: exactly one change, on the view's id`).toEqual(
        Array.from({ length: n }, () => ({ kind: "content", id: PROFILE_VIEW_ID })),
      );
      expect(r.redraws.slice(afterOpen.redraws), `tick ${String(n)}: one stream commit per tick`).toEqual(
        Array.from({ length: n }, () => "stream"),
      );
      expect(r.profiler.report().excluded.selfInflicted, `tick ${String(n)}: inside the bracket`).toBe(1 + n);
      expect(r.armed(), "and re-armed").toBe(true);
    }

    // **After `pop()`.** The disposable has been called, and the callback that
    // was armed is inert if something fired it anyway — a generation guard in
    // the callback would pass the second clause and hide the first.
    const stale = r.held();
    const disposedBefore = r.disposals();
    expect(r.view.pop()).toBe(true);
    expect(r.disposals(), "the timer was disposed by the teardown").toBe(disposedBefore + 1);
    expect(r.armed()).toBe(false);
    const quiet = { changes: r.changes.length, redraws: r.redraws.length };
    stale?.();
    expect(r.changes.length, "a fired stale tick changes nothing").toBe(quiet.changes);
    expect(r.redraws.length, "and raises no commit").toBe(quiet.redraws);
  });

  it("T1.96 (C28 I51, C09 I49): the pane is drawn with the terminal's capabilities, never `profilePane`'s ASCII default", () => {
    const under = (caps: GlyphCaps): { sep: string; excluded: string | undefined; matches: boolean; header: string } => {
      const r = rig({ caps });
      r.view.open();
      const content = r.content();
      const header = content[0];
      if (header?.kind !== "rule") throw new Error("the first block is the header rule");
      const body = content.slice(1);
      return {
        sep: caps.unicode === "ascii" ? ":" : "·",
        excluded: kvValue(body, "ov-regime", "excluded"),
        matches: JSON.stringify(body) === JSON.stringify(profilePane(lastReport(r), "overview", caps)),
        header: header.label,
      };
    };

    const ascii = under(ASCII_CAPS);
    expect(ascii.excluded, "the ASCII arm's separator").toBe("0 self-inflicted : 0 fallback");
    expect(ascii.header).toBe(`profiler : ${paneTitle("overview")}`);
    expect(ascii.matches, "equals profilePane for the caps handed in").toBe(true);

    const unicode = under(FULL_CAPS);
    expect(unicode.excluded, "the unicode arm's separator — the one the default would never draw").toBe(
      "0 self-inflicted · 0 fallback",
    );
    expect(unicode.header).toBe(`profiler · ${paneTitle("overview")}`);
    expect(unicode.matches).toBe(true);
  });

  it("T1.97 (C28 I50, C23 I68): with no profiler there is nothing to raise, and `open` refuses naming `TuiConfig.profile`", () => {
    const r = rig({ profiler: null });
    const refused = r.view.open();
    expect(refused).toMatch(/TuiConfig\.profile/u);
    expect(r.overlays.stack, "nothing pushed").toEqual([]);
    expect(r.changes, "no change emitted").toEqual([]);
    expect(r.view.pane).toBeNull();
    expect(r.armed(), "no timer armed").toBe(false);
  });

  it("T1.98 (C28 I51, C15 I8): a pane taller than the region is windowed at block boundaries, and a block taller than the region is shown under a notice", () => {
    // A region of eight over the overview: the header and the pane together
    // do not fit even on an empty ring — nine rows in four blocks through the
    // registry that draws them — so the layer holds the blocks that do and no
    // more.
    const r = rig({ region: { width: 80, height: 8 } });
    r.view.open();
    const first = r.content();
    const full: readonly Block[] = [first[0] as Block, ...profilePane(lastReport(r), "overview", FULL_CAPS)];
    expect(measure(full), "the fixture responds: the whole pane is taller than the region").toBeGreaterThan(8);
    expect(measure(first), "what is shown fits").toBeLessThanOrEqual(8);
    expect(first.length, "and is a prefix of the pane").toBeLessThan(full.length);
    expect(first, "block boundaries, from the top").toEqual(full.slice(0, first.length));
    expect(measure([...first, full[first.length] as Block]), "one more block would not fit").toBeGreaterThan(8);

    // On the empty ring the tail from the second block fits a page, so
    // `pageDown` clamps to the last offset that still fills the region — the
    // document view's clamp — rather than turning a page. Asserted, because a
    // motion that overshot into a short last page would pass the arm below.
    expect(r.view.move("pageDown")).toBe(true);
    expect(r.content()[0]?.id, "clamped to the last offset whose tail fills the region").toBe(full[1]?.id);
    expect(measure(r.content())).toBeLessThanOrEqual(8);
    expect(r.view.move("pageDown"), "and no further").toBe(false);

    // `pageDown` moves the window by the blocks that were showing; `top`
    // returns. Over the largest report the type allows (T1.100's), whose tail
    // is more than a page at eight rows.
    const paged = rig({ region: { width: 80, height: 8 }, seed: seeds.reasons });
    paged.view.open();
    const firstPage = paged.content();
    const whole: readonly Block[] = [firstPage[0] as Block, ...profilePane(lastReport(paged), "overview", FULL_CAPS)];
    expect(measure(whole), "the fixture responds: three pages at eight rows").toBeGreaterThan(16);
    const page = firstPage.length;
    expect(paged.view.move("pageDown")).toBe(true);
    expect(paged.content()[0]?.id, "the window starts where the last one ended").toBe(whole[page]?.id);
    expect(measure(paged.content())).toBeLessThanOrEqual(8);
    expect(paged.view.move("top")).toBe(true);
    expect(paged.content()).toEqual(firstPage);

    // `n` switches pane and resets the offset to 0 — the view's own unit.
    paged.view.move("pageDown");
    expect(paged.view.switchPane(1)).toBe(true);
    expect(paged.view.pane).toBe("frame");
    const head = paged.content()[0];
    expect(head?.kind).toBe("rule");
    expect(head?.kind === "rule" ? head.label : "").toContain(paneTitle("frame"));
    expect(head?.kind === "rule" ? head.meta : "").toBe("2/4");

    // A region of one row: the header is one row and fits alone, with no
    // notice — the gap C28 I52 took off it was a blank first row on every page.
    // Then `pageDown` to the four-row regime block: that block alone, under a
    // notice that counts the hidden rows and does **not** say *n/p move by
    // block*, because here they do not (§9b B5).
    const tiny = rig({ region: { width: 80, height: 1 } });
    tiny.view.open();
    const alone = tiny.content();
    expect(alone.map((x) => x.kind), "the one-row header fits a one-row region by itself").toEqual(["rule"]);
    expect(measure(alone)).toBe(1);
    expect(tiny.view.move("pageDown")).toBe(true);
    const shown = tiny.content();
    expect(shown.map((x) => x.kind)).toEqual(["notice", "keyValue"]);
    const notice = shown[0] as Notice;
    const tall = shown[1] as Block;
    expect(tall.id).toBe("ov-regime");
    expect(measure([tall]), "the fixture responds: the regime block alone is taller than the region").toBeGreaterThan(1);
    const hidden = measure([tall]) - Math.max(0, 1 - measure([notice]));
    expect(notice.text).toBe(`${String(hidden)} more rows — this block is taller than the screen`);
    expect(notice.text).not.toMatch(/n\/p/u);
  });

  it("T1.100 (C28 I52): the overview measures at most 23 rows at 80 columns for every report, met by moving and not by dropping, and the four walked figures hold", () => {
    // **The fixture that bounds the claim is the type's, not a convenient one.**
    // The coalescing table has one row per `CommitReason`, so the largest
    // overview the type allows records every reason — `seeds.reasons`, over
    // `ALL_REASONS`, which the type checks.
    const shapes = seeds;
    // §3c's table, header included, at 80 columns — asserted so the table
    // cannot outlive its measurement (F935). The bound is the rule; this is
    // the record beside it, and it is what sees a block grow by two rows
    // inside the slack the bound leaves.
    const walked: Readonly<Record<string, number>> = { empty: 9, twelve: 17, full: 18, reasons: 22 };

    const measured: Record<string, number> = {};
    for (const [name, seed] of Object.entries(shapes)) {
      const r = rig({ region: { width: 80, height: 24 }, seed });
      expect(r.view.open(), `${name}: opened`).toBeNull();
      const content = r.content();
      const pane = profilePane(lastReport(r), "overview", FULL_CAPS);
      // Through the view at the region the harness has: every block of the
      // pane is on the layer and none is windowed off.
      expect(content.slice(1), `${name}: the whole pane is on the layer`).toEqual(pane);
      for (const width of [80, 120]) {
        expect(measure(pane, width), `${name} at ${String(width)}: the pane within the budget`).toBeLessThanOrEqual(23);
        expect(measure(content, width), `${name} at ${String(width)}: with the header, within the region`).toBeLessThanOrEqual(24);
      }
      measured[name] = measure(content, 80);
    }
    expect(measured, "the four walked figures, header included, at 80").toEqual(walked);

    // **The fixture responds, and the ceiling is met by moving, not dropping.**
    // The largest report's overview holds a coalescing row per reason and the
    // latency plot; the two tables no type bounds are on `frame`, whole, and
    // the overview says so with the counts.
    const r = rig({ seed: shapes.reasons });
    r.view.open();
    const report = lastReport(r);
    const ov = profilePane(report, "overview", FULL_CAPS);
    const coalesce = ov.find((x): x is Table => x.kind === "table" && x.id === "ov-coalesce");
    expect(coalesce?.rows.map((row) => row.id), "one coalescing row per reason").toEqual(ALL_REASONS);
    const stream = coalesce?.rows.find((row) => row.id === "stream")?.cells;
    expect(
      [stream?.commits?.text, stream?.frames?.text, stream?.saved?.text],
      "the difference the caption used to ask for is a column",
    ).toEqual(["8", "4", "4"]);
    expect(ov.some((x) => x.kind === "plot" && x.id === "ov-latency"), "and the latency plot").toBe(true);
    expect(ov.filter((x) => x.kind === "table").map((x) => x.id), "no table the type does not bound").toEqual(["ov-coalesce"]);
    const pointer = ov.find((x): x is Notice => x.kind === "notice" && x.id === "ov-elsewhere");
    expect(pointer?.text).toBe("1 counter and 2 caches are on the frame pane — press n");

    const fr = profilePane(report, "frame", FULL_CAPS);
    const counters = fr.find((x): x is Table => x.kind === "table" && x.id === "fr-counters");
    const cache = fr.find((x): x is Table => x.kind === "table" && x.id === "fr-cache");
    const recorded = Object.keys(report.counters).filter((k) => !k.startsWith("commit.") && !k.startsWith("frame."));
    expect(recorded, "the fixture responds: a counter was recorded").toEqual(["bytes.written"]);
    expect(counters?.rows.map((row) => row.id), "every counter, on frame").toEqual(recorded);
    expect(cache?.rows.map((row) => row.id), "every cache, on frame").toEqual(["height", "layout"]);
    // And on the empty ring there is nothing to point at, so no pointer.
    expect(profilePane(createProfiler({ tier: "spans" }, { elapsed: counterClock() }).report(), "overview", FULL_CAPS).some((x) => x.id === "ov-elsewhere"), "no pointer at an empty table").toBe(false);

    // **The harness's registry has no `plot`** (F959). Through it the
    // twelve-frame pane measures as the wrapped JSON of its plot and reads as
    // shorter than it draws — the instrument F947's figure came from. The
    // empty ring holds no plot and the two agree there, which is the control
    // on the control.
    const twelve = createProfiler({ tier: "spans" }, { elapsed: counterClock() });
    shapes.twelve?.(twelve);
    const drawn = profilePane(twelve.report(), "overview", FULL_CAPS);
    expect(bareRegistry.measureSequence(drawn, 80), "a plot measured as its JSON is shorter than the plot").toBeLessThan(measure(drawn, 80));
    const none = profilePane(createProfiler({ tier: "spans" }, { elapsed: counterClock() }).report(), "overview", FULL_CAPS);
    expect(bareRegistry.measureSequence(none, 80), "and agrees where there is no plot to measure").toBe(measure(none, 80));
  });

  it("T1.99 (C28 I50, C15 I1): `open` while open is refused, pushes nothing, and does not overwrite the remembered tier", () => {
    const r = rig({ tier: "counters" });
    expect(r.view.open()).toBeNull();
    const again = r.view.open("frame");
    expect(again).toMatch(/profiler view/u);
    expect(r.changes.filter((c) => c.kind === "push"), "one push in the log").toHaveLength(1);
    expect(r.view.pane, "and the pane did not change").toBe("overview");

    // **The second clause is the row** (§9b S7): a second raise would remember
    // `spans` and the close would restore to `spans`.
    r.view.pop();
    expect(r.profiler.tier, "restored to what the first open found").toBe("counters");
    expect(r.setTierCalls).toEqual(["spans", "counters"]);
  });

  it("T3.12 (C28 I50): opened at `off`, the view raises to `spans` and closing restores `off`", () => {
    // The arm T1.16d does not construct: `off` is where *restore the tier
    // before* and *restore to counters* disagree.
    const r = rig({ tier: "off" });
    expect(r.view.open()).toBeNull();
    expect(r.profiler.tier).toBe("spans");
    r.view.pop();
    expect(r.profiler.tier).toBe("off");
    expect(r.setTierCalls).toEqual(["spans", "off"]);
  });

  it("T3.13 (C28 I50): `dispose()` against a live profiler stops the timer and leaves the tier", () => {
    // Opened at `counters`, so *leaves the tier* has something to leave: at
    // `spans` a dispose that restored would call nothing and the row would be
    // green either way.
    const r = rig({ tier: "counters" });
    r.view.open();
    r.tick();
    expect(r.profiler.tier, "raised").toBe("spans");
    const before = r.profiler.report().timeline;
    const changesBefore = r.changes.length;

    r.view.dispose();
    expect(r.armed(), "the timer is disposed — no later tick changes the layer").toBe(false);
    expect(r.profiler.tier, "the tier is left where it was — raised, not restored").toBe("spans");
    expect(r.setTierCalls, "one call, up; none down").toEqual(["spans"]);
    expect(r.profiler.report().timeline, "and the ring is untouched").toEqual(before);
    expect(r.view.pane, "the owner holds nothing").toBeNull();

    expect(r.view.pop(), "pop afterwards is false").toBe(false);
    expect(r.changes.length, "and emits nothing").toBe(changesBefore);
  });

  it("T3.14 (C28 I51, C28 I26): the region shrinks under an open view — unchanged until the next tick, re-windowed by it, and no commit for the resize itself", () => {
    const r = rig({ region: { width: 80, height: 24 } });
    r.view.open();
    const wide = r.content();
    expect(measure(wide), "the fixture responds: everything fits at 24").toBeLessThanOrEqual(24);
    expect(measure(wide), "and would not at 8").toBeGreaterThan(8);
    const redraws = r.redraws.length;

    r.region.height = 8;
    expect(r.content(), "nothing moves on the resize").toEqual(wide);
    expect(r.redraws.length, "and nothing is committed for it").toBe(redraws);

    r.tick();
    const narrow = r.content();
    expect(measure(narrow), "the tick re-windows to the new region").toBeLessThanOrEqual(8);
    expect(narrow.length).toBeLessThan(wide.length);
    expect(r.redraws.slice(redraws), "one bracketed stream commit, for the tick").toEqual(["stream"]);
  });

  it("T1.28 (C15 I25): every removal emits one change with the layer's id before the call returns, and a removal of nothing emits nothing", () => {
    const r = rig();
    r.view.open();

    // A non-owner's `pop()`: the change is in the log and the owner's state is
    // gone **when `pop()` returns**, not a turn later.
    const n = r.changes.length;
    const popped = r.overlays.pop();
    expect(popped?.id).toBe(PROFILE_VIEW_ID);
    expect(r.changes.slice(n)).toEqual([{ kind: "pop", id: PROFILE_VIEW_ID, layerKind: "view" }]);
    expect(r.view.pane).toBeNull();

    // `dismiss(id)` on the same view: one `dismiss`, with its reason.
    r.view.open();
    const m = r.changes.length;
    r.overlays.dismiss(PROFILE_VIEW_ID);
    expect(r.changes.slice(m)).toEqual([{ kind: "dismiss", id: PROFILE_VIEW_ID, reason: "explicit" }]);
    expect(r.view.pane).toBeNull();

    // An id not on the stack: nothing at all.
    const k = r.changes.length;
    r.overlays.dismiss("never-pushed");
    expect(r.changes.slice(k)).toEqual([]);
  });

  it("T1.11 (C24 I33): nothing that opens the view is published, and the view draws with the pane exports that are", () => {
    const published = Object.keys(api);
    expect(published, "no constructor").not.toContain("createProfileView");
    expect(published, "no layer id").not.toContain("PROFILE_VIEW_ID");
    expect(published, "no refresh cadence").not.toContain("VIEW_REFRESH_MS");
    expect(published.filter((k) => /profile.?view/iu.test(k)), "nothing named for the view").toEqual([]);

    // What was published to draw a pane is what the framework's own view draws
    // with — `paneTitle`'s first consumer (F945), through the same export.
    const r = rig();
    r.view.open();
    const content = r.content();
    const header = content[0];
    expect(header?.kind).toBe("rule");
    expect(header?.kind === "rule" ? header.label : "").toContain(api.paneTitle("overview"));
    expect(content.slice(1)).toEqual(api.profilePane(lastReport(r), "overview", FULL_CAPS));
    expect(api.PANES).toEqual(PANES);
    for (const pane of api.PANES as readonly PaneName[]) {
      expect(typeof api.paneTitle(pane)).toBe("string");
    }
  });
});
