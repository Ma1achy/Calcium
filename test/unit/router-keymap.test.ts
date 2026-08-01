/**
 * C16 §6 — the keymap as data. Tiers 1, 2 and 3.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
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
      "prompt s+enter": ["\u001b[13;2u", "\u001b[27;2;13~"],
      "prompt m+enter": ["\u001b\r"],
      "prompt c+j": ["\n"],

      // C19 §6's seven. Written with `\u001b` rather than a raw byte: the two
      // rows above carry literal escapes and read as `[13;2u` on every screen
      // they are shown on, which is SS43's argument arriving in a directory the
      // rule does not scan.
      "prompt tab": ["\t"],
      // Both forms: `\u001bOC` is what a terminal in application cursor mode
      // sends, and a rule satisfied by only the normal form is satisfied on half
      // the terminals — which is exactly how Shift-Enter came to be unreachable.
      "prompt right": ["\u001b[C", "\u001bOC"],
      "overlay tab": ["\t"],
      "overlay down": ["\u001b[B", "\u001bOB"],
      "overlay up": ["\u001b[A", "\u001bOA"],
      "overlay enter": ["\r"],
      // **A lone `Esc` is the one form that needs time.** The same byte begins
      // every sequence above, so it is held for the disambiguation window and
      // the key arrives from `poll` once the window closes. A fixed clock cannot
      // express that, which is why the loop below steps one.
      "overlay escape": ["\u001b"],

      // C20's four. The arrows carry both forms for the reason the `right`
      // row above gives — a rule satisfied by only the normal form is
      // satisfied on half the terminals — and `\u0012` is Ctrl-R, a byte
      // rather than a name a terminal has to be persuaded to send.
      "prompt up": ["\u001b[A", "\u001bOA"],
      "prompt down": ["\u001b[B", "\u001bOB"],
      "prompt c+r": ["\u0012"],
      "overlay c+r": ["\u0012"],

      // C17's editing set (I21). **This table is the check the ruling asked
      // for**, and it earned it: every meta form here is one a terminal has to
      // be persuaded to send, and a binding whose wire form nobody could name
      // is the fourteen-unexecuted-bindings defect arriving from the other end.
      "prompt backspace": ["\u007f"],
      "prompt c+h": ["\u0008"],
      "prompt delete": ["\u001b[3~"],
      "prompt c+w": ["\u0017"],
      // ESC-prefixed, which is how a terminal sends a meta-modified key when it
      // has no `modifyOtherKeys` — and the decoder's 50 ms window is what tells
      // it from a lone `Esc` followed by a keystroke.
      "prompt m+backspace": ["\u001b\u007f"],
      "prompt m+d": ["\u001bd"],
      "prompt c+u": ["\u0015"],
      "prompt c+k": ["\u000b"],
      "prompt c+y": ["\u0019"],
      "prompt c+a": ["\u0001"],
      "prompt c+e": ["\u0005"],
      // Both forms, for the reason the arrows above carry both.
      "prompt home": ["\u001b[H", "\u001b[1~"],
      "prompt end": ["\u001b[F", "\u001b[4~"],
      "prompt m+b": ["\u001bb"],
      "prompt m+f": ["\u001bf"],
      "prompt c+left": ["\u001b[1;5D"],
      "prompt c+right": ["\u001b[1;5C"],
      "prompt left": ["\u001b[D", "\u001bOD"],
      // The byte that would be SIGTSTP if raw mode did not clear `ISIG`, which
      // is why this row exists rather than a reasoned assurance.
      "prompt c+z": ["\u001a"],
      "prompt m+z": ["\u001bz"],

      // The live block (I22). `escape` needs the disambiguation window to
      // close, like `overlay escape` above.
      "liveBlock escape": ["\u001b"],
      "liveBlock down": ["\u001b[B", "\u001bOB"],
      "liveBlock up": ["\u001b[A", "\u001bOA"],
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
        // A steppable clock rather than a constant, because a lone `Esc` is
        // decidable only once the disambiguation window closes — the byte that
        // means "escape" is the byte that begins every other sequence here.
        // Everything else answers on `push` and is unaffected by the advance.
        let t = 1_000;
        const decoder = createDecoder({
          capabilities: { bracketedPaste: true, mouse: true },
          now: () => t,
        });
        const pushed = decoder.push(enc.encode(seq));
        t += 1_000;
        const events = [...pushed, ...decoder.poll()];
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

describe("C16 I17 — the rule, over the half a table walk cannot reach", () => {
  it("T2.13b (I17): every `key.name` literal in src/ names a key the decoder emits", () => {
    // **T2.13 walks `defaultKeymap`; this walks the source.** The rule says "a
    // key the keymap can name must be a key the decoder produces", and its
    // mechanism only ever covered names in the table. The fourth instance was
    // `key.name === "return"` in C22's prompt handler, against a decoder that
    // has only ever emitted `enter` — so Enter did not submit, and no walk of
    // the keymap could have reached the comparison.

    // **Collected by pressing, never declared.** A list written here is a
    // second table to drift from the decoder, which is the defect the rule is
    // about. So the set is whatever the real decoder emits for a corpus of the
    // wire forms terminals send.
    const enc = new TextEncoder();
    const ESC = "\u001b";
    const corpus: string[] = [];
    for (let b = 1; b <= 0x7f; b += 1) corpus.push(String.fromCharCode(b));
    for (const final of "ABCDFHPQRS") corpus.push(`${ESC}[${final}`, `${ESC}O${final}`);
    for (let n = 1; n <= 34; n += 1) corpus.push(`${ESC}[${String(n)}~`);
    for (const code of [13, 9, 27, 32, 65, 97]) {
      corpus.push(`${ESC}[${String(code)};2u`, `${ESC}[27;2;${String(code)}~`);
    }

    const produced = new Set<string>();
    for (const seq of corpus) {
      let t = 1_000;
      const decoder = createDecoder({
        capabilities: { bracketedPaste: true, mouse: true },
        now: () => t,
      });
      const pushed = decoder.push(enc.encode(seq));
      t += 1_000;
      for (const e of [...pushed, ...decoder.poll()]) {
        if (e.kind === "key") produced.add(e.key.name);
      }
    }

    // The fixture responds before it is asserted against: a corpus that decoded
    // to nothing would make every literal below "not produced" and the test
    // would fail for the wrong reason, or — worse, with the assertion inverted
    // — pass having checked nothing.
    expect(produced.has("enter"), "the corpus reaches the decoder").toBe(true);
    expect(produced.has("return"), "and `return` is not a name it emits").toBe(false);

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = `${dir}/${entry}`;
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".ts")) files.push(path);
      }
    };
    walk("src");

    const offenders: string[] = [];
    let scanned = 0;
    // `key.name`, `e.key.name`, `k.name` — the comparison, not the assignment,
    // because the decoder itself is where these names are *made*.
    const literal = /\bkey\.name\s*[=!]==?\s*"([^"]*)"/g;
    for (const file of files) {
      if (file.endsWith("src/interaction/router/decode.ts")) continue; // where they come from
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(literal)) {
        const name = m[1] ?? "";
        scanned += 1;
        if (!produced.has(name)) offenders.push(`${file}: "${name}"`);
      }
    }

    // **A floor, because zero literals passes exactly like zero offenders.**
    // The comparisons are real and in two files — the scroll table and the
    // Ctrl-C rungs — so a regex that stopped matching would otherwise report a
    // clean tree. A03 §2's vacuity class, applied to this test.
    expect(scanned, "the scan found the comparisons it exists to read").toBeGreaterThan(5);
    expect(offenders, "a key nothing can press").toEqual([]);
  });
});
