// `tools/terminal-probe/build.mjs` and `tools/terminal-read.sh` — their fixtures.
//
// **Both landed without one and `make instruments` has been red since**, which
// is the second time that has happened to this target and the first is recorded
// in its own comment four lines from where these rows were owed. The gate did
// its job on the day they landed; nothing ran it.
//
// **What is checkable here is what does not need a terminal.** `build.mjs`
// captures the shipped encoder's bytes and substitutes one token; `terminal-read.sh`
// drives a human through ten checks and writes the record. Neither's *verdict*
// can be reached from a container — that is the whole reason the probe exists —
// but the properties that make a verdict readable can: that the bytes are the
// real encoder's, that the substitution fired, that the control is corrupt, and
// that every case tells the reader what its failure looks like.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const BUILD = readFileSync(join(ROOT, "tools/terminal-probe/build.mjs"), "utf8");
const DRIVER = readFileSync(join(ROOT, "tools/terminal-read.sh"), "utf8");

describe("tools/terminal-probe/build.mjs — the bytes it captures", () => {
  it("TP1: the transmission is the shipped encoder's, not a reimplementation", () => {
    // **The rule the probe rests on** (`the-terminal-answers-in-bytes`): send the
    // shipped encoder's bytes, not a reimplementation, or the probe agrees with
    // the intent rather than with the code. `transmitImage` is called for real
    // and its output used verbatim except for one token.
    expect(BUILD).toContain('import { transmitImage } from "../../dist/shell/transmit-image.js"');
    expect(BUILD).toContain("const real = transmitImage([block], KITTY, new Set(), WIDTH);");
    // **Against `dist/`, because a probe built from `src/` is not what ships**
    // and a stale build gives a wrong negative nothing revisits.
    expect(BUILD.includes('from "../../src/')).toBe(false);
  });

  it("TP2: the q substitution is asserted, both that it could fire and that it did", () => {
    // A script that reports success having changed nothing is a failure
    // (CLAUDE.md). Two assertions and not one: the token has to be *there*
    // before its absence can mean the substitution ran.
    expect(BUILD).toContain('if (!real.includes("q=2"))');
    expect(BUILD).toContain('if (asking === real)');
    expect(BUILD).toContain('const asking = real.split("q=2").join("q=0");');
  });

  it("TP3: the control is a real PNG broken on purpose, and its corruption is asserted", () => {
    // **Every probe owes a control that must fail.** The first run of this probe
    // returned four `OK`s and was worthless until a PNG with 64 bytes of its
    // IDAT inverted came back `EINVAL` — a probe that answers OK to everything
    // measures nothing.
    expect(BUILD).toContain('if (bad.equals(good)) throw new Error("the corruption changed nothing");');
    expect(BUILD).toContain("THE CONTROL");
    expect(BUILD).toContain("this MUST fail");
  });

  it("TP4: three controls — two beside the refusals, one for the probe itself", () => {
    // The reading is *does the terminal decode what we refuse* (C09 §8b G7), so
    // a refusal with no control beside it is an answer with nothing to compare
    // against. Both halves are named in the case list itself.
    for (const probe of ["palette.png", "photo.png", "depth16.png", "interlaced.png"]) {
      expect(BUILD.includes(`"${probe}"`), `${probe} is a case`).toBe(true);
    }
    // **Three controls, not two — measured, and the count was wrong first.**
    // Two sit in the case list beside the refusals they are controls for, and
    // the third is the corrupt PNG, which is the control for the *probe* rather
    // than for a case: without it every `OK` above is unreadable.
    const controls = [...BUILD.matchAll(/CONTROL — /gu)].length;
    expect(controls, "two case controls plus the probe's own").toBe(3);
    expect(BUILD).toContain("we refuse: bit depth 16");
    expect(BUILD).toContain("we refuse: Adam7");
  });
});

describe("tools/terminal-read.sh — the driver's own claims", () => {
  it("TR1: every case says what its failure looks like, not only what to look for", () => {
    // **The reader's own instruction, and it is the difference between a useful
    // read and *looks fine*.** A case that names only what to look at gets
    // reported as fine by a reader who did not know what wrong would look like.
    // **`looks` is a heredoc reader, not a pipe** — the first form of this row
    // matched `| looks` and reported *5 cases, 0 failure descriptions* against a
    // driver where all five have one. An assertion has to name the mechanism the
    // subject actually uses.
    const cases = [...DRIVER.matchAll(/^\s*head2 /gmu)].length;
    const looks = [...DRIVER.matchAll(/^\s*looks <<'TXT'$/gmu)].length;
    expect(cases, "the driver has cases").toBeGreaterThan(0);
    expect(looks, `${String(cases)} cases, ${String(looks)} failure descriptions`).toBe(cases);
  });

  it("TR2: the container is handed all three variables capability detection reads", () => {
    // **F416 and F418, and each cost a frame.** `docker exec` propagates none of
    // the terminal's identity: without `TERM` the demo reports no graphics
    // protocol on a terminal that speaks one, and without `COLORTERM` it drops
    // to 4-bit and every continuous colormap vanishes. Three variables, because
    // C02 reads three.
    expect(DRIVER).toContain("-e TERM -e COLORTERM -e TERM_PROGRAM");
  });

  it("TR3: the record names the terminal, its version and the font", () => {
    // **A placeholder's width is a font question**, so a record without the font
    // is a measurement whose subject is unstated — and the terminal's version is
    // what makes the reading citable a year later.
    const record = /record\(\)\s*\{[\s\S]*?\n\}/u.exec(DRIVER)?.[0] ?? "";
    expect(record, "the driver writes a record").not.toBe("");
    for (const field of ["TERM", "font", "version"]) {
      expect(record.toLowerCase().includes(field.toLowerCase()), `the record names ${field}`).toBe(true);
    }
  });
});
