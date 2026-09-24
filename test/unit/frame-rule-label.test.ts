// C22 §6l.10 — the label on the prompt's rule (§069, `R-COL-003`).
//
// **The rules already exist, so a label in one costs no rows.** That is the
// design's argument for the slot and it is what both rows here are written
// against: the frame's height must not move, and a frame with no label must be
// the frame that shipped, glyph for glyph.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

/** Written as a code point rather than a literal, so no control byte is in the file. */
const ESC = String.fromCharCode(27);
const RULE = "─";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setImmediate(r));
};

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [],
};

/**
 * One session at a width, with the label as the only thing that varies.
 *
 * **The same chrome in both arms.** The first draft passed a chrome for the
 * labelled frame and none for the bare one, so it compared the default header
 * against an empty one and read six moved rows as the label's doing. A control
 * is only a control if one thing differs.
 *
 * **And the width is the harness's second argument, not a config key.** Passed
 * as `columns` in the overrides it is silently ignored and every width draws at
 * 100, so the drop below 60 read as a failure of the drop rather than of the
 * fixture — `test/support/README.md`'s rule, that a fixture is shown to respond
 * to the thing under test before it is asserted against.
 */
const sessionAt = async (
  columns: number,
  label: string | Readonly<{ text: string; hue?: string }> | null,
): Promise<{ rows: readonly string[]; bytes: string }> => {
  const stdin = fakeStdin();
  const { screen, stdout } = await buildSession(
    {
      manifest: MANIFEST,
      stdin: stdin as never,
      chrome: {
        header: () => [],
        footer: () => [],
        ...(label === null ? {} : { label: () => label }),
      },
    } as never,
    { columns, rows: 30 },
  );
  await settle();
  return { rows: screen().rows, bytes: stdout.chunks.join("") };
};

const framesAt = async (
  columns: number,
  label: string | Readonly<{ text: string; hue?: string }> | null,
): Promise<readonly string[]> => (await sessionAt(columns, label)).rows;

/**
 * The SGR run the label's own text is drawn in.
 *
 * **Read from the bytes immediately before ` <label> `**, because that is where
 * the ground arrives — as the second half of `38;5;16;48;5;33`, not as a
 * sequence of its own. T1.65c's reader answers *is there a ground anywhere*;
 * this one answers *which*, which is what a hue needs.
 */
const labelRun = (bytes: string, text: string): string => {
  const at = bytes.indexOf(` ${text} `);
  if (at < 0) return "";
  const before = bytes.slice(0, at);
  const runs = [...before.matchAll(new RegExp(`${ESC}\\[([0-9;]*)m`, "gu"))];
  return runs.length === 0 ? "" : (runs[runs.length - 1]?.[1] ?? "");
};

/**
 * Every SGR parameter, read as *tokens* rather than as digits.
 *
 * `38` and `48` take their colour inline — `5;n` for an index, `2;r;g;b` for
 * rgb — so a parameter list is not a set of independent numbers and cannot be
 * searched as one. Walking it is what tells a background token from a
 * foreground's colour index that happens to spell the same two digits.
 */
const sgrTokens = (bytes: string): readonly number[] => {
  const out: number[] = [];
  for (const m of bytes.matchAll(new RegExp(`${ESC}\\[([0-9;]*)m`, "gu"))) {
    const params = (m[1] ?? "").split(";").map((p) => (p === "" ? 0 : Number(p)));
    for (let i = 0; i < params.length; i += 1) {
      const p = params[i] ?? 0;
      out.push(p);
      if (p === 38 || p === 48 || p === 58) i += params[i + 1] === 2 ? 4 : 2;
    }
  }
  return out;
};

/** Whether anything in the bytes sets a background (C10 §4a's channel). */
const paintsGround = (bytes: string): boolean =>
  sgrTokens(bytes).some((t) => t === 48 || (t >= 40 && t <= 47) || (t >= 100 && t <= 107));

/** The rows that are a rule — the ones made of the horizontal glyph. */
const ruleRows = (rows: readonly string[]): readonly number[] =>
  rows.flatMap((r, i) => (new RegExp(`${RULE}{6,}`, "u").test(r) ? [i] : []));

