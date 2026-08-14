// C19 tier 4 — integration. The anti-drift test with C05, the menu through a
// real C15, and the shared tokeniser with C18.
import { describe, expect, it } from "vitest";

import {
  contextAt,
  createEngine,
  flagNameSource,
  flagValueSource,
  menuBlocks,
  menuLayer,
  menuRowsShown,
  menuWindow,
  MENU_ID,
  remainderOf,
  verbSource,
} from "../../src/interaction/completion/index.js";
import { parseManifest } from "../../src/data/manifest/index.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { tokenise } from "../../src/interaction/parser/index.js";
import { raw } from "../support/manifest.js";
import { at, fakeClock } from "../support/completion.js";
import { registry } from "../support/overlay.js";
import { measurable, visible } from "../support/render.js";

describe("C19 + C05 — the anti-drift test (I4)", () => {
  it("T4.1: a flag and an enum value added to the manifest complete, with no TypeScript change", async () => {
    // The whole claim of C05, exercised rather than asserted: this test adds
    // data and changes no code, and if completion held a literal list it would
    // pass while a user saw nothing.
    const source = raw();
    const tools = source["tools"] as Record<string, unknown>[];
    const ps = tools.find((t) => t["name"] === "ps");
    if (ps === undefined) throw new Error("the fixture no longer has a `ps`");

    (ps["flags"] as Record<string, unknown>[]).push({
      name: "region",
      type: "enum",
      values: ["euw", "use"],
      summary: "which region",
    });

    const parsed = parseManifest(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("unreachable");
    const manifest = parsed.value;

    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    engine.register(flagNameSource());
    engine.register(flagValueSource());

    const names = await engine.request(contextAt("/ps --reg", 9, manifest), 1);
    expect(names.candidates.map((c) => c.value)).toEqual(["--region"]);
    // A value-taking flag ends `=`, so the next press is already in the value
    // slot (I16).
    expect(names.candidates[0]?.delimiter).toBe("=");

    const line = "/ps --region=e";
    const values = await engine.request(contextAt(line, line.length, manifest), 2);
    expect(values.candidates.map((c) => c.value)).toEqual(["euw"]);
  });

  it("the fixture responds to the thing under test", () => {
    // `test/support/README.md`'s rule: show the fixture reacts before asserting
    // against it. Without this, T4.1 above passes identically against a
    // manifest whose flags were never read.
    const before = raw();
    const tools = before["tools"] as Record<string, unknown>[];
    const ps = tools.find((t) => t["name"] === "ps");
    const count = (ps?.["flags"] as unknown[]).length;
    expect(count).toBeGreaterThan(0);
    expect(raw()).not.toBe(before); // a fresh object each call, so one test cannot leak into the next
  });
});

describe("C19 + C18 — one tokeniser (I5)", () => {
  it("T4.3: completion and execution agree about token boundaries", () => {
    const corpus = [
      "/ps --status=run",
      "ls | gre",
      "/deploy 'my app' --for",
      '/deploy "quoted arg" x',
      "echo a && /ps",
    ];
    for (const line of corpus) {
      const ctx = contextAt(line, line.length, null);
      const direct = tokenise(line);
      expect(direct.ok).toBe(true);
      if (!direct.ok) continue;
      // Identity of boundaries, not merely of text: `replace.start` is derived
      // from a span, and a second tokeniser would disagree exactly here.
      expect(ctx.tokens.map((t) => [t.start, t.end])).toEqual(
        direct.value.map((t) => [t.start, t.end]),
      );
    }
  });
});

describe("C19 + C15 — the menu is an overlay (I8)", () => {
  const candidates = [
    { value: "running", detail: "3 up" },
    { value: "failed", detail: "1 down" },
    { value: "queued", detail: "0" },
  ];

  it("T4.4: it flips above the prompt when there is no room below", () => {
    const manager = createOverlayManager({ registry });
    // A two-row prompt at the bottom of a twenty-row region: the anchor is a
    // span, because neither of its rows places a menu correctly on its own
    // (C15 I17).
    manager.push(menuLayer(candidates, 0, 0, { row: 18, rows: 2 }));
    const placed = manager.layout({ width: 80, height: 20 });
    expect(placed).toHaveLength(1);
    const menu = placed[0];
    if (menu === undefined) throw new Error("unreachable");

    // Above, and never over the anchor's own rows.
    expect(menu.top + menu.height).toBeLessThanOrEqual(18);
    expect(menu.top).toBeGreaterThanOrEqual(0);
  });

  it("T4.7b: narrowing is `update`, not a pop and a push", () => {
    const manager = createOverlayManager({ registry });
    const changes: string[] = [];
    manager.subscribe((c) => changes.push(c.kind));

    manager.push(menuLayer(candidates, 0, 0, { row: 10, rows: 1 }));
    for (const narrowed of [candidates.slice(0, 2), candidates.slice(0, 1)]) {
      manager.update(MENU_ID, { content: menuLayer(narrowed, 0, 0, { row: 10, rows: 1 }).content });
    }
    manager.pop();

    // One push, N content, one pop. A pop-and-push per character churns focus
    // inside the thing being typed into, because C16 derives focus on every
    // dispatch.
    expect(changes).toEqual(["push", "content", "content", "pop"]);
  });

  it("T4.5: C19 renders the `N more` indicator from `Placed.truncated`", () => {
    const manager = createOverlayManager({ registry });
    // **Sixty entries in a ten-row region**, and the *height* is what truncates.
    // This used to pass with a shorter region because the menu declared a narrow
    // width and the pills wrapped into far more rows than they needed; now it
    // spans the region (C19 §"the menu spans the region"), so the same set fits
    // in fewer rows and the fixture has to be honest about which axis it is
    // testing. Truncation is vertical, and it always was.
    const many = Array.from({ length: 60 }, (_, i) => ({ value: `entry-${String(i)}` }));
    manager.push(menuLayer(many, 0, 0, { row: 2, rows: 1 }));
    const placed = manager.layout({ width: 80, height: 10 });
    const menu = placed[0];
    if (menu === undefined) throw new Error("unreachable");

    // C15 reports *that* it truncated; it holds no candidates and cannot say
    // how many were lost. That half is C19's.
    expect(menu.truncated).toBe(true);
    expect(remainderOf(menu, many.length, 10)).toBe(50);
  });

  it("T4.9 (I23): the indicator and the bottom edge are inside the drawn box", () => {
    // **The row T4.5 reads as covering and does not.** T4.5 asserts the count
    // and hands `menuRowsShown` its answer by hand; it never asks where the
    // indicator lands. Read from a frame, it landed in the cut: `composite.ts`
    // writes `lines[0 … height)`, so everything the menu puts last is what it
    // loses — the `+ N more` row and the bottom edge both, on every occasion
    // the indicator fired. A mechanism observable exactly never, which is
    // A03 §2's vacuity class arriving in shipped code.
    const r = measurable();
    const manager = createOverlayManager({
      registry: { measureSequence: (b, w) => r.registry.measureSequence(b, w) },
    });
    const many = Array.from({ length: 60 }, (_, i) => ({ value: `entry-${String(i)}` }));
    manager.push(menuLayer(many, 0, 0, { row: 2, rows: 1 }));

    const region = { width: 80, height: 10 };
    const first = manager.layout(region)[0];
    if (first === undefined) throw new Error("unreachable");
    const fits = menuRowsShown(first);
    const remainder = remainderOf(first, many.length, fits);
    const w = menuWindow(many.length, 0, fits);
    manager.update(MENU_ID, {
      content: menuBlocks(many.slice(w.start, w.start + w.shown), 0, remainder),
    });

    const placed = manager.layout(region)[0];
    if (placed === undefined) throw new Error("unreachable");
    const lines = placed.layer.content.flatMap((b) => r.renderToLines(b, placed.width));
    const drawn = lines.slice(0, placed.height).map(visible);

    expect(drawn.some((l) => l.includes(`+ ${String(remainder)} more`)), "the indicator is drawn").toBe(
      true,
    );
    expect(lines.length, "and nothing is cut at all now").toBeLessThanOrEqual(placed.height);
    expect(drawn[drawn.length - 1]?.trim().length, "the bottom edge is a rule").toBeGreaterThan(0);
  });

  it("T4.10 (I23, I20): the selection stays inside the window as it moves", () => {
    // **The third consequence of handing over every candidate**, and the one a
    // reader would report as *the menu is frozen*: with the list longer than
    // the box, arrowing past the last visible row moved the marker into a cut
    // row. Every assertion about `selected` agreed — the index was moving.
    const fits = 4;
    const far = menuWindow(60, 20, fits);
    expect(far.shown).toBe(fits);
    expect(20).toBeGreaterThanOrEqual(far.start);
    expect(20).toBeLessThan(far.start + far.shown);

    // Both ends, because a window that only ever chases downwards passes the
    // first case and pins the last: at the top it must not start below zero,
    // and at the bottom it must not run past the list.
    expect(menuWindow(60, 0, fits)).toEqual({ start: 0, shown: fits });
    // The last candidate, which is where a clamp against `total - fits` would
    // have mattered if it could: `at` is at most `total − 1`, so the two
    // expressions coincide there and the clamp was dead. It is gone.
    expect(menuWindow(60, 59, fits)).toEqual({ start: 56, shown: fits });
    expect(menuWindow(3, 2, fits), "a list that fits is not windowed").toEqual({ start: 0, shown: 3 });
  });

  it("the menu declares no width, so C15 gives it the whole region", () => {
    // **The reversal.** This asserted the opposite — that C19 declares a width
    // wide enough for the longest candidate — and the ruling was right about
    // the mechanism and wrong about the surface: a menu narrower than the
    // region leaves whatever is behind it visible on the same rows, and a
    // reader sees two unrelated things on one line.
    //
    // `Layer.width` keeps its purpose. A confirm is a dialogue and wants to be
    // forty cells and centred; a completion menu is an extension of the prompt,
    // and the prompt spans the frame.
    const layer = menuLayer(candidates, 0, 0, { row: 2, rows: 1 });
    expect(layer.width, "declaring one is what made it narrow").toBeUndefined();

    // And C15 I16 resolves the absence to the region's width.
    const manager = createOverlayManager({ registry });
    manager.push(layer);
    expect(manager.layout({ width: 96, height: 20 })[0]?.width).toBe(96);
  });
});

describe("C19 + C05 — a manifest that is not loaded yet", () => {
  it("offers nothing rather than throwing", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    engine.register(verbSource(() => null));
    const result = await engine.request(at("/p‸", null), 1);
    expect(result.candidates).toEqual([]);
  });
});
