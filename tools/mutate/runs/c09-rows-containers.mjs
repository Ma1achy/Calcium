// C09 I73 — a container answers rows composed as Ink's grid would have written
// them. Mutated.
//
// **The reference is the element arm the containers still carry**, reached in
// T2.144 by lifting every leaf into an element (`test/support/lifted.ts`), and
// the goldens hold every frame a panel or a group ever drew. Each mutation is a
// seam of the composition — the pad, the gutter, the normalisation on either
// side of the pad, the alignment, the rails, the empty body, the scroll's
// pads, the table's inset, the fallback — and T2.144's corpus carries a child
// for each: a row ending in an open style, a row filling its cell, a short
// child, an over-tall body, an empty panel, a padded scroll, an expanded row.
//
// **The empty panel's body row is not mutated here**, because it is
// over-determined: Ink gives an empty `Text` a row of its own, the rail floor
// of one gives a rail, and the arm's split of an empty rail string is one
// line — so no single statement carries it, and the two tried (the arm's own
// push, then the rail floor) both survived. T6.120 records it.
//
// **The control pads by one space regardless of where the row ended**: every
// row group and every panel body moves, in T2.144 and in the goldens.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/rows.test.ts test/unit/blocks-measure-once.test.ts test/contract/rows-arm.test.ts test/edge/rows.test.ts test/golden";
const R = "src/presentation/rows.ts";
const C = "src/presentation/blocks/kinds/containers.ts";
const T = "src/presentation/table/definition.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: R,
    from: "    if (at > cursor) out += \" \".repeat(at - cursor);\n",
    to: "    if (at > cursor) out += \" \";\n",
    why: "every pad is one space; every row group and panel body moves in T2.144 and in the goldens",
  },
  mutations: [
    {
      // **The pad from the piece's own column** rather than from where its row
      // ended: the next cell lands early by the row's width.
      name: "PAD-FROM-CELL: the cursor advances to the piece's column, not past its row",
      file: R,
      from: "    cursor = at + rowCells(kept);\n",
      to: "    cursor = at;\n",
      expect: "T2.144",
    },
    {
      name: "GUTTER-DROPPED: the cells are laid without the gutter",
      file: C,
      from: "        x += (widths[index] ?? 1) + ROW_GUTTER;\n",
      to: "        x += widths[index] ?? 1;\n",
      expect: "T2.144",
    },
    {
      // **A child's row not normalised before the pad**: an open red runs into
      // the pad and the next cell — the `dangling` child.
      name: "CHILD-UNNORMALISED: the piece is placed as written, its open style leaking",
      file: R,
      from: "    const row = normaliseRow(piece.row);\n    if (row === \"\") continue;\n",
      to: "    const row = piece.row;\n    if (row === \"\") continue;\n",
      expect: "T2.144",
    },
    {
      // **The composed line not normalised again**: two adjacent cells in one
      // style keep a close and an open at the seam — the `solid` pair.
      name: "LINE-UNNORMALISED: the composed line is returned as concatenated",
      file: R,
      from: "  return normaliseRow(out);\n}\n\n/** A block of rows written",
      to: "  return out;\n}\n\n/** A block of rows written",
      expect: "T2.144",
    },
    {
      name: "ALIGN-DROPPED: the placement's left offset is not applied",
      file: C,
      from: "        const left = x + at.left;",
      to: "        const left = x;",
      also: [{
        file: C,
        from: "          const pad = at.left > 0 ? \" \".repeat(at.left) : \"\";\n",
        to: "          const pad = \"\";\n",
      }],
      expect: "T2.144",
    },
    {
      // **The rails drawn to the body's height**: a body taller than measured
      // gets rail cells Ink never drew — T3.89's over-tall panel.
      name: "RAILS-TO-BODY: every body row gets a rail, however tall the body",
      file: C,
      from: "        const railRow = rail[y] ?? \"\";\n",
      to: "        const railRow = rail[0] ?? \"\";\n",
      expect: "T3.89",
    },
    {
      name: "SCROLL-PADS-DROPPED: a scroll shorter than its box is not padded",
      file: C,
      from: "      for (let i = 0; i < padCount; i += 1) lines.push(\"\"); // cells-ok — a row count\n",
      to: "\n",
      expect: "T2.144",
    },
    {
      name: "DETAIL-INSET-DROPPED: an expanded row's detail is not padded left",
      file: T,
      from: "          parts.push(line === \"\" ? \"\" : fitRow(pad + line, width));\n",
      to: "          parts.push(line === \"\" ? \"\" : fitRow(line, width));\n",
      expect: "T2.144",
    },
    {
      // **The clamp dropped**: a cell keeps its full allocation, so a child
      // wider than the group writes past the group's edge.
      //
      // **Two further mutations were written here and both survived, and the
      // survivor indicted them rather than the row**: a guard for a cell
      // starting past the width, and the height taken from the uncut rows.
      // `placeable` keeps a child only while `used + needed <= w`, so every
      // placed child after the first ends inside the width and the only cell
      // that can overrun is the first — the one its floor of one keeps. There
      // was no second cell to guard, so the guard and its mutation are gone.
      name: "CLAMP-DROPPED: a row group's cell is not clamped to what is left of the width",
      file: C,
      from: "        const room = Math.min(at.width, width - left);",
      to: "        const room = at.width;",
      expect: "T3.89",
    },
    {
      // **The child rendered twice**: once into `drawable` and again where its
      // rows are read, which is what the first form of this arm did — it drew
      // for the rows attempt and drew again for the element fallback.
      // **Neither the captures nor the goldens can see it** — a second render
      // produces the same bytes — so T1.33's count is the only instrument, and
      // it is the reason a byte-for-byte oracle is not sufficient on its own.
      // Re-anchored 2026-09-17 (F1209): there is one arm, and the site that can
      // still render twice is the map that reads what was drawn.
      name: "MOSAIC-RERENDER: the mosaic renders each child a second time",
      file: C,
      from: "    const childRows = drawable.map(({ drawn }) => drawn);",
      to: "    const childRows = drawable.map(({ child, rect }) => ctx.renderChild(child, rect.width));",
      expect: "T1.33",
    },
    {
      // **The cut removed.** A mosaic cell's rows reach past their region, and
      // cell `a`'s overflow collides with cell `c` — so `composeRow` declines
      // and the mosaic falls back to the element arm, where Ink draws the
      // right frame. **The bytes do not move; the arm does**, which is why
      // T2.147 asserts the probe's arm count beside the capture and why this
      // mutation is the one that showed the decline is not dead (C09 I73).
      name: "CELL-CUT-DROPPED: a mosaic cell's rows are not cut to its region",
      file: R,
      from: "      if (p.height !== undefined && within >= p.height) continue;\n",
      to: "\n",
      expect: "T2.147",
    },
    {
      // **The sort dropped**: pieces reach the composer in the order their
      // container hands them over, which for a mosaic is region order and not
      // column order. Every count survives it and every golden agrees, because
      // no corpus grid has a later region starting left of an earlier one
      // (F1213). T2.147's pinwheel is the one that does.
      name: "PIECE-ORDER-DROPPED: a row's pieces are composed in the order they were placed",
      file: R,
      from: "    pieces.sort((a, b) => a.x - b.x);\n",
      to: "",
      expect: "T2.147",
    },
    {
      // **The cut a row long**: the frame moves rather than the arm, so this is
      // the byte half of the pair above — the region keeps one row too many.
      name: "CELL-CUT-LONG: a mosaic cell keeps one row past its region",
      file: R,
      from: "      if (p.height !== undefined && within >= p.height) continue;",
      to: "      if (p.height !== undefined && within > p.height) continue;",
      expect: "T2.147",
    },
    {
      // **A region with no room drawn anyway** (C04 I72): a zero-wide cell
      // renders its child at a width of nothing and places it.
      name: "CELL-EMPTY-DRAWN: a region under one cell wide or one row tall is drawn",
      file: C,
      // 1.7 moved the test off the rect and onto the room the grid has
      // (C29 §8a C9): the rect is now what the grid says and `mosaicRoom`
      // answers `null` where there is nowhere to put it. The rule is unchanged
      // and the line that carries it moved.
      from: "      const room = mosaicRoom(rect, width, height);\n      if (room === null) return [];",
      to: "      const room = mosaicRoom(rect, width, height) ?? { width: rect.width, height: rect.height };",
      // **It survived once, against T2.144.** Every byte is identical without
      // the guard — `fitRow(row, 0)` is empty and `composeRow` skips an empty
      // piece — so the composition drops the cell whatever the guard does, and
      // only the *work* moves. C04 I72 says a region with no room is not drawn
      // and drawn includes rendered; T2.147's title claimed it and no assertion
      // carried it, so a render count was added there and this names it.
      expect: "T2.147",
    },
    // **FALLBACK-DROPPED stood here** — an element child coerced to no rows,
    // so a group holding a mosaic lost it, caught by T3.89's first case. Its
    // subject was `rowsOfAll`'s refusal, and there is nothing to refuse since
    // F1209 narrowed `Rendered`: the function was an identity map and is
    // deleted. A mutation with no expression in the tree is removed rather
    // than re-anchored onto something adjacent, which would be a row watching
    // a site that never carried the defect.
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
