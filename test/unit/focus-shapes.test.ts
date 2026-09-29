// C09 I105 and I106 — §018's focus shapes: a choice, and a continuous control.
//
// **Both are classification tables, not traces.** The cells differ by which of
// two channels moved, and nothing happens between them a sequence could key on:
// a build that reads the wash off `chosen` is at rest in every frame, and a
// build that tones the value with focus never changes state at all.
import { describe, expect, it } from "vitest";

import { measurable, FULL_CAPS, ASCII_CAPS, DARK_THEME, MONO_CAPS, MONO_UNICODE_CAPS } from "../support/render.js";
import { styledScreenFrom } from "../support/styled-screen.js";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { FocusState } from "../../src/presentation/blocks/index.js";

const ESC = String.fromCharCode(27);
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");

type Caps = typeof FULL_CAPS;

const drawn = (b: Block, focus: FocusState | null, caps: Caps = FULL_CAPS): string =>
  measurable({ theme: DARK_THEME, capabilities: caps, ...(focus === null ? {} : { focus }) })
    .renderToLines(b as never, 52)[0] ?? "";

const plain = (line: string): string => line.replace(SGR, "");

/** One drawn row as styled cells — the channels read per cell, not per byte. */
const grid = (line: string) => styledScreenFrom([line], { columns: 52, rows: 1 })[0]!;

/** The SGR runs a line carries, in order — the channels, read off the frame. */
const codes = (line: string): readonly string[] => [...line.matchAll(SGR)].map((m) => m[0].slice(2));

/** §018's radio group. **The chosen option is not element zero** — see below. */
const radio = (): Block =>
  block({
    kind: "choice",
    id: "c",
    label: "scale",
    exclusive: true,
    options: [
      { id: "lin", label: "linear" },
      { id: "log", label: "log", chosen: true },
      { id: "l2", label: "log2" },
    ],
  }) as unknown as Block;

const slider = (): Block =>
  block({ kind: "control", id: "s", label: "learning rate", at: 0.42, value: "3e-4" }) as unknown as Block;

const at = (id: string | null, inside = false): FocusState =>
  ({ blockId: id === null ? "s" : "c", rowId: id, ...(inside ? { inside: true } : {}) }) as FocusState;

describe("C09 I105 — a choice is one shape, and its two channels never substitute", () => {
  it("T1.72 (C09 I105, §018, `R-FOC-003`): the mark carries chosen, the wash carries focus, and the label is part of the shape", () => {
    const rest = drawn(radio(), null);
    const onChosen = drawn(radio(), at("log"));
    const onUnchosen = drawn(radio(), at("lin"));

    // **The mark is a function of `chosen` and of nothing else.** The three
    // marks are byte-identical across all three frames: focus moved twice and
    // no mark followed it.
    for (const line of [rest, onChosen, onUnchosen]) {
      expect(plain(line), "the marks never move").toContain("● log");
      expect(plain(line)).toContain("○ linear");
      expect(plain(line)).toContain("○ log2");
    }

    // **The wash is a function of focus and of nothing else — and this is the
    // cell §018 wrote the sentence for.** *So you can be on an option you have
    // not chosen, which is the whole point of a radio group.* A build drawing
    // the ground from `chosen` is correct at rest, correct on the chosen
    // option, and wrong only here.
    const ground = (line: string): readonly string[] => codes(line).filter((c) => c.startsWith("48;"));
    expect(ground(rest), "nothing is washed at rest").toHaveLength(0);
    expect(ground(onUnchosen), "the UNCHOSEN option focused still takes a ground").toHaveLength(1);
    expect(ground(onChosen), "and so does the chosen one").toHaveLength(1);
    expect(ground(onUnchosen)).toEqual(ground(onChosen));

    // **One span over the mark AND the label** — *the label is part of it*. The
    // ground opens before the mark and closes after the last character of the
    // label, which a wash over either half satisfies nothing of.
    const opened = onUnchosen.indexOf(`${ESC}[48;`);
    const closed = onUnchosen.indexOf(`${ESC}[49m`);
    const inside = plain(onUnchosen.slice(opened, closed));
    expect(inside.trim(), "the washed run is the mark and the label").toBe("○ linear");

    // **The control is the ASCII rung, where the wash is gone and the mark is
    // not** — which is why the pair is this way round and not the other.
    const ascii = plain(drawn(radio(), at("lin"), ASCII_CAPS));
    expect(ascii, "chosen survives on its glyph").toContain("* log");
    // `@`, the registry's `choice-open` ASCII half (C09 I123) — `o` was `queued`'s.
    expect(ascii).toContain("@ linear");
  });
});

