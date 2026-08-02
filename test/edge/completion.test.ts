// C19 tier 3 — edge cases. Failing sources, the TTL, empty sets, and the two
// filesystem sources driven entirely by a fake reader (I17).
import { describe, expect, it, vi } from "vitest";

import {
  createEngine,
  executableSource,
  flagValueSource,
  menuBlocks,
  menuWidth,
  pathSource,
} from "../../src/interaction/completion/index.js";
import type { CompletionSource } from "../../src/interaction/completion/index.js";
import { at, deferredSource, fakeClock, fakeDirs, instantSource } from "../support/completion.js";
import type { Candidate } from "../../src/interaction/completion/index.js";
import { createBlockRegistry, type BlockDefinition } from "../../src/presentation/blocks/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { renderSequenceToLines } from "../../src/testing/index.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";

const FLAG_SLOT = "/ps --status=‸";

describe("C19 §3 — a failing source is dropped, not fatal (I6)", () => {
  it("T3.6: one of three throws and the other two still contribute", async () => {
    const clock = fakeClock();
    const errors: string[] = [];
    const engine = createEngine({
      now: clock.now,
      onSourceError: (id) => errors.push(id),
    });

    const bad: CompletionSource = {
      id: "bad",
      slots: ["flagValue"],
      dynamic: true,
      complete: () => Promise.reject(new Error("cluster is down")),
    };
    engine.register(instantSource("a", ["flagValue"], [{ value: "running" }]));
    engine.register(bad);
    engine.register(instantSource("b", ["flagValue"], [{ value: "queued" }]));

    const result = await engine.request(at(FLAG_SLOT), 1);
    expect(result.candidates.map((c) => c.value)).toEqual(["running", "queued"]);
    expect(errors).toEqual(["bad"]); // logged once, not per keystroke
  });

  it("a failure is not cached: the next Tab tries again", async () => {
    const clock = fakeClock();
    let calls = 0;
    const engine = createEngine({ now: clock.now, onSourceError: () => {} });
    engine.register({
      id: "flaky",
      slots: ["flagValue"],
      dynamic: true,
      complete: () => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new Error("transient"))
          : Promise.resolve([{ value: "running" }]);
      },
    });

    expect((await engine.request(at(FLAG_SLOT), 1)).candidates).toEqual([]);
    const second = await engine.request(at(FLAG_SLOT), 2);
    // Caching the failure would serve it for a minute; the user pressed Tab
    // again precisely because it did not work.
    expect(second.candidates.map((c) => c.value)).toEqual(["running"]);
    expect(calls).toBe(2);
  });
});

describe("C19 §3 — the TTL on an injected clock (I9, I10)", () => {
  it("T3.8: two requests inside the TTL are one invocation; after expiry, two", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const source = instantSource("uuids", ["flagValue"], [{ value: "running" }]);
    engine.register(source);

    await engine.request(at(FLAG_SLOT), 1);
    clock.advance(59_000);
    await engine.request(at(FLAG_SLOT), 2);
    expect(source.calls()).toBe(1);

    clock.advance(2_000); // now 61s since it resolved
    await engine.request(at(FLAG_SLOT), 3);
    expect(source.calls()).toBe(2);
  });

  it("the TTL runs from resolution, not from the call", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const d = deferredSource({ id: "slow" });
    engine.register(d.source);

    const flight = engine.request(at(FLAG_SLOT), 1);
    clock.advance(30_000); // a very slow source
    d.resolve([{ value: "running" }]);
    await flight;

    clock.advance(40_000); // 70s since the call, 40s since it answered
    await engine.request(at(FLAG_SLOT), 2);
    // Measured from the call, a slow source is charged its own latency out of
    // its cache lifetime — so the sources the cache exists for get least of it.
    expect(d.calls()).toBe(1);
  });
});

describe("C19 §5 — nothing to offer", () => {
  it("T3.2: no candidates means nothing happens — no menu, no error", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    engine.register(flagValueSource());
    const result = await engine.request(at("/ps --status=zzz‸"), 1);
    expect(result.candidates).toEqual([]);
    expect(result.commonPrefix).toBe("");
    expect(result.superseded).toBe(false);
  });

  it("T3.18: duplicates from two sources are deduplicated", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    engine.register(instantSource("a", ["flagValue"], [{ value: "running" }, { value: "failed" }]));
    engine.register(instantSource("b", ["flagValue"], [{ value: "running" }]));
    const result = await engine.request(at(FLAG_SLOT), 1);
    expect(result.candidates.map((c) => c.value)).toEqual(["running", "failed"]);
  });

  it("T1.7: a common prefix longer than what is typed is reported", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    engine.register(instantSource("a", ["flagValue"], [{ value: "status" }, { value: "statistics" }]));
    const result = await engine.request(at("/ps --status=sta‸"), 1);
    expect(result.commonPrefix).toBe("stat");
  });
});

