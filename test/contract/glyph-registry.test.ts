// C09 I123 — the registry's glyphs and the tree's agree record by record, in
// both directions, through the resolver.
//
// **Why this is a contract row and not an A03 scan.** The scan it strengthens,
// SS65, reads `glyphs.ts` as text, because `tools/enforce/` cannot import the
// TypeScript it checks. Text can say whether a character appears; it cannot say
// which record resolves to it, so swapping two records' values passed. This row
// imports the real exports and reads each mark through the function a renderer
// calls, which is the only place the answer lives.
import { describe, expect, it } from "vitest";

import { cells } from "../../src/presentation/text.js";
import { CALL_STATES } from "../../src/data/viewmodel/index.js";
import * as glyphModule from "../../src/presentation/blocks/glyphs.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, measurable, visible } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
// **The design's own resolver for a set's ASCII frames** (C09 I98): a pattern
// fitted to the frame count, or a composite of other sets — read through the
// function the page is built with, never re-derived here.
import { loadRegistry, spinnerAsciiFrames } from "../../docs/design/language/build-calcium.mjs";
import { HOMES, canonicalRecords, records } from "../support/glyph-homes.js";
import { SURFACES } from "../support/design-surfaces.js";

/** Homes with no collision table of their own, and why — compared by equality. */
const NO_DOMAIN_TABLE: Readonly<Record<string, string>> = {
  "meter-fill": "a bar alphabet is a set of two, and SS64's domain model covers marks, not alphabets",
  reader: "the prompt is shell chrome, drawn in the prompt gutter and never inside a block",
};

/**
 * Domains a home declares beyond its record's — where the tree draws the mark
 * in a place the registry does not name. Compared by equality, so a new one
 * fails until it is written here.
 */
const EXTRA_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  current: ["form"],
  failure: ["form"],
  "disclosure-collapsed": ["tree"],
  disclosure: ["tree"],
  ellipsis: ["row-lead"],
};

/**
 * Block-vocabulary tokens with no registry record, and why. Compared by
 * equality against `GLYPH_TOKENS` less the homes, so a token added to the
 * vocabulary fails here until it is given a record or a reason.
 */
const TREE_ONLY: Readonly<Record<string, string>> = {
  info: "the info notice's mark; the registry draws info as tone and prose, with no glyph record",
  pending: "a call state's glyph at the monochrome rung — work-unit's asciiResolution: state",
  working: "a call state's glyph at the monochrome rung — work-unit's asciiResolution: state",
  queued: "R-BLK-220's hollow queued mark, a state glyph the registry's stateAxes carry rather than a glyph record",
  cancelled: "a call state's glyph at the monochrome rung — work-unit's asciiResolution: state",
  bullet: "a prose list mark, content rather than chrome",
  quote: "a prose quote rail, content rather than chrome",
  nested: "a prose nesting mark, content rather than chrome",
};