describe("C09 I106 — a continuous control has three states and the value is none of them", () => {
  it("T1.73 (C09 I106, §018, `R-FOC-002`): the wash reaches all three parts, inside is weight and a handle, the value never moves", () => {
    const rest = drawn(slider(), null);
    const focused = drawn(slider(), at(null));
    const inside = drawn(slider(), at(null, true));

    // **The wash covers label, track and value as ONE control.** The ground
    // opens before the label and closes after the value — a ground on the track
    // alone passes every assertion that only asks whether focus changed
    // something.
    for (const [name, line] of [["focused", focused], ["inside", inside]] as const) {
      const opened = line.indexOf(`${ESC}[48;`);
      const closed = line.lastIndexOf(`${ESC}[49m`);
      const washed = plain(line.slice(opened, closed));
      expect(washed.startsWith("learning rate"), `${name} washes from the label`).toBe(true);
      expect(washed.endsWith("3e-4"), `${name} washes to the value`).toBe(true);
    }
    expect(rest).not.toContain(`${ESC}[48;`);

    // **Inside is weight plus a painted handle** — two substitutions, and the
    // track is the same number of cells in all three, because *measure already
    // committed to one* and the width axis has the same argument case 4 makes
    // about height.
    expect(plain(rest)).toContain("├");
    expect(plain(focused)).toContain("─");
    expect(plain(inside)).toContain("━");
    expect(plain(inside)).toContain("◉");
    expect(plain(focused)).toContain("●");
    for (const line of [rest, focused, inside]) {
      expect(plain(line).length, "the row is the same length in all three states").toBe(plain(rest).length);
    }

    // **The value's ink is byte-identical across all three.** *The VALUE is
    // INFO and it never changes.* This is the assertion a build that tones the
    // value with focus fails and every other one above passes — it is data, and
    // the control is what has states.
    const ink = (line: string): string | undefined => codes(line).filter((c) => c.startsWith("38;")).at(-1);
    expect(ink(focused), "focus does not tone the reading").toBe(ink(rest));
    expect(ink(inside), "nor does entering it").toBe(ink(rest));

    // **The carrier declaration, read off the frame.** At ASCII the handle's
    // two arms are one character and the track's are two — so the weight is
    // what carries `inside` at that rung, which is why §018 names it first.
    const aRest = plain(drawn(slider(), at(null), ASCII_CAPS));
    const aIn = plain(drawn(slider(), at(null, true), ASCII_CAPS));
    expect(aRest).toContain("-");
    expect(aIn).toContain("=");
    expect(aRest.replace(/[-=]/gu, ""), "the handle is the same character at ascii").toBe(
      aIn.replace(/[-=]/gu, ""),
    );
  });
});

