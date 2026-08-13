// C19 tier 1 — unit. §2's slot rules, §5's acceptance, and ghost text.
//
// §8a's traces live in `test/contract/completion.test.ts`, where the whole state
// is asserted after every step. What is here is the machinery underneath.
import { describe, expect, it } from "vitest";

import {
  accept,
  createEngine,
  flagNameSource,
  flagValueSource,
  pathSource,
  verbSource,
} from "../../src/interaction/completion/index.js";
import { fixture } from "../support/manifest.js";
import { at, CURSOR, fakeClock, fakeDirs } from "../support/completion.js";

const manifest = (): ReturnType<typeof fixture> => fixture();

const engineWith = (...sources: Parameters<ReturnType<typeof createEngine>["register"]>[0][]) => {
  const clock = fakeClock();
  const engine = createEngine({ now: clock.now });
  for (const s of sources) engine.register(s);
  return { engine, clock };
};

/**
 * A static source offering exactly these values, in this order (C19 I26's rows).
 *
 * The order is the fixture's whole point: I26 refines source order rather than
 * replacing it, so a row about ranking has to be able to say what the order was
 * before ranking, and a source that sorted its own output could not.
 */
const listSource = (id: string, values: readonly string[]) => ({
  id,
  slots: ["verb"] as const,
  dynamic: false as const,
  complete: () => values.map((value) => ({ value })),
});

const rankedWith = (
  recency: (value: string) => number | null,
  ...sources: Parameters<ReturnType<typeof createEngine>["register"]>[0][]
) => {
  const engine = createEngine({ now: fakeClock().now, recency });
  for (const s of sources) engine.register(s);
  return engine;
};

const valuesAt = (engine: ReturnType<typeof createEngine>, text: string): readonly string[] =>
  engine.suggest(at(text)).map((c) => c.value);

describe("C19 §3a — ordering", () => {
  it("T1.16 (I26): most-recently-run first, and never-run keeps source order", () => {
    // **The fourth candidate is the row that matters.** Two ranked and one
    // unranked passes under a comparator that merely sorts; what says the rule
    // is a *refinement* is that two never-run values stay in the order the
    // source gave them, which a comparator answering anything but 0 for the
    // null-null pair would scramble.
    const engine = rankedWith(
      (v) => ({ "/zebra": 100, "/alpha": 900 })[v] ?? null,
      listSource("s", ["/zebra", "/alpha", "/middle", "/omega"]),
    );
    expect(valuesAt(engine, "/‸"), "run values by recency, then source order").toEqual([
      "/alpha",
      "/zebra",
      "/middle",
      "/omega",
    ]);
  });

  it("T1.16b (I26): every candidate never run → exactly the source order", () => {
    // The fresh-session case, and the reason this landed without a second
    // ruling about ties: on day one the menu is what it was before I26.
    const values = ["/delta", "/alpha", "/charlie"];
    const ranked = rankedWith(() => null, listSource("s", values));
    const unranked = engineWith(listSource("s", values)).engine;
    expect(valuesAt(ranked, "/‸")).toEqual(values);
    expect(valuesAt(ranked, "/‸"), "and identical to an engine with no recency at all").toEqual(
      valuesAt(unranked, "/‸"),
    );
  });

  it("T1.17 (I27): a buried word is the source's model, not the filter's", () => {
    // **Written against the claim that this is a defect, and it asserts the
    // level instead.** Roadmap 31 reads *`stats` cannot find `container stats`,
    // because prefix matching cannot see a word in the middle of a name* — true
    // of `matching()` and irrelevant to it. The verb source emits ONE WORD at a
    // time (I14, C05 §2's sub-verbs), so `serving scale` is offered as
    // `/serving` and the whole name never reaches the filter. A widened
    // `matching()` would leave every line here identical.
    const { engine } = engineWith(verbSource(manifest));

    expect(valuesAt(engine, "/scale‸"), "not a first word, so not a candidate").toEqual([]);
    expect(valuesAt(engine, "/serv‸"), "the head is").toEqual(["/serving"]);

    // **And the second level is NOT reachable, which this row found by trying.**
    // `verbSource`'s own comment says *`serving scale` completes as `serving`
    // and then `scale`* — and the slot after a verb is never `verb`:
    // `context.ts:224` returns one only while `command` is true, which is the
    // first token alone. After `/serving ` the slot is `none`, because
    // `serving` resolves as a tool and has no positionals, so no source is
    // applicable and the sub-verb is uncompletable.
    //
    // Asserted as it stands rather than skipped, so **the row fails the day it
    // is fixed** and the sentence above has to be rewritten with it — a
    // deferral that expires by itself instead of an `it.todo` nobody revisits.
    // C19 §3a records it; it is not entry 31's, because widening `matching()`
    // or ranking the results changes nothing here.
    expect(at("/serving sc‸").slot.kind, "the defect, asserted so a fix breaks it").toBe("none");
    expect(valuesAt(engine, "/serving sc‸"), "so nothing completes it").toEqual([]);
  });

  it("T1.16c (I26): ranking runs after dedupe, so a shared value is ranked once", () => {
    // T3.18 gives a duplicated value to the **first** source that offered it.
    // Ranking before dedupe would sort the two copies against each other and
    // let the later source's win the position — T3.18 reversed by a step that
    // has nothing to do with it. Asserted through the count, because a wrong
    // order here is invisible while a duplicate is not.
    const engine = rankedWith(
      (v) => (v === "/shared" ? 500 : null),
      listSource("first", ["/solo", "/shared"]),
      listSource("second", ["/shared", "/other"]),
    );
    const out = valuesAt(engine, "/‸");
    expect(out.filter((v) => v === "/shared"), "one copy, not two").toHaveLength(1);
    expect(out[0], "and it ranks ahead of the never-run values").toBe("/shared");
  });
});

