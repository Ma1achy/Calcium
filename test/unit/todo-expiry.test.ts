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
  blockersIn,
  checkSourceMap,
  checkTodoExpiry,
  collectTodos,
  COMPONENT_SOURCES,
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
    const seen = violations.map((v) => `${v.rule} ${v.file}`);

    // Equality, not superset. A new expiry fails because it is not in the list;
    // a resolved one fails because it still is. An exemption list that only
    // grew would be the silent-forever gap this whole rule exists to close.
    expect(
      seen.sort(),
      violations.map((v) => v.message).join("\n"),
    ).toEqual([...ACKNOWLEDGED_BACKLOG].sort());
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
    const stubbed = checkTodoExpiry(
      [{ file: "test/unit/fake.test.ts", title: "T9.3: c — waits on C14" }],
      COMPONENT_SOURCES,
      // The real predicate, against the real stub.
      undefined,
    );

    expect(stubbed, "C14 is a stub, so nothing has expired").toEqual([]);
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
});