describe("C09 I132 — a chosen option carries its mark and its weight", () => {
  // **A classification table, 2 forms × 3 focus states × 5 rungs.** The cell
  // the ruling is about is 1-bit: there the wash is `inverse`, so before I132
  // a resting chosen option and a resting unchosen one differed by the mark
  // alone — one carrier for a fact R-COR-003 wants two for.
  const RUNGS = {
    "24-bit": FULL_CAPS,
    "8-bit": { ...FULL_CAPS, colourDepth: 8 },
    "4-bit": { ...FULL_CAPS, colourDepth: 4 },
    "1-bit": MONO_UNICODE_CAPS,
    "1-bit ascii": MONO_CAPS,
  } as const satisfies Record<string, Caps>;

  const checkbox = (): Block =>
    block({
      kind: "choice",
      id: "c",
      label: "tests",
      options: [
        { id: "lin", label: "lint" },
        { id: "log", label: "type-check", chosen: true },
      ],
    }) as unknown as Block;

  it("T1.90 (C09 I132, I105, I121, ruling 54): every chosen option's mark and label are bold at every rung, focused or not, and nothing else is; measure, width and elements do not move", () => {
    for (const [rung, caps] of Object.entries(RUNGS)) {
      for (const [form, make] of [["radio", radio], ["checkbox", checkbox]] as const) {
        const b = make();
        const options = (b as unknown as { options: readonly { id: string; label: string; chosen?: boolean }[] }).options;
        const cellsOf = new Map<string | null, ReturnType<typeof grid>>();
        for (const focus of [null, "lin", "log"] as const) {
          cellsOf.set(focus, grid(drawn(b, focus === null ? null : at(focus), caps)));
        }
        for (const [focus, row] of cellsOf) {
          const where = `${form} at ${rung}, focus ${String(focus)}`;
          const text = row.map((c) => c.ch).join("");
          // **Every cell of a chosen option is bold, and no other cell is** —
          // the mark and the label together, I105's one span.
          const expected = new Set<number>();
          for (const option of options) {
            if (option.chosen !== true) continue;
            const from = text.indexOf(` ${option.label}`) - 1;
            expect(from, `${where}: ${option.label} is drawn`).toBeGreaterThanOrEqual(0);
            for (let c = from; c < from + 2 + option.label.length; c += 1) expected.add(c);
          }
          const bold = new Set(row.flatMap((c, i) => (c.style.attrs.includes(1) ? [i] : [])));
          expect([...bold].sort((x, y) => x - y), `${where}: the bold cells`).toEqual([...expected].sort((x, y) => x - y));
          // F1258's channel: bold never shares a cell with dim.
          expect(row.filter((c) => c.style.attrs.includes(1) && c.style.attrs.includes(2)), `${where}: bold and dim`).toEqual([]);
        }
        if (rung.startsWith("1-bit") && form === "radio") {
          // **The four cells, pairwise distinct on a surviving carrier.** Read
          // at the two options: `lin` unchosen, `log` chosen.
          const cell = (focus: string | null, id: "lin" | "log"): string => {
            const row = cellsOf.get(focus)!;
            const text = row.map((c) => c.ch).join("");
            const label = id === "lin" ? " linear" : " log ";
            const i = text.indexOf(label) - 1;
            return `${row[i]!.ch}|${row[i]!.style.attrs.join(",")}`;
          };
          const four = [cell(null, "lin"), cell(null, "log"), cell("lin", "lin"), cell("log", "log")];
          expect(new Set(four).size, `${rung}: rest/focused × unchosen/chosen are four cells`).toBe(4);
          expect(cell("log", "log"), `${rung}: focused chosen carries the mark, bold and inverse`).toMatch(/^[●*]\|1,7$/u);
          expect(cell(null, "log"), `${rung}: resting chosen is mark and bold`).toMatch(/^[●*]\|1$/u);
        }
      }
    }

    // **Nothing geometric moves**: chosen and unchosen measure, size and
    // publish the same, because weight adds no cell.
    const kit = measurable({ theme: DARK_THEME, capabilities: FULL_CAPS });
    const none = block({ kind: "choice", id: "c", label: "tests", options: [{ id: "lin", label: "lint" }, { id: "log", label: "type-check" }] }) as unknown as Block;
    for (const width of [8, 20, 52]) {
      expect(kit.registry.measure(checkbox(), width)).toBe(kit.registry.measure(none, width));
      expect(kit.registry.width(checkbox(), width)).toBe(kit.registry.width(none, width));
      expect(kit.registry.elementsOf(checkbox(), width).map((e) => [e.id, e.cols])).toEqual(
        kit.registry.elementsOf(none, width).map((e) => [e.id, e.cols]),
      );
    }
  });
});