describe("C09 I123 — registry ↔ runtime glyphs", () => {
  it("T2.189 (I123, R-GLY-001–003): every current registry glyph's home, read through its resolver, gives the record's halves, reservation and domains; the tree-only tokens are listed by equality", async () => {
    // Every record has a home, and every home a record — both directions of the
    // mapping itself before any field is compared.
    expect(Object.keys(HOMES).sort(), "one home per current record").toEqual(records.map((g) => g.id).sort());

    for (const g of records) {
      const home = HOMES[g.id];
      if (home === undefined) continue;
      // The symbol exists on its module, so a renamed export fails by name
      // rather than as an `undefined` read three lines later.
      const mod = (await import(`../../${home.path.replace(/\.ts$/u, ".js")}`)) as Record<string, unknown>;
      expect(mod[home.symbol], `${g.id}: ${home.path} exports ${home.symbol}`).toBeDefined();

      const unicode = home.read(FULL_CAPS);
      const ascii = home.read(ASCII_CAPS);
      expect(unicode, `${g.id}: the Unicode half`).toBe(g.unicode);

      if (g.asciiResolution === "state") {
        // The record holds no ASCII character; its home resolves one per call
        // state, and the five are distinct (C09 I45, R-GLY-002).
        expect(g.ascii, `${g.id}: a state-resolved record holds no ASCII half`).toBeUndefined();
        const perState = CALL_STATES.map((state) => glyphModule.glyphFor(glyphModule.headMark(state, ASCII_CAPS), ASCII_CAPS));
        expect(new Set(perState).size, `${g.id}: one ASCII glyph per state — ${perState.join(" ")}`).toBe(CALL_STATES.length);
      } else {
        expect(ascii, `${g.id}: the ASCII half`).toBe(g.ascii);
        const reservation = Math.max(cells(unicode), cells(ascii)); // narrow-ok — both halves, the reservation (C09 I5)
        expect(reservation, `${g.id}: the reservation`).toBe(g.reservedCells);
        if (home.token !== undefined) expect(glyphModule.glyphCells(home.token), `${g.id}: glyphCells agrees`).toBe(g.reservedCells);
      }

      if (home.domains === null) {
        expect(NO_DOMAIN_TABLE[g.id], `${g.id}: a home with no domain table says why`).toBeDefined();
        continue;
      }
      const declared = g.collisionDomains ?? [];
      for (const domain of declared) expect(home.domains, `${g.id}: the home honours ${domain}`).toContain(domain);
      const extra = home.domains.filter((d) => !declared.includes(d));
      expect(extra, `${g.id}: the home's domains beyond the record's`).toEqual(EXTRA_DOMAINS[g.id] ?? []);
    }

    // The two allow-lists are driven: every entry names a record that exists
    // and still needs it.
    expect(Object.keys(NO_DOMAIN_TABLE).sort()).toEqual(
      Object.entries(HOMES).filter(([, h]) => h.domains === null).map(([id]) => id).sort(),
    );
    for (const id of Object.keys(EXTRA_DOMAINS)) expect(HOMES[id], `EXTRA_DOMAINS names ${id}, which has a home`).toBeDefined();

    // **The other direction**: every block-vocabulary token is a home or tree-only.
    const homed = new Set(Object.values(HOMES).flatMap((h) => (h.token === undefined ? [] : [h.token])));
    const unhomed = glyphModule.GLYPH_TOKENS.filter((t) => !homed.has(t)).sort();
    expect(unhomed, "tree-only tokens, by equality").toEqual(Object.keys(TREE_ONLY).sort());

    // **A home is only a home if the renderer draws it.** Two of this landing's
    // three disagreements were a slot and a reader apart: reading the slot says
    // what the set holds, and this says what an exclusive choice paints with.
    const radio = block({
      kind: "choice", id: "c", label: "scale", exclusive: true,
      options: [{ id: "lin", label: "linear" }, { id: "log", label: "log", chosen: true }],
    }) as unknown as Block;
    for (const [caps, open] of [[FULL_CAPS, "○"], [ASCII_CAPS, "@"]] as const) {
      const rows = measurable({ capabilities: caps }).renderToLines(radio, 40).map(visible);
      const row = rows.find((r) => r.includes("linear")) ?? "";
      // The options sit in one row (`scale  ○ linear  ● log`), so the mark is read beside its label.
      expect(row.includes(`${open} linear`), `the unchosen option at ${caps.unicode}: ${JSON.stringify(row)}`).toBe(true);
    }
  });

  it("T2.232 (C09 I123, R-GLY-003, F1465): the §006 census is the registry's canonical set — one row per canonical record, in registry order, each carrying the record's halves and role, and no tree-only token", async () => {
    // **Read through the golden's own rows**, not a re-derivation: the census
    // is `design-surfaces` §006, and a test that rebuilt it would agree with
    // itself. The first draft of the census drew `GLYPH_TOKENS`.
    const surface = SURFACES.find((x) => x.section === 6);
    expect(surface, "the §006 surface exists").toBeDefined();
    const rows = (await surface!.rows(80, FULL_CAPS, DARK_THEME)).map(visible);
    const body = rows.slice(rows.indexOf("  glyph  ascii        role") + 1);
    const census = body.slice(0, body.indexOf(""));
    expect(census.length, "one row per canonical record").toBe(canonicalRecords.length);
    canonicalRecords.forEach((g, i) => {
      const ascii =
        g.asciiResolution === "state"
          ? CALL_STATES.map((st) => glyphModule.glyphFor(glyphModule.headMark(st, ASCII_CAPS), ASCII_CAPS)).join(" ")
          : g.ascii;
      expect(census[i], `${g.id}: the row, in registry order`).toBe(`  ${g.unicode}  ${ascii}`.padEnd(`  ${g.unicode}  `.length + 13, " ") + (g.semanticRole ?? g.id));
    });
    // No tree-only token's mark sits in a row of its own.
    const treeOnly = glyphModule.GLYPH_TOKENS.filter((t) => Object.keys(TREE_ONLY).includes(t));
    expect(treeOnly.length, "the contract still lists tree-only tokens").toBeGreaterThan(0);
    for (const token of treeOnly) {
      const mark = glyphModule.glyphFor(token, FULL_CAPS);
      if (canonicalRecords.some((g) => g.unicode === mark)) continue; // shared with a canonical mark
      expect(census.some((r) => r.startsWith(`  ${mark}  `)), `${token} (${mark}) is the tree's and not the registry's`).toBe(false);
    }
  });

  it("T2.190 (C09 I98, question 39, R-MOT-010): no spinner set's ASCII rung is one repeated character, in the tree or in the registry; downsampling is let through", () => {
    // **Within a set, the ASCII rung must move** (question 39, ruled (a)). A set
    // whose ASCII frames are all one character is a still mark in a slot that
    // says *live*: the fallback froze the animation. Several Unicode frames onto
    // one ASCII frame is allowed — `braille`'s ten dots onto four rotation frames
    // — and that is exactly what SS64's static test fires on, which is why the
    // rule is here and not there: inside a set the static question is the wrong one.
    const still = (sets: Readonly<Record<string, readonly string[]>>): readonly string[] =>
      Object.entries(sets).filter(([, ascii]) => new Set(ascii).size < 2).map(([name]) => name).sort();

    // **The control first — the check can see the thing it refuses.** A set
    // whose ASCII half is `| | | |` is named, and one whose half holds two
    // characters is not: a rule that answered `[]` to both would pass the corpus
    // below for the wrong reason.
    expect(still({ frozen: ["|", "|", "|", "|"], held: ["|", "|", "/", "/"] }), "the fabricated still set").toEqual(["frozen"]);

    // The tree: every set's ASCII rung, as `spinnerFrames` answers it.
    const tree = Object.fromEntries(
      glyphModule.spinnerSetNames().map((name) => [name, glyphModule.spinnerFrames(ASCII_CAPS, name)]),
    );
    expect(still(tree), "a set whose ASCII rung is one character, in the tree").toEqual([]);

    // The registry: the same question of the design's own resolved frames, so a
    // record added with a constant pattern fails here before it is ported.
    const REG = loadRegistry();
    const spinners = (REG["spinners"] as readonly { id: string; status?: string; frames: readonly string[] }[])
      .filter((sp) => sp.status === "current");
    const design = Object.fromEntries(spinners.map((sp) => [sp.id, spinnerAsciiFrames(REG, sp as never) as readonly string[]]));
    expect(still(design), "a set whose ASCII rung is one character, in the registry").toEqual([]);
    expect(Object.keys(design).sort(), "the two catalogues are one set").toEqual(Object.keys(tree).sort());

    // **Downsampling is let through, and the corpus holds it** — one ASCII frame
    // under two different Unicode frames. Question 39 measured twelve of
    // twenty-seven; the row asserts some rather than twelve, so a set re-fitted
    // does not turn it red, and none would mean the fixture stopped holding the
    // case the rule must not refuse.
    const downsampled = glyphModule.spinnerSetNames().filter((name) => {
      const set = glyphModule.SPINNER_SETS[name];
      if (set === undefined) return false;
      const under = new Map<string, Set<string>>();
      set.ascii.forEach((a, i) => under.set(a, (under.get(a) ?? new Set()).add(set.frames[i] ?? "")));
      return [...under.values()].some((u) => u.size > 1);
    });
    expect(downsampled.length, `sets downsampling at ASCII: ${downsampled.join(" ")}`).toBeGreaterThan(0);
  });
});
