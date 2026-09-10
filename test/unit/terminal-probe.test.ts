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
//
// **And since F1060, the verdicts themselves.** `probe.py` run bare writes its
// report into `tools/terminal-probe/results/`, which is tracked; TP7 reads every
// record back and fails when one disagrees with `capabilities.ts`'s image
// protocol table. That is the half the comment on that table was missing — it
// said *run the probe there and read the verdict*, and nothing read the verdict.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectCapabilities, type TerminalCapabilities } from "../../src/terminal/capabilities.js";

const ROOT = join(import.meta.dirname, "..", "..");
const BUILD = readFileSync(join(ROOT, "tools/terminal-probe/build.mjs"), "utf8");
const DRIVER = readFileSync(join(ROOT, "tools/terminal-read.sh"), "utf8");
const RESULTS = join(ROOT, "tools/terminal-probe/results");

describe("tools/terminal-probe/build.mjs — the bytes it captures", () => {
  it("TP1: the transmission is the shipped encoder's, not a reimplementation", () => {
    // **The rule the probe rests on** (`the-terminal-answers-in-bytes`): send the
    // shipped encoder's bytes, not a reimplementation, or the probe agrees with
    // the intent rather than with the code. `transmitImage` is called for real
    // and its output used verbatim except for one token.
    expect(BUILD).toContain('import { transmitImage } from "../../dist/shell/transmit-image.js"');
    expect(BUILD).toContain("const real = transmitImage([block], KITTY, new Map(), WIDTH);");
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

  it("TP5: the replace pair goes to one id, and the substitution is asserted both ways", () => {
    // **F421's protocol half, instrumented.** `a=T` at a stable id replaces is
    // written six times across four files, all of them ours, none citing kitty's
    // documentation or a reading — and every case above gets a digest-derived
    // id, so no two transmissions here had ever shared one. The pair fixes that:
    // two transmissions at `i=911`, and an error from the second is the protocol
    // refusing. What it does not answer is *which picture is displayed*, which
    // needs a human in front of a terminal; `replace.place` is written for that.
    expect(BUILD).toContain("const ID = 911;");
    expect(BUILD).toContain('[["replace-a.png", "palette.png"], ["replace-b.png", "photo.png"]]');
    // **The two must be different pictures or the case measures nothing** — a
    // replace that did not happen and one that did would look identical.
    const pair = /\[\["replace-a\.png", "([a-z0-9.]+)"\], \["replace-b\.png", "([a-z0-9.]+)"\]\]/u.exec(BUILD);
    expect(pair, "the pair's two assets are named").not.toBeNull();
    expect(pair?.[1], "a swatch and a photograph, not one asset twice").not.toBe(pair?.[2]);
    // The same discipline as `q=2 → q=0`: the token has to be *there* before its
    // absence can mean the substitution ran, and a survivor has to be refused.
    expect(BUILD).toContain("if (hits !== 1)");
    expect(BUILD).toContain("the id substitution changed nothing");
    expect(BUILD).toContain("a derived id survived the substitution");
    // Appended, never prepended: `probe.py` reads `manifest[0]` for checks 2b
    // and 9, so a pair at the front would silently retarget both.
    expect(BUILD.indexOf("const ID = 911;")).toBeGreaterThan(BUILD.indexOf("THE CONTROL"));
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

// --- F1060 — the recorded verdicts, read back and compared to the table -----
//
// **The deferral had an instrument, the instrument had an output file, and the
// file had no reader.** `capabilities.ts`'s image-protocol table says WezTerm
// and Windows Terminal are `none` *owed and not claimed*, and distinguishes
// itself from a hope: *the expiry is an instrument — run the probe there and
// read the verdict*. Nothing read the verdict. The expiry therefore still
// depended on a person noticing, which is the failure mode the deferral rule is
// written against.
//
// **The parser was written against the records that exist, never against a
// guess at their shape** — an instrument written before its subject measures its
// own guess. The format below is `probe.py`'s as it has been since it was
// written, and the Ghostty record migrated into `results/` byte-identical
// (md5 `0bbe7d3821fe25e572a3f336488773af` on both sides) rather than reformatted,
// because reformatting the only evidence the table rests on to suit a new reader
// is how evidence stops being evidence.

/** One line of the report's header block: `LABEL` at column 0, then the value. */
function field(report: string, label: string): string | undefined {
  const m = new RegExp(`^${label}\\s+(.*)$`, "mu").exec(report);
  const value = m?.[1]?.trim();
  // `?` is what the probe logs for an unset variable, and two of the three
  // terminals measured so far set no `TERM_PROGRAM` at all.
  return value === undefined || value === "" || value === "?" ? undefined : value;
}

type ProbeRecord = Readonly<{
  file: string;
  term: string | undefined;
  program: string | undefined;
  emulator: string | undefined;
  /** The reply to the 1×1 direct-RGB query, verbatim — `OK`, an error, or `NO RESPONSE`. */
  reply: string;
}>;

function parseRecord(file: string, report: string): ProbeRecord {
  const reply = /^\s*1x1 direct RGB query\s*->\s*(.*)$/mu.exec(report)?.[1]?.trim();
  expect(reply, `${file}: no 1x1 direct RGB query line — this is not a probe report`).toBeDefined();
  return {
    file,
    term: field(report, "TERM"),
    // `TERM_PROGRAM` is logged as the program and its version on one line. Split
    // at the first space: no `TERM_PROGRAM` in the wild carries one, and the
    // version is not what identifies the terminal to C02 — it decorates the
    // filename, which `probe.py` composes in Python where the two are separate.
    program: field(report, "TERM_PROGRAM")?.split(" ")[0],
    // Added after the Ghostty run, so optional by construction rather than by
    // tolerance: that record is identified by `TERM_PROGRAM` instead.
    emulator: field(report, "EMULATOR"),
    reply: reply ?? "",
  };
}

function records(): ProbeRecord[] {
  return readdirSync(RESULTS)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => parseRecord(f, readFileSync(join(RESULTS, f), "utf8")));
}

type Agreement = "agrees" | "disagrees" | "asks a different question";

/**
 * A recorded verdict against the shipped table — **pure, so a record that does
 * not exist can be classified**.
 *
 * A row comparing a verdict to a table is vacuous if it can never disagree, so
 * the comparison is a function over a record rather than a loop with an
 * assertion inside it: TP8 hands it two terminals nobody has measured and
 * watches both arms fire.
 *
 * **Three answers and not two.** The probe asks one question — *does this
 * terminal decode a kitty graphics transmission* — so a table saying `iterm2` or
 * `sixel` is neither confirmed nor contradicted by it. Folding that into
 * *agrees* would let a whole class of record sit in the corpus checked by
 * nothing and looking checked; it is named instead, and TP6 counts it.
 */
function agreement(
  rec: ProbeRecord,
): Readonly<{ agreement: Agreement; table: TerminalCapabilities["imageProtocol"]; why: string }> {
  const env: NodeJS.ProcessEnv = {
    ...(rec.term === undefined ? {} : { TERM: rec.term }),
    ...(rec.program === undefined ? {} : { TERM_PROGRAM: rec.program }),
  };
  const table = detectCapabilities(env).capabilities.imageProtocol;
  const speaks = rec.reply === "OK";
  const who = `${rec.emulator ?? rec.program ?? rec.term ?? "?"} (${rec.file})`;
  if (table !== "none" && table !== "kitty") {
    return { agreement: "asks a different question", table, why: `${who}: the table says ${table}` };
  }
  if (speaks && table === "none") {
    return {
      agreement: "disagrees",
      table,
      why:
        `${who} answered OK to a kitty graphics transmission and the table says ` +
        `imageProtocol: "none". The table is behind a measurement — move the row ` +
        `in src/terminal/capabilities.ts's IMAGE_PROTOCOL and widen C02 T1.7.`,
    };
  }
  if (!speaks && table === "kitty") {
    return {
      agreement: "disagrees",
      table,
      why:
        `${who} answered ${rec.reply} and the table claims imageProtocol: "kitty". ` +
        `A wrong "kitty" draws *nothing* — placeholders address an image the ` +
        `terminal never received — so this is the loud direction and the table is wrong.`,
    };
  }
  return { agreement: "agrees", table, why: `${who}: ${rec.reply} against ${table}` };
}

describe("tools/terminal-probe/results — the verdicts, read back (F1060)", () => {
  it("TP6: the corpus is non-empty and both arms of the comparison are exercised by real records", () => {
    // **The control, and it is what makes TP7 able to say anything.** A loop over
    // an empty directory passes, and an exit status is the same bit for *clean*
    // and for *the case list was empty* — the mistake three instruments in this
    // repository made in one session. So the corpus is asserted present, and
    // then asserted to contain a record on **each** arm: a terminal that answers
    // the protocol and one that does not. With only `OK` records a comparator
    // that never fires on the refusing arm would look identical to this one.
    const all = records();
    expect(all.length, "no probe reports in tools/terminal-probe/results/").toBeGreaterThan(0);

    const speaking = all.filter((r) => r.reply === "OK");
    const refusing = all.filter((r) => r.reply !== "OK");
    expect(speaking.map((r) => r.file), "a record from a terminal that speaks the protocol").not.toEqual([]);
    expect(refusing.map((r) => r.file), "a record from one that does not — XTerm is the negative control").not.toEqual([]);

    // Every record classified, so a record the row cannot compare is *named*
    // rather than counted as agreement. `asks a different question` is legal and
    // has no member today; the day one arrives a reader sees it in this message.
    const byArm = all.map((r) => `${r.file}: ${agreement(r).agreement}`);
    expect(byArm.filter((s) => s.includes("asks a different question")), byArm.join("; ")).toEqual([]);
  });

  it("TP7 (C02 I9, F415, F1060): every recorded verdict agrees with the shipped image-protocol table", () => {
    // **This is the loop the table's comment claimed and did not have.** It
    // fails on the day someone runs the probe in WezTerm or Windows Terminal and
    // the answer is not the `none` the table carries — which is what makes those
    // two rows a deferral with an instrument rather than a deferral with a hope.
    //
    // **It is not an absence assertion, deliberately.** *There is no recorded
    // verdict for WezTerm* would pass hardest on the day one appeared, and would
    // pass for the wrong reason on any day the directory could not be read. This
    // asserts over the records that exist, and the same event — a WezTerm record
    // landing — is what turns it red.
    const disagreeing = records().map(agreement).filter((a) => a.agreement === "disagrees");
    expect(disagreeing.map((a) => a.why), "a recorded verdict disagrees with IMAGE_PROTOCOL").toEqual([]);
  });

  it("TP8 (F1060): the comparison is shown to fire, in both directions, before it is trusted", () => {
    // **A fixture must be shown to respond to the thing under test before it is
    // asserted against.** TP7 is green today because three real records agree;
    // it would be green in exactly the same way if `agreement` returned
    // `"agrees"` unconditionally. These two records are fabricated — nobody has
    // measured either terminal — and each drives one arm.
    const measuredOnATableThatSaysNone = agreement({
      file: "fabricated-wezterm.txt",
      term: "xterm-256color",
      program: "WezTerm",
      emulator: "WezTerm(20240203)",
      reply: "OK",
    });
    expect(measuredOnATableThatSaysNone.table, "the table's unmeasured arm").toBe("none");
    expect(measuredOnATableThatSaysNone.agreement).toBe("disagrees");
    expect(measuredOnATableThatSaysNone.why).toContain("behind a measurement");

    const claimedOnATerminalThatRefused = agreement({
      file: "fabricated-kitty.txt",
      term: "xterm-kitty",
      program: undefined,
      emulator: "kitty(0.41.1)",
      reply: "NO RESPONSE",
    });
    expect(claimedOnATerminalThatRefused.table, "the table's claimed arm").toBe("kitty");
    expect(claimedOnATerminalThatRefused.agreement).toBe("disagrees");
    expect(claimedOnATerminalThatRefused.why).toContain("draws *nothing*");

    // The control for both: the same function, on a record that does agree.
    expect(
      agreement({ file: "control.txt", term: "xterm", program: undefined, emulator: "XTerm(398)", reply: "NO RESPONSE" })
        .agreement,
    ).toBe("agrees");
  });

  it("TP9 (F1060): the reader's labels are the ones `probe.py` emits, on stripped source", () => {
    // **The parser and the emitter are in two languages, so there is no symbol
    // to share and no type to break.** Reformat the report's header and TP7 goes
    // on passing over records it can no longer read — the parser finds nothing,
    // the corpus reads as empty, and TP6 is the only thing between that and a
    // silent pass. This pins the four strings the parser matches to the four
    // expressions that write them.
    //
    // **Stripped, because the best-documented file fails hardest.** `probe.py`'s
    // own docstrings now explain the results contract at length and name
    // `results/` several times; an assertion satisfied by prose measures the
    // prose. Comments and docstrings go first, then the labels are looked for in
    // what is left.
    const raw = readFileSync(join(ROOT, "tools/terminal-probe/probe.py"), "utf8");
    const code = raw.replace(/"""[\s\S]*?"""/gu, "").replace(/(^|\s)#.*$/gmu, "$1");
    expect(code.includes("results contract"), "the docstrings are gone").toBe(false);

    for (const emit of [
      'log(f"TERM             {os.environ.get(\'TERM\', \'?\')}")',
      'log(f"EMULATOR         {EMULATOR}")',
      '  1x1 direct RGB query  ->  ',
    ]) {
      expect(code.includes(emit), `probe.py still writes ${emit}`).toBe(true);
    }
    // The header block is column-0 labels and the parser anchors on that; an
    // indented `TERM_PROGRAM` would match nothing.
    expect(code).toContain('log(f"TERM_PROGRAM     {os.environ.get(\'TERM_PROGRAM\', \'?\')}');

    // **And the default output path, which is the whole of the contract.** The
    // argument keeps its meaning; bare writes into the corpus TP7 reads. A
    // `probe.py` that went back to requiring the argument would leave TP7 with a
    // directory nothing ever adds to — green forever, watching nothing.
    expect(code).toContain("if len(argv) > 1:");
    expect(code).toContain('os.path.join(RESULTS, (slug or "unknown") + ".txt")');
  });

  it("TP10 (F1060): the parser is pinned to the records it was written from, and to the shape with no EMULATOR line", () => {
    // **Written because a mutation survived.** Deleting `field`'s mapping of the
    // probe's `?` — what it logs for an unset variable — onto *no value* failed
    // nothing across TP6, TP7, TP8 and TP9. It is not inert: with `?` kept as a
    // program name the red row's own message names the probe's placeholder
    // instead of the terminal, and a red row that misnames its subject is a
    // reproduction spent. The clause stays and this is what can see it.
    //
    // **The three real records are the parser's evidence, asserted by name.**
    // Not by equality over the directory — a fourth terminal arriving must flow
    // into TP6 and TP7 rather than breaking a row about the parser — but each of
    // the three is required, so deleting one takes its evidence with it.
    const byFile = new Map(records().map((r) => [r.file, r]));
    expect(byFile.get("ghostty-1.3.1.txt"), "the run that put Ghostty on the kitty arm (F415)").toEqual({
      file: "ghostty-1.3.1.txt",
      term: "xterm-ghostty",
      program: "ghostty",
      // Predates the version query, which is why the field is optional.
      emulator: undefined,
      reply: "OK",
    });
    expect(byFile.get("kitty-0.41.1.txt"), "kitty under Xvfb — sets no TERM_PROGRAM at all").toEqual({
      file: "kitty-0.41.1.txt",
      term: "xterm-kitty",
      program: undefined,
      emulator: "kitty(0.41.1)",
      reply: "OK",
    });
    expect(byFile.get("xterm-398.txt"), "the negative control — the protocol is not there to speak").toEqual({
      file: "xterm-398.txt",
      term: "xterm",
      program: undefined,
      emulator: "XTerm(398)",
      reply: "NO RESPONSE",
    });

    // The shape every record had before the version query landed: no EMULATOR
    // line and a `?` where the environment said nothing.
    const legacy = parseRecord(
      "old-format.txt",
      [
        "TERM             xterm-kitty",
        "TERM_PROGRAM     ? ",
        "size             80 x 24 cells",
        "",
        "-- kitty graphics support ----------------------------------------------",
        "  1x1 direct RGB query  ->  OK",
      ].join("\n"),
    );
    expect(legacy.program, "`?` is the probe's placeholder, not a program named `?`").toBeUndefined();
    expect(legacy.emulator, "absent, and absent is legal").toBeUndefined();
    expect(agreement(legacy).agreement, "identified by TERM alone, and the table knows it").toBe("agrees");
    expect(agreement(legacy).why, "the message names the terminal").toContain("xterm-kitty");
  });
});