describe("C22 §6l.10 — the labelled rule", () => {
  it("T1.65 (C22 I111, §6l.10): the label sits inline-end on the upper rule, and no other row moves", async () => {
    const bare = await framesAt(100, null);
    const named = await framesAt(100, "calcium");

    // **The control, and it is the whole of the amendment's claim.** C22 I81 said
    // the rules are never configurable; what it was about is the geometry, and
    // the reading is only honest if a frame with no label is the frame that
    // shipped. Height first, then the rows themselves.
    expect(named.length, "a label costs no rows").toBe(bare.length);

    const moved = bare.flatMap((row, i) => (row === named[i] ? [] : [i]));
    expect(moved.length, `exactly one row differs, and ${String(moved.length)} did`).toBe(1);

    // **And it is the upper of the prompt's two rules**, not the header's and
    // not the lower — *two rules with two labels is a header, and the header
    // already exists*. Identified by position among the rule rows rather than
    // by index, so the row survives a change to the header's height.
    const rules = ruleRows(bare);
    expect(rules.length, "the header's rule and the prompt's two").toBe(3);
    expect(moved[0], "the second rule row is the one that carries it").toBe(rules[1]);

    // The label is drawn inline-end with one trailing glyph after it, and the
    // rule's own glyphs keep the row's left.
    const plain = (named[moved[0] ?? 0] ?? "").trimEnd();
    expect(
      plain.endsWith(` calcium ${RULE}`),
      `inline-end with one trailing glyph: ${plain.slice(-14)}`,
    ).toBe(true);
    expect(plain.startsWith(RULE.repeat(3)), "and the rule still runs to it").toBe(true);
  });

  it("T1.65b (C22 I111, §6l.10, R-COL-003): the label is painted as a ground, not as a tone", async () => {
    // **Read off the bytes rather than off `screen()`**, which folds the SGR
    // away — a row asserting a ground against the screen can only say what a
    // stripped frame says, and both arms answer the same. The bare frame emits
    // no background at all, so a background in the labelled one is the ground
    // arriving: asserted as a difference rather than as a literal code, which
    // would pin the theme rather than the rule.
    const bare = await sessionAt(100, null);
    const named = await sessionAt(100, "calcium");
    expect(paintsGround(bare.bytes), "the bare frame paints no ground").toBe(false);
    expect(paintsGround(named.bytes), "the label is a ground").toBe(true);
  });


  it("T1.71 (C22 I114, §070, C10 I55, R-COL-003): the label takes the hue's ground and the hue's ink", async () => {
    const HUES = ["blue", "orange", "cyan", "pink", "lime", "violet", "yellow", "green", "red", "purple"];

    // **The control first, and it is the amendment's whole claim**: a label
    // that names no hue is the frame that shipped, glyph for glyph and byte
    // for byte. Without it the row passes against a build that tints every
    // label, which is the change nobody asked for.
    const plain = await sessionAt(100, "calcium");
    const asRecord = await sessionAt(100, { text: "calcium" });
    expect(asRecord.bytes, "a record with no hue is the bare string").toBe(plain.bytes);
    const untinted = labelRun(plain.bytes, "calcium");
    expect(untinted, "and the untinted label is painted at all").not.toBe("");

    // Each hue paints its own band — ten distinct runs, none of them the
    // untinted one. Asserted as distinctness rather than as ten literals: the
    // values are C10's and pinning them here would be a second copy of the
    // registry in a shell test.
    const runs = new Map<string, string>();
    for (const hue of HUES) {
      const s = await sessionAt(100, { text: "calcium", hue });
      const run = labelRun(s.bytes, "calcium");
      expect(run, `${hue}: the label is painted`).not.toBe("");
      expect(run, `${hue}: and not with the untinted ground`).not.toBe(untinted);
      runs.set(hue, run);
      // The ink comes WITH the band — `R-THM-003`, and it is why the third tier
      // exists. Both channels are in the one run, which is what says the ink was
      // not left behind on the ground's arrival (the first build's defect: the
      // ground was handed back on the `colour` channel and silently dropped).
      expect(paintsGround(`${ESC}[${run}m x ${ESC}[0m`), `${hue}: a ground`).toBe(true);
      expect(run.startsWith("38;"), `${hue}: and an ink, in the same run`).toBe(true);
    }
    expect(new Set(runs.values()).size, "ten hues, ten bands").toBe(10);

    // **The ink is the BAND's and not the hue's, and this is the assertion the
    // row was missing.** A mutation taking the ink from the hue's own colour
    // survived every check above: ten runs still distinct, a ground still
    // painted, an ink still in the run. All of them are true of a hue drawn on
    // itself, which is `R-THM-003`'s failure exactly — an ink chosen by whoever
    // was nearest rather than by the band it lands on.
    //
    // What separates them is the shape of the tier rather than any value: the
    // `on` ink is the higher-contrast of black and white (C10 I54, 100 of 100),
    // so across ten hues the grounds take **ten** values and the inks take at
    // most **two**. A hue drawn on itself gives ten.
    const inkOf = (run: string): string => /^38;5;(\d+)/u.exec(run)?.[1] ?? /^38;2;([0-9;]+?);48/u.exec(run)?.[1] ?? "";
    const inks = new Set([...runs.values()].map(inkOf));
    expect(inks.has(""), "every run's ink parses").toBe(false);
    expect(inks.size, `the band's ink is black or white, and ${String(inks.size)} values appeared`)
      .toBeLessThanOrEqual(2);

    // **A name no theme carries paints the untinted ground, not nothing.** The
    // name arrives from a config file where a person typed it, so the reachable
    // wrong input is a misspelling — and a label that vanishes is a worse answer
    // to a typo than one that is simply not tinted.
    const typo = await sessionAt(100, { text: "calcium", hue: "bleu" });
    expect(labelRun(typo.bytes, "calcium"), "an unknown hue falls back rather than out")
      .toBe(untinted);

    // And the shedding is the hue's business in no way: below 60 columns the
    // label is gone whatever it is painted with.
    const narrow = await framesAt(50, { text: "calcium", hue: "blue" });
    const narrowBare = await framesAt(50, null);
    expect(narrow, "a hue changes what is painted, never whether").toEqual(narrowBare);
  });

  it("T1.65c (C22 I111, §6l.10): the ground reader can see one, and does not see a tone as one", () => {
    // **The reader's own fabricated violation**, and it is here because the
    // first draft of it was wrong in the direction that reads as a defect in
    // the code. It matched a background only at the head of the sequence, and
    // the label's ground arrives as the *second* parameter of
    // `38;5;188;48;5;235` — so a row that was painting a ground reported none.
    //
    // A regex cannot be made right here: `38;5;45m` is a 256-colour foreground
    // whose index is two digits a background token also spells, and nothing
    // local to the digits tells them apart. `sgrTokens` walks the parameters
    // instead, consuming the two extended forms, which is the only reading that
    // distinguishes a colour *index* from a colour *token*.
    expect(paintsGround(`${ESC}[38;5;188;48;5;235m x ${ESC}[0m`), "a ground behind a tone").toBe(true);
    expect(paintsGround(`${ESC}[41m x ${ESC}[0m`), "a bare background token").toBe(true);
    expect(paintsGround(`${ESC}[38;5;45m x ${ESC}[0m`), "a foreground index that spells one").toBe(false);
    expect(paintsGround(`${ESC}[38;2;0;104;7m x ${ESC}[0m`), "an rgb foreground whose blue spells one").toBe(false);
    expect(paintsGround(`${ESC}[0m plain ${ESC}[2m`), "no colour at all").toBe(false);
  });

  it("T1.65d (C22 I111, §6l.10): a string that strips to nothing is no label", async () => {
    // **The narrowing is the frame's, not the caller's.** An application that
    // computes its label can return `""` or a run of spaces on some frames, and
    // a one-cell ground floating in the rule is not a name — it is a defect
    // that reads as a rendering artefact. Asserted as the bare frame rather
    // than as an absent background, so it also covers the geometry.
    const bare = await framesAt(100, null);
    for (const blank of ["", "   ", "\t "]) {
      expect(await framesAt(100, blank), `${JSON.stringify(blank)} is no label`).toEqual(bare);
    }

    // The control: a label that strips to *something* still draws, so the row
    // above is about blankness rather than about stripping refusing everything.
    expect((await framesAt(100, "  calcium  ")).join("\n"), "a padded name still draws").toContain(
      ` calcium ${RULE}`,
    );
  });

  it("T1.66 (C22 I111, §6l.10, R-BLK-175): the label is shed first, and the frame still works", async () => {
    // **The boundary is 60 and the label is gone AT it**, which is §069's own
    // sentence: *at 60 columns the label drops before anything else, because it
    // is the least load-bearing thing on the screen — and the frame still
    // works*. 60 is `MIN_COLUMNS`, the narrowest width the frame draws at all;
    // below it `fallback.ts` replaces the whole frame with the *Needs 60x24*
    // notice.
    //
    // **So the row must show the frame working at 60, not merely that two
    // narrow frames match.** The first draft asserted 40 and 59, where there is
    // no frame and therefore no rule: two fallback notices agree with each
    // other whatever the label does. A mutation setting the floor to 0
    // survived, and that is what it was reporting.
    const rulesAt = (rows: readonly string[]): number => ruleRows(rows).length;
    const at60 = await framesAt(60, "calcium");
    expect(rulesAt(at60), "the frame still works at 60 — three rules").toBe(3);
    expect(at60, "and the label is gone at 60").toEqual(await framesAt(60, null));

    // One column wider it is drawn, which is what makes 60 a boundary rather
    // than a width the label happens never to fit at.
    expect((await framesAt(61, "calcium")).join("\n"), "at 61 it is drawn").toContain(
      ` calcium ${RULE}`,
    );

    // And below `MIN_COLUMNS` there is no frame at all — recorded rather than
    // asserted as the label's doing, because a fallback notice is not a rule
    // with no label on it.
    expect(rulesAt(await framesAt(59, "calcium")), "below the floor there is no rule").toBe(0);

    // **A label that would leave no rule is shed too**, and the frame keeps its
    // height — the design's *the frame still works*, asserted rather than
    // assumed.
    //
    // **At the measured boundary, not a guessed one.** The first draft took 90
    // cells at 100 columns as "no room" and the rule drew seven glyphs and the
    // label; the arithmetic is one space either side plus one trailing glyph,
    // so a label sheds at 97 and draws at 96. Both sides are asserted, because
    // a shed arm alone is satisfied by a label that never draws.
    expect((await framesAt(100, "n".repeat(96))).join("\n"), "96 leaves one glyph").toContain(
      `${RULE} ${"n".repeat(96)} ${RULE}`,
    );
    expect(
      await framesAt(100, "n".repeat(97)),
      "a label with no room for a rule is shed whole",
    ).toEqual(await framesAt(100, null));
  });
});