describe("C19 §2 — the slot the cursor is in", () => {
  it("T1.2 (I14): `/` completes the manifest and bare text the filesystem", () => {
    expect(at("/p‸").slot.kind).toBe("verb");
    expect(at("gi‸").slot.kind).toBe("executable");
  });

  it("T1.2b (I14, I5): the word after an operator is in command position", () => {
    // On a `readonly string[]` this word sits at index 2 and reads as a
    // positional. The operator token is the only thing that says otherwise.
    const ctx = at("ls | gre‸");
    expect(ctx.slot.kind).toBe("executable");
    expect(ctx.tokenIndex).toBe(2);
    expect(ctx.tokens[1]?.kind).toBe("operator");
  });

  it("T1.2c (I5): prefix and replace are in the tokeniser's coordinate system", () => {
    // The emoji is one grapheme, two code units. A grapheme-indexed cursor read
    // as a code-unit offset lands inside the surrogate pair.
    const input = "/ps --status=🙂ab";
    const ctx = at(`${input}${CURSOR}`);
    // The value is its own sub-token (§2), so `replace` starts after the `=`.
    // Read as a grapheme index, 13 would land inside the surrogate pair and the
    // slice would come back with half a character.
    expect(ctx.replace.start).toBe("/ps --status=".length);
    expect(ctx.input.slice(ctx.replace.start, ctx.replace.end)).toBe("🙂ab");
    expect(ctx.prefix).toBe("🙂ab");
  });

  it("T1.3: `--st` is a flag-name slot with the tool resolved", () => {
    const ctx = at("/ps --st‸");
    expect(ctx.slot.kind).toBe("flagName");
    expect(ctx.tool?.name).toBe("ps");
  });

  it("T1.4: `--status=` is a flag-value slot carrying that FlagDef", () => {
    const ctx = at("/ps --status=‸");
    expect(ctx.slot.kind).toBe("flagValue");
    if (ctx.slot.kind !== "flagValue") throw new Error("unreachable");
    expect(ctx.slot.flag.values).toEqual(["running", "failed", "queued"]);
  });

  it("T3.16: unbalanced quotes offer nothing rather than something wrong", () => {
    expect(at('/ps --status="run‸').slot.kind).toBe("none");
  });

  it("T3.17: the cursor at position 0 is a command position", () => {
    expect(at("‸ps --status").slot.kind).toBe("executable");
  });
});

