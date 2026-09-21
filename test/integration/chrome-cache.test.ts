// C22 I102 — the header, the footer and each overlay layer are rendered once
// per content, never once per frame, and the footer is measured with them.
//
// **Counted, never timed**, as `render-cache.test.ts` counts: the chrome is a
// registered kind the row supplies through `config.chrome`, so the count is
// taken inside the production paint path and not from a spy round it.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { rows as inkRows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { ProfileReport } from "../../src/index.js";

/** A kind that draws its `label` on `rows` rows, counting renders and measures per id. */
function counting(): {
  definition: BlockDefinition;
  renders: (id: string) => number;
  measures: (id: string) => number;
} {
  const r = new Map<string, number>();
  const m = new Map<string, number>();
  const of = (b: Block): { label: string; rows: number } => b as unknown as { label: string; rows: number };
  return {
    renders: (id) => r.get(id) ?? 0,
    measures: (id) => m.get(id) ?? 0,
    definition: {
      kind: "chip",
      measure: (b) => {
        m.set(b.id, (m.get(b.id) ?? 0) + 1);
        return of(b).rows;
      },
      render: (b) => {
        r.set(b.id, (r.get(b.id) ?? 0) + 1);
        return inkRows(Array.from({ length: of(b).rows }, (_, i) => `${of(b).label} ${b.id} r${String(i)}`));
      },
    },
  };
}

const chip = (id: string, label: string, rows = 1): Block => ({ kind: "chip", id, label, rows }) as unknown as Block;

async function session(definition: BlockDefinition, chrome: Readonly<{ header: () => readonly Block[]; footer: () => readonly Block[] }>) {
  const stdin = fakeStdin();
  let seen: ProfileReport | null = null;
  const built = await buildSession(
    {
      stdin: stdin as never,
      blocks: [definition],
      chrome,
      // A manifest, as render-cache's helper carries: without one the prompt
      // routes nothing, and `/theme light` never reaches the theme.
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "rows", local: true, summary: "rows", args: [], flags: [] }],
      },
      localHandlers: { rows: () => ({ schema: "tui.view/1", status: "ok", blocks: [] }) },
      profile: { tier: "counters", onReport: (r: ProfileReport) => void (seen = r) },
    } as never,
    { columns: 80, rows: 20 },
  );
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await Promise.resolve();
    await Promise.resolve();
  };
  const report = async (): Promise<ProfileReport> => {
    await built.tui.stop("exit");
    if (seen === null) throw new Error("no report arrived");
    return seen;
  };
  return { ...built, type, report };
}

