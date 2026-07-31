/**
 * C16 §6 — the keymap as data. Tiers 1, 2 and 3.
 */

import { describe, expect, it } from "vitest";

import { createKeymap, KeymapError, defaultKeymap } from "../../src/interaction/router/keymap.js";
import { createDecoder } from "../../src/interaction/router/decode.js";
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

describe("§6 — the default table (C17 I12)", () => {
  it("T2.11 (C17 I12): three newline bindings, two of them terminal-independent", () => {
    // Asserted against `defaultKeymap` rather than a table the test writes.
    // A fixture keymap here would assert nothing about what ships: the point of
    // I12 is that the rows exist in the table `/help` renders and dispatch
    // resolves, and a test that builds its own has checked its own arithmetic.
    const newline = defaultKeymap.filter((b) => b.action === "insertNewline");

    expect(newline, "three bindings — C17 §4").toHaveLength(3);

    // Both halves of I12, and they count different things. Shift-Enter is the
    // one many terminals cannot distinguish, so it cannot be one of the two
    // that always work; an assertion on the count alone passes with it removed,
    // and one on the reliable pair alone passes with it the only row.
    const independent = newline.filter((b) => b.key.shift !== true);
    expect(independent, "at least two that no terminal can fail to send").toHaveLength(2);
    expect(
      independent.map((b) => `${b.key.ctrl === true ? "ctrl-" : "meta-"}${b.key.name}`).sort(),
      "Alt-Enter and Ctrl-J",
    ).toEqual(["ctrl-j", "meta-enter"]);
    expect(
      newline.some((b) => b.key.shift === true && b.key.name === "enter"),
      "and Shift-Enter, for the terminals that do distinguish it",
    ).toBe(true);
  });

  it("T2.13 (I17): every default binding is a key the decoder can actually produce", () => {
    // **T2.12 constructs the Key from the binding, which is the shape that
    // hides this entirely**: a row saying `{name: "\r"}` resolves perfectly
    // against a Key built from `{name: "\r"}`. I17 is the other direction — a
    // key the keymap can name must be a key the *decoder* produces — and the
    // only way to ask it is to send the bytes a terminal sends and see what
    // comes out.
    //
    // It has now found three. `\n` decoded to `enter`, so Ctrl-J's row
    // resolved against an event nothing could send. The meta branch passed its
    // character through raw, so Alt-Enter arrived as `{name: "\r", meta}`.
    // And Shift-Enter's two wire forms — `CSI 13;2u` and xterm's
    // `CSI 27;2;13~` — were both discarded as well-formed-but-unknown, which
    // made the row unreachable in every terminal that sends it.
    //
    // **A binding with no byte sequence here fails**, and that is the check
    // rather than an inconvenience: a row nobody can name the wire form of is a
    // row nobody can press.
    const BYTES: Record<string, readonly string[]> = {
      // Both forms, because a terminal sends one or the other and a rule
      // satisfied by either is satisfied on half the terminals.
      "prompt s+enter": ["[13;2u", "[27;2;13~"],
      "prompt m+enter": ["\r"],
      "prompt c+j": ["\n"],
    };

    const keymap = createKeymap(defaultKeymap);
    const enc = new TextEncoder();

    for (const b of defaultKeymap) {
      const mods =
        (b.key.ctrl === true ? "c" : "") +
        (b.key.meta === true ? "m" : "") +
        (b.key.shift === true ? "s" : "");
      const slot = `${b.target} ${mods === "" ? "" : `${mods}+`}${b.key.name}`;
      const sequences = BYTES[slot];

      expect(sequences, `${slot} has no wire form — nobody can press it`).toBeDefined();

      for (const seq of sequences ?? []) {
        const decoder = createDecoder({
          capabilities: { bracketedPaste: true, mouse: true },
          now: () => 1_000,
        });
        const events = decoder.push(enc.encode(seq));
        const keys = events.filter((e) => e.kind === "key");

        expect(keys, `${slot}: ${JSON.stringify(seq)} decodes to one key`).toHaveLength(1);
        const decoded = keys[0];
        if (decoded?.kind !== "key") continue;
        expect(keymap.resolve(b.target, decoded.key), `${slot}: ${JSON.stringify(seq)}`).toBe(b);
      }
    }
  });

  it("T2.12: every default binding resolves to the object the table holds", () => {
    // The anti-drift property, on the rows that ship. `/help` traverses the same
    // objects dispatch returns (module note), so identity is what makes "a
    // binding help shows is a binding dispatch would resolve" checkable.
    const keymap = createKeymap(defaultKeymap);

    for (const b of defaultKeymap) {
      const resolved = keymap.resolve(b.target, {
        name: b.key.name,
        ctrl: b.key.ctrl ?? false,
        meta: b.key.meta ?? false,
        shift: b.key.shift ?? false,
        sequence: b.key.name,
      });
      expect(resolved, `${b.target}:${b.key.name} resolves`).toBe(b);
    }
  });
});
