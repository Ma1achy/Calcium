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