describe("C22 I102 — the chrome cache", () => {
  it("T4.90a (C22 I102): a chrome function returning structurally equal blocks every frame renders once across ten further frames and measures once, the rest chrome hits", async () => {
    const { definition, renders, measures } = counting();
    const s = await session(definition, {
      header: () => [chip("h", "head")],
      footer: () => [chip("f", "foot", 2)],
    });
    // The fixture responds: both are on screen, drawn by this kind.
    expect(s.screen().text.some((r) => r.includes("head h r0")), "the header drew").toBe(true);
    expect(s.screen().text.some((r) => r.includes("foot f r1")), "the footer drew, two rows").toBe(true);
    const drawn = { h: renders("h"), f: renders("f"), fm: measures("f") };
    expect(drawn.h, "the header rendered").toBeGreaterThan(0);
    expect(drawn.f, "the footer rendered").toBeGreaterThan(0);

    for (const key of "abcdefghij") await s.type(key);
    expect(s.screen().text.some((r) => r.includes("abcdefghij")), "ten frames drew the prompt").toBe(true);
    expect(renders("h"), "no further header render").toBe(drawn.h);
    expect(renders("f"), "no further footer render").toBe(drawn.f);
    expect(measures("f"), "no further footer measure").toBe(drawn.fm);

    const report = await s.report();
    expect(report.hits["chrome"] ?? 0, "the rest were chrome hits").toBeGreaterThanOrEqual(20);
  });

  it("T4.90b (C22 I102): a changed chip label renders once more as a rev miss, a resize as a width miss, a theme switch as a theme miss, and the footer's height moves with its content", async () => {
    const { definition, renders } = counting();
    let label = "one";
    let footRows = 1;
    const s = await session(definition, {
      header: () => [chip("h", label)],
      footer: () => [chip("f", "foot", footRows)],
    });
    expect(s.screen().text.some((r) => r.includes("one h r0"))).toBe(true);
    let h = renders("h");
    let f = renders("f");

    // rev — the content changed and nothing else did.
    label = "two";
    await s.type("x");
    expect(s.screen().text.some((r) => r.includes("two h r0")), "the new label is on screen").toBe(true);
    expect(renders("h"), "one more header render").toBe(h + 1);
    expect(renders("f"), "and no footer render: its content did not change").toBe(f);
    h = renders("h");

    // width — a resize.
    s.resize({ columns: 100, rows: 20 });
    await s.type("y");
    expect(renders("h"), "the header rendered at the new width").toBe(h + 1);
    expect(renders("f"), "and the footer").toBe(f + 1);
    h = renders("h");
    f = renders("f");

    // theme — the `x` and `y` above are still in the prompt, and `xy/theme
    // light` is an entry, not a command; two backspaces first. The switch lands
    // two turns after the command, as T4.17d waits.
    await s.type("\u007f\u007f");
    expect(s.screen().text.some((r) => r.includes("❯ x") || r.includes("❯ y")), "the prompt is clear").toBe(false);
    await s.type("/theme light\r");
    await Promise.resolve();
    await Promise.resolve();
    expect(renders("h"), "the header rendered under the new theme").toBe(h + 1);
    expect(renders("f"), "and the footer").toBe(f + 1);
    f = renders("f");

    // The footer's height follows its content on the frame the content changes.
    const footRowsOnScreen = (): number => s.screen().text.filter((r) => r.includes("foot f r")).length;
    expect(footRowsOnScreen(), "one footer row").toBe(1);
    footRows = 3;
    await s.type("z");
    expect(footRowsOnScreen(), "three footer rows, on the frame the content changed").toBe(3);
    expect(renders("f"), "one render for it").toBe(f + 1);

    const report = await s.report();
    const misses = report.misses["chrome"] ?? {};
    expect(misses.rev ?? 0, "a rev miss").toBeGreaterThanOrEqual(2);
    expect(misses.width ?? 0, "width misses, header and footer").toBeGreaterThanOrEqual(2);
    expect(misses.theme ?? 0, "theme misses, header and footer").toBeGreaterThanOrEqual(2);
  });

  it("T4.90c (C22 I102): a pushed surface's layer renders once across frames that leave its content alone, once more when it re-renders, and a second surface is keyed apart", async () => {
    const { definition, renders } = counting();
    const s = await session(definition, { header: () => [], footer: () => [] });
    let label = "view";
    const handle = s.tui.openSurface({
      schema: "calcium.pushed-surface/1",
      id: "s1",
      keymap: [],
      render: () => [chip("v", label, 2)],
      onAction: () => undefined,
    });
    await s.type("");
    expect(s.screen().text.some((r) => r.includes("view v r0")), "the layer is on screen").toBe(true);
    const drawn = renders("v");
    expect(drawn).toBeGreaterThan(0);

    for (const key of "abcde") await s.type(key);
    expect(renders("v"), "five frames, no further layer render").toBe(drawn);

    label = "again";
    handle.invalidate();
    await s.type("");
    expect(s.screen().text.some((r) => r.includes("again v r0")), "the re-rendered layer is on screen").toBe(true);
    expect(renders("v"), "one more render for the new content").toBe(drawn + 1);

    await handle.close();
    const second = s.tui.openSurface({
      schema: "calcium.pushed-surface/1",
      id: "s2",
      keymap: [],
      render: () => [chip("w", "other", 1)],
      onAction: () => undefined,
    });
    await s.type("");
    expect(s.screen().text.some((r) => r.includes("other w r0")), "the second surface drew its own").toBe(true);
    expect(renders("w"), "keyed apart from the first").toBe(1);
    await second.close();
    await s.report();
  });
});
