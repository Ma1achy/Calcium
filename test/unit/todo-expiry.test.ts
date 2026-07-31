// A deferral that cannot outlive its reason.
//
// The guard itself is `tools/enforce/todo-expiry.mjs`. This file does two
// things: runs it against the real tree, and runs it against fabricated input
// to show it fires. The second is not belt-and-braces — it is the whole lesson
// of SS26, which scoped itself to a directory that did not exist and reported
// compliance for a day. A rule with nothing to be wrong about passes exactly
// like a rule that is satisfied.
import { describe, expect, it } from "vitest";
import {
  ACKNOWLEDGED_BACKLOG,
  backlogKey,
  blockerClause,
  blockersIn,
  checkSourceMap,
  checkSurfaceDeferrals,
  checkTodoExpiry,
  collectTodos,
  COMPONENT_SOURCES,
  KIND_OF_COMPONENT,
  LAYER_SOURCES,
  todoTitles,
} from "../../tools/enforce/todo-expiry.mjs";

describe("todo expiry", () => {
  it("TD0: the real tree's expired deferrals are exactly the acknowledged backlog", () => {
    // This file is excluded from the sweep, and the exclusion is load-bearing
    // rather than convenient: the fixtures below are `it.todo` calls in source
    // text, indistinguishable to `collectTodos` from real deferrals. C10 landing
    // expired one of them, which would have made a rule about the tree fail on
    // its own test data. A file whose job is to fabricate todos is not a source
    // of real ones — the same reason the enforce fire-tests fabricate paths
    // rather than reading the tree.
    const violations = checkTodoExpiry(
      collectTodos("test").filter((e) => !e.file.endsWith("todo-expiry.test.ts")),
    );
    const seen = violations.map(backlogKey);

    // Equality, not superset. A new expiry fails because it is not in the list;
    // a resolved one fails because it still is. An exemption list that only
    // grew would be the silent-forever gap this whole rule exists to close.
    expect(
      seen.sort(),
      violations.map((v) => v.message).join("\n"),
    ).toEqual([...ACKNOWLEDGED_BACKLOG].sort());
  });

  it("TD0's key sees a third deferral join two that were acknowledged", () => {
    // **The case the old key could not see.** A row was `"<rule> <file>"`, so
    // every deferral in one file collapsed into one string: two acknowledged
    // and three produced the same key, and a third would have inherited an
    // exemption argued for two. An exemption list that cannot see itself grow
    // is the thing this list exists to prevent.
    //
    // Fabricated rather than waiting for it, because the failure mode is
    // silence: nothing would have reported the third.
    const twoInOneFile = [
      { file: "test/a.test.ts", title: "T9.1: a — waits on C99" },
      { file: "test/b.test.ts", title: "T9.2: b — waits on C99" },
    ];
    const map = { C99: "src/shell/session.ts" };
    const built = () => true;

    const two = checkTodoExpiry(twoInOneFile, map, built).map(backlogKey);
    expect(two, "the count is in the key").toEqual(["TD2 src/shell/session.ts (2)"]);

    const three = checkTodoExpiry(
      [...twoInOneFile, { file: "test/c.test.ts", title: "T9.3: c — waits on C99" }],
      map,
      built,
    ).map(backlogKey);

    expect(three).toEqual(["TD2 src/shell/session.ts (3)"]);
    expect(three, "so an equality against the acknowledged two fails").not.toEqual(two);
  });

  it("a rule with no count keeps the plain key", () => {
    // TD1, TD3 and TD4 report per file and have no count, so their keys are
    // unchanged — the count is TD2's identity, not a new format for everyone.
    expect(backlogKey({ rule: "TD1", file: "test/x.test.ts" })).toBe("TD1 test/x.test.ts");
  });

  it("TD3: every path the map names exists", () => {
    // The rule's own vacuity, closed. `defaultIsImplemented` returns false for a
    // file that is not there, so a mapped path that never existed reports "not
    // implemented" forever and every deferral waiting on that component is exempt
    // — silently, and for the same reason SS26 passed: the check cannot find the
    // thing it was asked about.
    //
    // C07 was the live instance, mapping to `src/data/adapters.ts` while C07 landed
    // as `adapters/index.ts`.
    const violations = checkSourceMap();
    expect(violations.map((v) => `${v.rule} ${v.file}`), violations.map((v) => v.message).join("\n")).toEqual([]);
  });

  it("TD3 fires: a mapped path that does not exist, and an excuse that has expired", () => {
    const missing = checkSourceMap({ C99: "src/nowhere/at-all.ts" }, {}, () => false);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.rule).toBe("TD3");
    expect(missing[0]?.message).toContain("silently exempt");

    // And the other direction, which is what stops the exception list outliving its
    // reason: a component listed unscaffolded whose file now exists.
    const arrived = checkSourceMap({ C99: "src/somewhere/real.ts" }, { C99: "not yet" }, () => true);
    expect(arrived).toHaveLength(1);
    expect(arrived[0]?.message).toContain("stops being an absence");

    // A genuine absence, excused: no violation either way.
    expect(checkSourceMap({ C99: "src/later.ts" }, { C99: "not yet" }, () => false)).toEqual([]);
  });

  it("TD1 fires: a todo whose blocker is not a recognisable id", () => {
    // The typo case, and the reason this direction exists. `CO9` — letter O,
    // not zero — is a blocker that can never be satisfied, so without this rule
    // the test it guards is exempt forever and nothing ever says so.
    const violations = checkTodoExpiry([
      { file: "test/unit/fake.test.ts", title: "T9.9: something — waits on CO9" },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("TD1");
    expect(violations[0]?.message).toContain("exempts a test forever");
  });

  it("TD1 fires: a todo naming a component with no map entry", () => {
    const violations = checkTodoExpiry([
      { file: "test/unit/fake.test.ts", title: "T9.9: something — waits on C99" },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("TD1");
    expect(violations[0]?.message).toContain("C99");
  });

  it("TD2 fires: a todo waiting on a component that is now implemented", () => {
    // The notification nobody would otherwise send. C01 is real and built, so a
    // test still waiting on it is a test whose reason has expired.
    const violations = checkTodoExpiry([
      { file: "test/unit/fake.test.ts", title: "T9.1: a — waits on C01" },
      { file: "test/edge/fake.test.ts", title: "T9.2: b — waits on C01" },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("TD2");
    expect(violations[0]?.message).toContain("C01 is implemented");
    expect(violations[0]?.message).toContain("2 tests");
  });

  it("TD2 does not fire on a stub: existence is not implementation", () => {
    // The repo ships every component as a stub file exporting nothing. If mere
    // existence counted, this rule would fail on all twenty-five the day it
    // landed and be deleted the same afternoon.
    // **Synthetic, and it has to be.** This named C14, then C15, and each time
    // the named component landed the test asserting "a stub has not expired"
    // was pointing at one that had — silently, because a fixture that stops
    // exercising its case does not fail, it just stops. That is the inverse of
    // a self-expiring record: validity resting on a fact about the tree that
    // changes. C99 can never be built, so this is stable for the life of the
    // project and nobody has to move it a third time.
    const stubbed = checkTodoExpiry(
      [{ file: "test/unit/fake.test.ts", title: "T9.3: c — waits on C99" }],
      { C99: "test/support/scaffold.ts" },
      // The real predicate, against a real file holding only `export {}`.
      undefined,
    );

    expect(stubbed, "C99's file is a scaffold, so nothing has expired").toEqual([]);
  });

  it("a map entry with no deferred tests is not a violation", () => {
    expect(checkTodoExpiry([])).toEqual([]);
  });

  it("parses the forms actually used in this repo", () => {
    expect(blockersIn("T4.4: a — waits on C13 and C14")).toEqual(["C13", "C14"]);
    expect(blockersIn("T5.3: b — waits on C09")).toEqual(["C09"]);

    // Ids, not prose. This title names its blocker in parentheses after four
    // words of English, and an earlier parser read the English and reported a
    // component called "A".
    expect(
      blockersIn("T5.3: c — waits on a real render tree (C09) and a terminal emulator"),
    ).toEqual(["C09"]);

    // A layer is a legitimate blocker: "L4" is the shell, not one component.
    expect(blockersIn("T5.6: d — waits on the L4 shell's TTY gate")).toEqual(["L4"]);

    // An id in the *description* is not a blocker. A fail-on-revert title names
    // the edit it guards against, and that edit is usually described in terms
    // of the component the test belongs to.
    expect(
      blockersIn("T6.7: moving the registry into C04 → T2.9 fails — waits on C09 and C10"),
      "C04 is what the test is about; C09 and C10 are what it waits for",
    ).toEqual(["C09", "C10"]);

    // No declared wait at all.
    expect(blockersIn("T1.1: an ordinary test title")).toEqual([]);

    // Declares a wait, names nothing — the typo case, distinguished from the
    // no-wait case by null rather than by an empty array.
    expect(blockersIn("T9.9: e — waits on the thing that does not exist yet")).toBeNull();
  });

  it("the blocker clause ends at a sentence delimiter — one fabrication per form", () => {
    // **Three incidents, and this is the mechanism replacing the workaround.**
    // The clause read to end of line, so a sentence explaining a correction
    // parsed as part of the claim, and the standing remedy was to write the
    // explanation *before* the clause. A habit, in a project whose method is
    // that habits become mechanisms.
    //
    // A fabrication per form, because a single one proves the form it used and
    // the earlier parses each failed on a form nobody had written down.

    // 1. Single blocker, then prose naming the component it no longer waits on.
    //    This is the live incident: the restatement mentions C18 in order to
    //    say the test does not wait for it.
    expect(
      blockersIn("T4.4: routing — waits on L4, which owns it. C18 produces both results now"),
      "the sentence after the period is for the reader",
    ).toEqual(["L4"]);

    // 2. Multi-blocker, which the obvious fix — take the first identifier —
    //    breaks. C17's tier 5 needs it and there is no delimiter inside it.
    expect(blockersIn("T5.4: an undo sequence — waits on L4 and C20")).toEqual(["L4", "C20"]);

    // 3. A parenthetical clause, terminated by its own closing paren.
    expect(
      blockersIn("T5.1: typing at a prompt (waits on L4) once the shell composes"),
    ).toEqual(["L4"]);

    // 4. And the qualification the corpus forced: a paren *opened inside* the
    //    clause does not end it. Cutting at the first `)` would be harmless in
    //    the first of these and would silently drop C20 in the second — which
    //    is the exact defect this rule exists to prevent.
    expect(
      blockersIn("T5.3: c — waits on a real render tree (C09) and a terminal emulator"),
    ).toEqual(["C09"]);
    expect(blockersIn("T5.5: f — waits on L4 (the shell) and C20")).toEqual(["L4", "C20"]);

    // 5. An em dash after the clause, which is how most of these are written.
    expect(
      blockersIn("T5.2: paste — waits on L4 — the frame is what shows it"),
    ).toEqual(["L4"]);

    // 6. A period that is not a sentence end does not truncate.
    expect(blockersIn("T4.9: a — waits on C22 and src/shell/session.ts existing")).toEqual([
      "C22",
    ]);
  });

  it("the delimiter rule fires: the same title, read both ways", () => {
    // The control. Under the old parse this title yielded ["L4", "C18"], which
    // is what kept two deferrals waiting on a component that had landed — so
    // the fabrication is the *real* title, and the assertion is that it no
    // longer reads that way.
    const restated = "T4.4: routing — waits on L4, which owns it. C18 produces both results now";

    expect(blockerClause(restated.slice(restated.indexOf("waits on")))).toBe(
      "waits on L4, which owns it",
    );
    expect(blockersIn(restated)).not.toContain("C18");
  });

  it("extracts titles from every quoting style", () => {
    const source = `
      it.todo("double — waits on C09");
      it.todo('single — waits on C10');
      it.todo(\`backtick — waits on C11\`);
      it("not a todo — waits on C12", () => {});
    `;
    const titles = todoTitles(source);

    expect(titles).toHaveLength(3);
    expect(titles.some((t) => t.includes("C12")), "a real `it` is not a deferral").toBe(false);
  });

  it("two blocker ids share a path only where they genuinely arrive together", () => {
    // **The C22 instance, closed as a class.** `L4` and `C22` both pointed at
    // `src/shell/session.ts`, which is one file and two different waits: "the L4
    // shell runs" means it can execute a command, and thirty-five of the
    // thirty-five `L4` deferrals are tier-5 tests that launch a session and run
    // something. Landing C22 would have expired all of them on a component that
    // cannot run one, and the cheap repair is `ACKNOWLEDGED_BACKLOG` — the
    // exemption list that only grows, which is what TD0 asserts equality to
    // prevent.
    //
    // A collision is not wrong in itself. `L4` and `C23` share a path *because*
    // the shell running and the pipeline existing are the same event. What is
    // wrong is an undeclared one, so the permitted set is written out and
    // compared by equality: a new collision fails because it is not here, and a
    // resolved one fails because it still is.
    const permitted = [["C23", "L4", "the L4 shell runs when it can execute a command, which is C23"]];

    const all: Record<string, string> = { ...COMPONENT_SOURCES, ...LAYER_SOURCES };
    const byPath = new Map<string, string[]>();
    for (const [id, path] of Object.entries(all)) {
      byPath.set(path, [...(byPath.get(path) ?? []), id]);
    }
    const collisions = [...byPath.values()]
      .filter((ids) => ids.length > 1)
      .map((ids) => [...ids].sort().join("+"))
      .sort();

    expect(collisions).toEqual(permitted.map(([a, b]) => `${a}+${b}`).sort());

    // And the specific regression, stated rather than left to the set above:
    // whatever else moves, these two must not become one moment again.
    expect(
      LAYER_SOURCES.L4,
      "L4 and C22 mapping to one file collapses two different waits into one",
    ).not.toBe(COMPONENT_SOURCES.C22);
  });

  it("every component in the map points at a path the repo actually uses", () => {
    // The third SS26 failure: a named entity that does not exist. A map row
    // pointing at `src/presentation/blocks.ts` when the tree has
    // `src/presentation/blocks/index.ts` can never fire, whatever gets built.
    const ids = Object.keys(COMPONENT_SOURCES);

    expect(ids, "twenty-five components, C01 through C25").toHaveLength(25);
    for (const [id, path] of Object.entries(COMPONENT_SOURCES)) {
      expect(path, `${id} must name a path under src/`).toMatch(/^src\/.+\.ts$/);
    }
  });

  // --- TD4 — the blocker is the right component ----------------------------
  //
  // The half A03 §9a had recorded as having no mechanism. Both known instances
  // are surface deferrals, and both are derivable from things a surface spec
  // already states: what it composes to, and which section holds its
  // illustration.

  it("TD4: no surface deferral names the wrong component or a section with no illustration", () => {
    const violations = checkSurfaceDeferrals(
      collectTodos("test").filter((e) => !e.file.endsWith("todo-expiry.test.ts")),
    );

    expect(violations.map((v) => v.message).join("\n\n"), "TD4").toEqual("");
  });

  it("TD4 fires: S07's deferral, restored", () => {
    // **The fabricated violation is the real one**, copied from the deferral as
    // it stood rather than invented (A03 commitment 14a). A fabrication written
    // fresh is written under the same assumption as the rule; this one is written
    // under the assumption that produced the defect.
    const violations = checkSurfaceDeferrals([
      {
        file: "test/contract/surfaces.test.ts",
        title: "S07 §3's patch region composes to its illustrated rows — waits on C25",
      },
    ]);

    // Both halves fire, and they are independent findings about one deferral:
    // §3 has no illustration, and S07's stated composition has no `patch`.
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.rule === "TD4")).toBe(true);
    expect(violations[0]?.message).toContain("contains no illustration");
    expect(violations[1]?.message).toContain("wrong component");
  });

  it("TD4 fires: S09's deferral, restored", () => {
    // The first instance, and it fails on half (b) alone — S09 §2 does have an
    // illustration, which is exactly why half (a) could not have caught it and
    // why the rule needs both.
    const violations = checkSurfaceDeferrals([
      {
        file: "test/contract/surfaces.test.ts",
        title: "S04 §3 and S09 §2 compose to their illustrated rows — waits on C11 and C12",
      },
    ]);

    const messages = violations.map((v) => v.message).join("\n");
    expect(messages, "S09 has no plot").toContain("registers `plot`");
    expect(messages, "and half (a) has nothing to say about it").not.toContain(
      "S09 §2 until its illustration",
    );
  });

  it("TD4 fires: a deferral that names a surface and no section", () => {
    const violations = checkSurfaceDeferrals([
      { file: "test/contract/surfaces.test.ts", title: "S12 composes — waits on C22" },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("without naming a section");
  });

  it("TD4's kind map is the three kinds a component registers, and nothing else", () => {
    // Half (b)'s whole domain. Written out literally rather than derived from the
    // registry, for C05 T1.7c's reason: a list derived from the thing it checks
    // agrees with itself and passes on any addition.
    expect(KIND_OF_COMPONENT).toEqual({ C11: "table", C12: "plot", C25: "patch" });
  });

  it("TD4 half (b) has no live subject, and that is stated rather than assumed", () => {
    // **The honest state, asserted.** C25 is the last component that registers a
    // kind, so once its deferrals are written no surface deferral names C11, C12
    // or C25 again, and half (b) has nothing in the tree to be wrong about — the
    // failure mode A03 §2 exists to name. Half (a) applies to every surface
    // deferral there will ever be; half (b)'s evidence is the two fabrications
    // above, and this assertion is what makes the claim checkable rather than a
    // comment. It fails if a live subject appears, which is the day the note
    // above stops being true.
    const live = collectTodos("test")
      .filter((e) => !e.file.endsWith("todo-expiry.test.ts"))
      .filter((e) => /\bS\d\d\b/.test(e.title))
      .filter((e) => (blockersIn(e.title) ?? []).some((id) => KIND_OF_COMPONENT[id] !== undefined));

    expect(live.map((e) => e.title), "half (b) is running on fabrications alone").toEqual([]);
  });
});
