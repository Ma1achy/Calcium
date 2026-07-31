/**
 * C16 §6 — the keymap as data. Tiers 1, 2 and 3.
 */

import { describe, expect, it } from "vitest";

import { createKeymap, KeymapError } from "../../src/interaction/router/keymap.js";
import type { Binding, Key } from "../../src/interaction/router/types.js";

const k = (name: string, mods: Partial<Key> = {}): Key => ({
  name,
  ctrl: false,
  meta: false,
  shift: false,
  sequence: name,
  ...mods,
});

const bind = (target: Binding["target"], name: string, action: string, mods = {}): Binding => ({
  target,
  key: { name, ...mods },
  action,
});

describe("C16 §6 — construction", () => {
  it("T2.4 (I10): a duplicate (target, key) fails at construction, naming both", () => {
    let raised: unknown;
    try {
      createKeymap([bind("prompt", "a", "first"), bind("prompt", "a", "second")]);
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(KeymapError);
    const message = String((raised as Error).message);
    expect(message, "the winner").toContain("first");
    expect(message, "and the loser — naming one sends the reader after a binding that is fine")
      .toContain("second");
  });

  it("modifiers are part of the identity, so ctrl-a and a are not a duplicate", () => {
    expect(() =>
      createKeymap([bind("prompt", "a", "plain"), bind("prompt", "a", "ctrl", { ctrl: true })]),
    ).not.toThrow();
  });

  it("the same key on two targets is not a duplicate", () => {
    expect(() =>
      createKeymap([bind("prompt", "down", "enterBlock"), bind("overlay", "down", "menuNext")]),
    ).not.toThrow();
  });
});

describe("C16 §6 — precedence, not merely presence", () => {
  it("a block binding wins over a base liveBlock binding of a different key set", () => {
    // **The order test, not the membership test** (A03 §2). Asserting that every
    // binding resolves says nothing about which one wins where two could — and
    // the keymap is a table with precedence, so that is the property.
    const map = createKeymap([bind("liveBlock", "j", "moveDown")]);
    expect(map.resolve("liveBlock", k("j"))?.action).toBe("moveDown");

    map.mergeBlock([{ key: { name: "s" }, action: "sort" }]);
    expect(map.resolve("liveBlock", k("s"))?.action, "block binding is live").toBe("sort");
    expect(map.resolve("liveBlock", k("j"))?.action, "base binding survives the merge").toBe(
      "moveDown",
    );
  });

  it("a withdrawn block keymap stops resolving, and the base is untouched", () => {
    const map = createKeymap([bind("liveBlock", "j", "moveDown")]);
    const withdraw = map.mergeBlock([{ key: { name: "s" }, action: "sort" }]);

    withdraw();
    expect(map.resolve("liveBlock", k("s")), "s does nothing once the block freezes").toBeNull();
    expect(map.resolve("liveBlock", k("j"))?.action).toBe("moveDown");
  });

  it("a second block replaces the first rather than accumulating", () => {
    const map = createKeymap([]);
    map.mergeBlock([{ key: { name: "s" }, action: "sortA" }]);
    map.mergeBlock([{ key: { name: "f" }, action: "filterB" }]);

    expect(map.resolve("liveBlock", k("s")), "the older block's binding is gone").toBeNull();
    expect(map.resolve("liveBlock", k("f"))?.action).toBe("filterB");
  });
});

describe("C16 §6 — two checks, two moments", () => {
  it("a block colliding with a global is refused at commit time, not at startup", () => {
    // The two paths are separate deliberately: this one runs per committed block
    // over adapter-produced data while a session is live, and can only run then
    // because the block does not exist until it is committed. A single check
    // covering both would have to run at this later moment, letting a duplicate
    // in the default keymap reach a user's session first.
    const map = createKeymap([bind("global", "s", "themeSwitch")]);
    expect(map.resolve("global", k("s"))?.action, "construction was fine").toBe("themeSwitch");

    expect(() => map.mergeBlock([{ key: { name: "s" }, action: "sort" }])).toThrow(KeymapError);
    expect(map.resolve("liveBlock", k("s")), "and nothing was shadowed").toBeNull();
  });

  it("the global wins loudly rather than being silently shadowed", () => {
    const map = createKeymap([bind("global", "q", "quit")]);
    try {
      map.mergeBlock([{ key: { name: "q" }, action: "blockQuit" }]);
      expect.unreachable("the collision must be refused");
    } catch (e) {
      expect(String((e as Error).message)).toContain("quit");
    }
  });
});

describe("C16 §6 — /help renders from the table dispatch uses", () => {
  it("T4.9: entries() returns the very objects resolve() returns", () => {
    // **Identity, not equality.** The anti-drift property is satisfiable two ways
    // — the same lookup, or a second one that agrees today — and comparing two
    // results cannot tell them apart. A help renderer that walked its own copy
    // would produce equal objects and fail this.
    const map = createKeymap([
      bind("prompt", "tab", "complete"),
      bind("global", "q", "quit", { ctrl: true }),
    ]);
    map.mergeBlock([{ key: { name: "s" }, action: "sort" }]);

    const listed = map.entries();
    expect(listed.length, "base bindings and the live block's").toBe(3);

    for (const entry of listed) {
      const resolved = map.resolve(entry.target, k(entry.key.name, entry.key));
      expect(resolved, `/help lists ${entry.action}, which dispatch must resolve`).toBe(entry);
    }
  });

  it("a binding withdrawn from dispatch disappears from help in the same call", () => {
    const map = createKeymap([bind("prompt", "tab", "complete")]);
    const withdraw = map.mergeBlock([{ key: { name: "s" }, action: "sort" }]);
    expect(map.entries().some((e) => e.action === "sort")).toBe(true);

    withdraw();
    expect(map.entries().some((e) => e.action === "sort"), "help cannot outlive dispatch").toBe(
      false,
    );
  });
});
