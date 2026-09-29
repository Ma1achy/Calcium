// C10 I70 — where the 8-bit gate runs. Not on a shipped projection, which the
// suite gates where it is built (T2.74, T2.81); on everything else.
//
// **A recording stand-in, not a fake** (`test/support/README.md`): the gate is
// the real function and runs as it would, and the stand-in only writes down
// which token objects reached it. A skip whose only effect is time has no
// other observable — the answer is the same either way, by construction — so
// the call is the subject, and the calls are counted rather than timed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeTokens } from "../../src/presentation/theme/types.js";

const seen = vi.hoisted(() => ({ tokens: [] as unknown[] }));

vi.mock("../../src/presentation/theme/resolve.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/presentation/theme/resolve.js")>();
  return {
    ...real,
    validateQuantisedFloors: (tokens: ThemeTokens) => {
      seen.tokens.push(tokens);
      return real.validateQuantisedFloors(tokens);
    },
  };
});

const { defaultTheme, loadTheme } = await import("../../src/presentation/theme/index.js");

describe("C10 I70 — the gate's scope", () => {
  beforeEach(() => {
    seen.tokens.length = 0;
  });

  it("T2.82 (C10 I70): a shipped projection is not measured at load, and anything else is — told apart by identity", () => {
    const names = Object.keys(defaultTheme);

    // The shipped set: gated at build, so not here.
    expect(loadTheme(defaultTheme).ok).toBe(true);
    expect(seen.tokens, "defaultTheme loads without the 8-bit gate").toEqual([]);

    // **The same values in other objects are a consumer's**, and measured —
    // equal content is not a shipped projection.
    const copies = Object.fromEntries(names.map((name) => [name, structuredClone(defaultTheme[name]!)]));
    expect(loadTheme(copies).ok, "the copies load").toBe(true);
    // By identity: the copies are equal in value to the table's objects, so
    // `toEqual` could not tell which reached the gate.
    expect(seen.tokens, "every copy, once").toHaveLength(names.length);
    names.forEach((name, i) => expect(seen.tokens[i], name).toBe(copies[name]));

    // **And a shipped name is not a shipped set**: one member swapped for a
    // copy is the one member measured.
    seen.tokens.length = 0;
    const dark = { ...defaultTheme["dark"]! };
    expect(loadTheme({ ...defaultTheme, dark }).ok).toBe(true);
    expect(seen.tokens, "one object").toHaveLength(1);
    expect(seen.tokens[0], "the one that is not the table's").toBe(dark);

    // **An override is never a shipped projection**, even one restating a
    // shipped value: the patched set is a new object, and it is measured.
    seen.tokens.length = 0;
    const loaded = loadTheme(defaultTheme);
    if (!loaded.ok) throw new Error("the shipped set must load");
    expect(loaded.value.applyOverrides({ surfaces: { diffAdd: defaultTheme["dark"]!.surfaces.diffAdd } })).toEqual([]);
    expect(seen.tokens, "one object").toHaveLength(1);
    expect(seen.tokens[0], "the override's tokens").toBe(loaded.value.current.tokens);
  });
});