describe("C19 §3 — candidates are projections of the manifest (I4)", () => {
  it("T1.5: flag-name candidates equal the manifest's flags, exactly", () => {
    const ctx = at("/ps --‸");
    const got = flagNameSource().complete(ctx);
    expect([...(got as readonly { value: string }[])].map((c) => c.value).sort()).toEqual(
      manifest()
        .tools.find((t) => t.name === "ps")!
        .flags.map((f) => `--${f.name}`)
        .sort(),
    );
  });

  it("T1.6: enum candidates equal the flag's values, exactly", () => {
    const ctx = at("/ps --status=‸");
    const got = flagValueSource().complete(ctx) as readonly { value: string }[];
    expect(got.map((c) => c.value)).toEqual(["running", "failed", "queued"]);
  });

  it("T4.2 (C05 I11): a hidden tool is absent from candidates", () => {
    const m = manifest();
    const hidden = m.tools.filter((t) => t.hidden === true).map((t) => t.name);
    const offered = (verbSource(() => m).complete(at("/‸")) as readonly { value: string }[]).map(
      (c) => c.value,
    );
    for (const name of hidden) expect(offered).not.toContain(`/${name}`);
    expect(hidden.length).toBeGreaterThan(0); // the fixture must actually have one
  });
});

describe("C19 §5 — acceptance (I16)", () => {
  it("T1.15b: a unique match is inserted whole with its own delimiter", () => {
    const ctx = at("/ps --mi‸");
    const bool = { value: "--mine", delimiter: " " };
    expect(accept(ctx, bool, true).text).toBe("--mine ");

    const valued = { value: "--status", delimiter: "=" };
    expect(accept(ctx, valued, true).text).toBe("--status=");

    const dir = { value: "src", delimiter: "/" };
    expect(accept(ctx, dir, true).text).toBe("src/");
  });

  it("T1.15/T6.14: a common prefix takes no delimiter, which is what reaches the menu", () => {
    const ctx = at("/ps --st‸");
    // Rule 4: the token is unfinished, so the next `Tab` widens rather than
    // moving to the next slot. Appending here is T6.14 and the menu is never
    // reached.
    expect(accept(ctx, { value: "--stat", delimiter: " " }, false).text).toBe("--stat");
  });

  it("T3.4 (I5): a candidate with a space round-trips through the quoter", async () => {
    const ctx = at("/ps ‸");
    const { text } = accept(ctx, { value: "two words", delimiter: " " }, true);
    const { tokenise } = await import("../../src/interaction/parser/index.js");
    const r = tokenise(`/ps ${text}`);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.map((t) => t.text)).toEqual(["/ps", "two words"]);
  });

  it("T3.15 (I16): inside quotes the whole span goes, so no quote is duplicated", () => {
    const ctx = at("/ps 'my fi‸le'");
    // T3.3's tail rule does not apply here: the quotes are what make the run one
    // value, and half of a quoted value is a string nobody meant.
    expect(ctx.replace).toEqual({ start: 4, end: 13 });
    expect(accept(ctx, { value: "my final", delimiter: " " }, true).text).toBe("'my final' ");
  });

  it("T3.3: outside quotes the tail after the cursor is left alone", () => {
    const ctx = at("/ps --st‸xyz");
    expect(ctx.replace.end).toBe(ctx.cursor);
    expect(ctx.input.slice(ctx.replace.end)).toBe("xyz");
  });
});

describe("C19 §4 — ghost text (I7)", () => {
  it("T1.13: a unique static match produces ghost text", () => {
    const { engine } = engineWith(flagNameSource());
    expect(engine.ghost(at("/ps --mi‸"))).toBe("ne");
  });

  it("T1.13: an ambiguous prefix produces none", () => {
    const { engine } = engineWith(flagNameSource());
    expect(engine.ghost(at("/ps --‸"))).toBeNull();
  });

  it("T1.4b (I3): a path slot has no ghost text and touches no filesystem", () => {
    const dirs = fakeDirs({ ".": [{ name: "src", directory: true }] });
    const { engine } = engineWith(pathSource(dirs.readDir));
    expect(engine.ghost(at("/deploy sr‸"))).toBeNull();
    expect(dirs.reads()).toEqual([]);
  });
});
