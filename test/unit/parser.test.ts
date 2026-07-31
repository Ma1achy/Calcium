// C18 tier 1 — unit. §3's tokeniser, §4's rules and §5's predicate, each
// against the smallest input that distinguishes it.
//
// The classification rows themselves live in `test/contract/parser.test.ts`,
// where §8a is replayed whole. What is here is the machinery underneath: the
// pieces a row's answer is assembled from, tested where a wrong one is legible.
import { describe, expect, it } from "vitest";

import { parse, quote, slashPolicy, tokenise } from "../../src/interaction/parser/index.js";
import type { ParseContext } from "../../src/interaction/parser/index.js";
import { fixture } from "../support/manifest.js";

const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({
  manifest: fixture(),
  binary: "widget",
  lastUuid: "web:v3",
  ...over,
});

const texts = (input: string): readonly string[] => {
  const r = tokenise(input);
  if (!r.ok) throw new Error(`tokenise failed: ${r.error.message}`);
  return r.value.map((t) => t.text);
};

const kinds = (input: string): readonly string[] => {
  const r = tokenise(input);
  if (!r.ok) throw new Error(`tokenise failed: ${r.error.message}`);
  return r.value.map((t) => t.kind);
};

describe("C18 §3 — tokenising", () => {
  it("T1.14: the eight quoting cases", () => {
    expect(texts("a b")).toEqual(["a", "b"]);
    expect(texts("'a b'")).toEqual(["a b"]);
    expect(texts('"a b"')).toEqual(["a b"]);
    expect(texts("a\\ b")).toEqual(["a b"]);
    expect(texts(`"it's"`)).toEqual(["it's"]);
    expect(texts(`'say "hi"'`)).toEqual(['say "hi"']);
    expect(texts(`a"b"c`), "adjacent runs are one token").toEqual(["abc"]);
    expect(texts(`"a\\"b"`), "an escaped quote inside quotes").toEqual(['a"b']);
  });

  it("T1.14b (§3): operators are tokens, and quoting hides them", () => {
    expect(kinds("a | b")).toEqual(["word", "operator", "word"]);
    expect(kinds('a "|" b'), "a quoted pipe is a word").toEqual(["word", "word", "word"]);
    expect(texts("a&&b"), "no whitespace needed").toEqual(["a", "&&", "b"]);
    expect(texts("a && b"), "&& is one operator, not two &").toEqual(["a", "&&", "b"]);
    expect(texts("2> out"), "a digit-prefixed redirect is a word then an operator").toEqual([
      "2",
      ">",
      "out",
    ]);
  });

  it("T1.14c (I16): a token's span is its source, quotes included", () => {
    const r = tokenise(`echo "my file"`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [, arg] = r.value;
    expect(arg?.text, "text has the quotes removed").toBe("my file");
    expect(`echo "my file"`.slice(arg?.start ?? 0, arg?.end ?? 0), "the span has them").toBe(
      `"my file"`,
    );
  });

  it("T1.14d (I7): parts record which runs expansion may touch", () => {
    const r = tokenise(`'$_'"$_"$_`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const token = r.value[0];
    expect(token?.text, "one token, three runs").toBe("$_$_$_");
    // Without this the single-quote exemption is unimplementable: all three
    // unquote to the same text, and one `quoted` boolean cannot tell them apart.
    expect(token?.parts.map((p) => p.literal)).toEqual([true, false]);
  });

  it("T1.14e: the quoter round-trips through the tokeniser", () => {
    for (const value of ["a b", "it's", "$_", "", "a|b", "n\newline", "--flag=x y"]) {
      expect(texts(quote(value)), JSON.stringify(value)).toEqual([value]);
    }
  });
});

describe("C18 §4, §5 — the rules", () => {
  it("T1.15 (I17): the rewrite predicate, all five rows", () => {
    const c = ctx();
    const command = (input: string): string => {
      const r = parse(input, c);
      return r.kind === "shell" ? r.command : `not shell: ${r.kind}`;
    };

    expect(command("/ps | cat"), "rule 4's shape").toBe("widget ps | cat");
    expect(command("/usr/bin/ls | cat"), "D23").toBe("/usr/bin/ls | cat");
    expect(command('echo "/ps" | cat'), "quoted").toBe('echo "/ps" | cat');
    expect(command("/ | cat"), "no verb after the prefix").toBe("/ | cat");
    expect(command("cd /tmp | ls"), "not in command position").toBe("cd /tmp | ls");
  });

  it("T1.16 (I18): both sides of a pipe are rewritten, and the second survives", () => {
    // The assertion that fails when the splices run first-to-last: the earlier
    // rewrite lengthens the string, and the later span then points into the
    // middle of the inserted binary.
    const r = parse("/ps | /help", ctx());
    expect(r.kind).toBe("shell");
    if (r.kind !== "shell") return;
    expect(r.command).toBe("widget ps | widget help");
  });

  it("T1.16b (I18): the splice covers one token where the match covers two", () => {
    const r = parse("/serving scale web | cat", ctx());
    expect(r.kind).toBe("shell");
    if (r.kind !== "shell") return;
    // The rewrite never asks the manifest, so `scale` is untouched text — the
    // splice boundary and findTool's longest-match boundary differ in length,
    // which is where an off-by-one would hide.
    expect(r.command).toBe("widget serving scale web | cat");
  });

  it("T1.17 (I24): an empty remainder is not a split", () => {
    const r = parse("cd /tmp &&", ctx());
    expect(r.kind, "the shell reports its own syntax error").toBe("shell");
  });

  it("T1.18 (I22): job control is refused as a first word only", () => {
    expect(parse("fg", ctx()).kind).toBe("error");
    expect(parse("echo fg", ctx()).kind).toBe("shell");
    // Quoting does not disable the refusal, because it does not disable the
    // builtin in bash either — the same answer interception gives (§4).
    expect(parse("'fg'", ctx()).kind).toBe("error");
  });

  it("T1.19 (I21): lookup reports before expansion", () => {
    const r = parse("/zzz $_", ctx({ lastUuid: null }));
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.error.code).toBe("unknown_verb");
  });

  it("T1.20 (I21): a failing validation keeps its kind and its tool", () => {
    const r = parse("/ps --status=nonsense", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    expect(r.tool.name, "L4 renders the errors and still shows what was parsed").toBe("ps");
    expect(r.validation.ok).toBe(false);
  });

  it("T1.7 (I14): a near miss suggests and a far one does not", () => {
    const near = parse("/pss", ctx());
    expect(near.kind).toBe("error");
    if (near.kind !== "error") return;
    expect(near.error.message).toContain("/ps");
    expect(near.error.details?.["suggestion"]).toBe("ps");

    const far = parse("/zzzzz", ctx());
    expect(far.kind).toBe("error");
    if (far.kind !== "error") return;
    expect(far.error.message).not.toContain("did you mean");
  });
});

describe("C18 §4 — the policy decides one thing", () => {
  it("verbOf is the whole of what a prefix rule owns", () => {
    const token = (text: string): Parameters<typeof slashPolicy.verbOf>[0] => ({
      text,
      start: 0,
      end: text.length,
      quoted: false,
      kind: "word",
      parts: [{ text, literal: false }],
    });

    expect(slashPolicy.verbOf(token("/ps"))).toBe("ps");
    expect(slashPolicy.verbOf(token("ps"))).toBeNull();
    expect(slashPolicy.verbOf(token("/usr/bin/ls")), "D23").toBeNull();
    expect(slashPolicy.verbOf(token("/")), "addressed to the app, naming nothing").toBe("");
  });
});