describe("C19 §3 — the filesystem sources over the injected reader (I17)", () => {
  it("T5.4's mechanism: a path slot offers directory entries, not verbs", async () => {
    const dirs = fakeDirs({
      "src/": [
        { name: "index.ts", directory: false },
        { name: "interaction", directory: true },
      ],
    });
    const got = await pathSource(dirs.readDir).complete(at("/deploy src/in‸"));
    // Both match `in`, and the pair is the point: **the delimiter is the
    // candidate's** (I16). A directory gets `/` so the next `Tab` descends into
    // it, a file gets a space because it is finished — and nothing above this
    // source can tell the two apart.
    expect(got.map((c) => [c.value, c.delimiter])).toEqual([
      ["src/index.ts", " "],
      ["src/interaction", "/"],
    ]);
    expect(dirs.reads()).toEqual(["src/"]);
  });

  it("a PATH entry that does not exist is skipped, not fatal", async () => {
    const dirs = fakeDirs({ "/usr/bin": [{ name: "git", directory: false }] });
    const got = await executableSource(dirs.readDir, () => ["/nope", "/usr/bin"]).complete(
      at("gi‸"),
    );
    expect(got.map((c) => c.value)).toEqual(["git"]);
  });

  it("T1.4b: a leading slash never reaches the executable source (I14)", async () => {
    const dirs = fakeDirs({ "/usr/bin": [{ name: "git", directory: false }] });
    const got = await executableSource(dirs.readDir, () => ["/usr/bin"]).complete(at("/gi‸"));
    expect(got).toEqual([]);
  });
});

describe("C19 §6 — the menu", () => {
  it("T3.13: a large set still produces one block tree and a declared width", () => {
    const many = Array.from({ length: 5_000 }, (_, i) => ({ value: `candidate-${String(i)}` }));
    const blocks = menuBlocks(many.slice(0, 40), 0, many.length - 40);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ kind: "raw", text: "… 4960 more" });
    expect(menuWidth(many.slice(0, 40))).toBeGreaterThan(0);
  });

  it("T4.8b: moving the selection changes one glyph and nothing else", () => {
    const candidates = [
      { value: "running", detail: "up" },
      { value: "failed", detail: "down" },
    ];
    const first = menuBlocks(candidates, 0, 0);
    const second = menuBlocks(candidates, 1, 0);
    expect(first).not.toEqual(second);

    const glyphs = (blocks: readonly unknown[]): unknown[] => {
      const table = blocks[0] as { rows: { cells: { value: { glyph?: string } } }[] };
      return table.rows.map((r) => r.cells.value.glyph);
    };
    expect(glyphs(first)).toEqual(["bullet", undefined]);
    expect(glyphs(second)).toEqual([undefined, "bullet"]);
  });

  it("T3.19 (I18): a candidate with a detail renders its label and its hint, at every width", () => {
    // **Asserted on the rendered rows rather than on the block**, because the
    // block was correct throughout. C11 hands residual width only to columns
    // declaring `flex: true` (plan.ts step 8), the menu's table declared
    // neither, and so every cell sat at `minWidth` and rendered `…` at any
    // terminal width. Every statement on either side of that was true.
    const registry = createBlockRegistry({ defaults: true });
    registry.register(tableDefinition as unknown as BlockDefinition);

    const detailed = [
      { value: "/promote", detail: "Promote a build" },
      { value: "/ps", detail: "List processes" },
    ];
    const plain = [{ value: "/serving" }];

    const rowsAt = (candidates: readonly Candidate[], width: number): readonly string[] =>
      renderSequenceToLines(registry, menuBlocks(candidates, 0, 0), width, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
        // eslint-disable-next-line no-control-regex
      }).map((l) => l.replace(/\u001b\[[0-9;]*m/g, ""));

    for (const width of [menuWidth(detailed), 60, 100]) {
      const rows = rowsAt(detailed, width);
      expect(rows, `${String(width)}: one row per candidate`).toHaveLength(2);
      for (const [i, candidate] of detailed.entries()) {
        expect(rows[i], `${String(width)}: ${candidate.value} is legible`).toContain(
          candidate.value,
        );
        expect(rows[i], `${String(width)}: and so is its hint`).toContain(candidate.detail);
      }
    }

    // **The selected row keeps its whole label.** The glyph is on whichever row
    // is selected, so a floor derived from labels alone truncates exactly one
    // row — a flicker rather than a width defect, and the half that would have
    // been reported next.
    expect(rowsAt(detailed, menuWidth(detailed))[0], "the glyph costs the column, not the label")
      .toContain("/promote");

    // **The control, and it is why this survived four components.** A candidate
    // with no `detail` takes the pills path, which never had the defect — so a
    // row asserting only that the menu appears passed against it.
    expect(rowsAt(plain, menuWidth(plain))[0], "the pills path drew correctly all along")
      .toContain("/serving");
  });

  it("menuWidth measures display cells, not code units", () => {
    // An emoji is two columns and one grapheme. `.length` says two as well, by
    // coincidence of surrogate pairs — a CJK character is where they part.
    const wide = menuWidth([{ value: "世界" }]);
    const narrow = menuWidth([{ value: "ab" }]);
    expect(wide).toBeGreaterThan(narrow);
  });

  it("no candidates means no menu is built at all", () => {
    // C15 omits a zero-row layer and dismisses nothing (C15 I15), so the moment
    // the set empties is C19's to act on.
    const blocks = menuBlocks([], 0, 0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "pills", chips: [] });
  });
});

describe("C19 §4 — completion never blocks input (I2)", () => {
  it("T2.2: a hundred keystrokes are served while a source never resolves", () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const d = deferredSource({ id: "never" });
    engine.register(d.source);
    engine.register(flagValueSource());

    void engine.request(at(FLAG_SLOT), 1);

    const spy = vi.fn();
    for (let i = 0; i < 100; i += 1) {
      // Synchronous by construction: `ghost` consults static sources only, so
      // there is nothing here that *could* await the hung request.
      spy(engine.ghost(at("/ps --status=r‸")));
    }
    expect(spy).toHaveBeenCalledTimes(100);
    expect(engine.inFlight).toBe(1);
  });
});
