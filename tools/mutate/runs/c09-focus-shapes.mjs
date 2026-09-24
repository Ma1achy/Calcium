// C09 I105 and I106 — §018's focus shapes, mutated.
//
// **Every mutation below is one of the two channels doing the other's job.**
// §018's whole argument is that the channel never changes and the target
// follows the shape; the plausible wrong builds are the ones where a fact moves
// onto a carrier that already has one, and each is correct in every frame but
// the cell the section wrote its sentence for.
//
// Anchors and expectations run by hand on 2026-09-24.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/focus-shapes.test.ts test/golden/focus-shapes.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const FILE = "src/presentation/blocks/kinds/controls.ts";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FILE,
    from: "  return block.exclusive === true ? (chosen ? g.filled : g.hollow) : (chosen ? g.tick : g.cross);",
    to: "  return block.exclusive === true ? g.filled : g.tick;",
    why: "the mark stops carrying chosen at all — every option draws the chosen glyph, which is the channel collapsing rather than swapping; a row that cannot see that cannot see either half of C09 I105",
  },
  mutations: [
    {
      // **The wash read off `chosen`.** Three of the four cells are right, and
      // the one that is wrong is the whole point of a radio group.
      name: "the wash is drawn from chosen rather than from focus",
      file: FILE,
      from: "      const focused = option.id === head;",
      to: "      const focused = option.chosen === true;",
      expect: "T1.72",
    },
    {
      // The other direction: the mark read off focus, so the reader's position
      // rewrites the datum under them.
      name: "the mark is drawn from focus rather than from chosen",
      file: FILE,
      from: "      spans.push({ text: optionText(block, i, ctx.capabilities), style });",
      to: "      spans.push({ text: optionText({ ...block, options: block.options.map((o) => ({ ...o, chosen: o.id === head })) }, i, ctx.capabilities), style });",
      expect: "T1.72",
    },
    {
      // **The wash over the label alone**, which is a second shape — *the label
      // is part of it*, and a run over half of it satisfies every assertion
      // that only asks whether a ground appeared.
      name: "the wash covers the label and not the mark",
      file: FILE,
      from: "  return `${markOf(block, option.chosen === true, caps)} ${stripControl(option.label)}`;",
      to: "  return stripControl(option.label);",
      expect: "T1.72",
    },
    {
      // **The value toned with focus.** It reads well and it says the reading
      // is chrome — *the VALUE is INFO and it never changes*.
      name: "the value takes the focus tone",
      file: FILE,
      from: '      { text: value, style: tone("info", ctx.theme, ctx.capabilities, on) },',
      to: '      { text: value, style: tone(focused ? "accent" : "info", ctx.theme, ctx.capabilities, on) },',
      expect: "T1.73",
    },
    {
      // **The wash over the track alone — a control drawn as three things.**
      //
      // **Its first aim was a non-change and the run said so.** Dropping `on`
      // from `base` looks like removing the ground and is not: `focusStyle`
      // supplies it and `on` only resolves the ink *against* it (C10 I48), and
      // in this theme the two inks are the same value — so the output was
      // byte-identical and the row's green said nothing. The site where *the
      // wash covers label, track and value* can actually be violated is where
      // the ground reaches every span, which is here.
      name: "the wash covers the track alone",
      file: FILE,
      from: "      ? spans.map((s) => ({ ...s, style: { ...s.style, ...focusStyle(ctx.theme, ctx.capabilities) } }))",
      to: "      ? spans.map((s, i) => (i === 2 ? { ...s, style: { ...s.style, ...focusStyle(ctx.theme, ctx.capabilities) } } : s))",
      expect: "T1.73",
    },
    {
      // Inside loses its weight, so the only carrier left is the handle — which
      // is the one that dies at ASCII. The frame at 24-bit still changes.
      name: "inside keeps the light track and changes only the handle",
      file: FILE,
      from: "  const line = inside ? g.heavyHorizontal : g.horizontal;",
      to: "  const line = g.horizontal;",
      expect: "T1.73",
    },
    {
      // The track widens on entry — §018 draws it that way and its own case 4
      // refuses exactly this on the other axis.
      name: "the handle gains a space either side when the reader is inside",
      file: FILE,
      from: "  return `${g.teeLeft}${line.repeat(before)}${handle}${line.repeat(span - before)}${g.teeRight}`;",
      to: "  return `${g.teeLeft}${line.repeat(before)}${inside ? ` ${handle} ` : handle}${line.repeat(span - before)}${g.teeRight}`;",
      expect: "T1.73",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
