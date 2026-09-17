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
    from: "    if (piece.x > cursor) out += \" \".repeat(piece.x - cursor);\n",
    to: "    if (piece.x > cursor) out += \" \";\n",
    why: "every pad is one space; every row group and panel body moves in T2.144 and in the goldens",
  },
  mutations: [
    {
      // **The pad from the piece's own column** rather than from where its row
      // ended: the next cell lands early by the row's width.
      name: "PAD-FROM-CELL: the cursor advances to the piece's column, not past its row",
      file: R,
      from: "    cursor = piece.x + rowCells(row);\n",
      to: "    cursor = piece.x;\n",
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
      from: "        blocks.push({ x: x + at.left, top: at.top, width: at.width, rows });\n",
      to: "        blocks.push({ x, top: at.top, width: at.width, rows });\n",
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
      from: "          for (const line of drawn as readonly string[]) parts.push(line === \"\" ? \"\" : pad + line);\n",
      to: "          for (const line of drawn as readonly string[]) parts.push(line);\n",
      expect: "T2.144",
    },
    {
      // **The child rendered twice**: once for the rows attempt and again for
      // the element fallback, which is what the first form of this arm did.
      // **Neither the captures nor the goldens can see it** — a second render
      // produces the same bytes — so T1.33's count is the only instrument, and
      // it is the reason a byte-for-byte oracle is not sufficient on its own.
      name: "MOSAIC-RERENDER: the element fallback renders the child a second time",
      file: C,
      from: "            elementOf(drawn),",
      to: "            elementOf(ctx.renderChild(child, rect.width)),",
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
      from: "      if (rect === undefined || rect.width < 1 || rect.height < 1) return [];",
      to: "      if (rect === undefined) return [];",
      expect: "T2.144",
    },
    {
      // **The fallback dropped**: an element child is read as no rows, and a
      // group holding a mosaic loses it — T3.89's first case.
      name: "FALLBACK-DROPPED: an element child is coerced to no rows",
      file: C,
      from: "    if (!Array.isArray(r)) return null;\n    out.push(r as readonly string[]);\n",
      to: "    out.push(Array.isArray(r) ? (r as readonly string[]) : []);\n",
      expect: "T3.89",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
