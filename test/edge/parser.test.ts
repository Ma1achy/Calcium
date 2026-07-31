// C18 tier 3 — edge cases. §11's list, plus the three the classification table
// and the SS40 exemption produced.
import { describe, expect, it } from "vitest";

import { parse, quote, tokenise } from "../../src/interaction/parser/index.js";
import type { ParseContext, ParseResult } from "../../src/interaction/parser/index.js";
import { fixture } from "../support/manifest.js";

const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({
  manifest: fixture(),
  binary: "widget",
  lastUuid: "web:v3",
  ...over,
});

const command = (r: ParseResult): string => (r.kind === "shell" ? r.command : `not shell: ${r.kind}`);

describe("C18 tier 3 — the edges", () => {
  it("T3.1: `/` alone is its own error, not an unknown verb", () => {
    const r = parse("/", ctx());
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    // Distinguishable, not merely non-empty: the suggester on "" answers with
    // every one- and two-character verb in the manifest, which is a worse
    // message than none.
    expect(r.error.code).toBe("no_verb");
    expect(r.error.details?.["suggestion"]).toBeUndefined();
  });

  it("T3.2: `//ps` is a path", () => {
    expect(command(parse("//ps", ctx()))).toBe("//ps");
  });

  it("T3.3: trailing whitespace parses identically", () => {
    expect(parse("/ps   ", ctx())).toEqual(parse("/ps", ctx()));
  });

  it("T3.4, T3.5, T3.6: unterminated quotes and a trailing backslash are errors", () => {
    for (const input of ["'a", '"a', "a\\"]) {
      const r = parse(input, ctx());
      expect(r.kind, JSON.stringify(input)).toBe("error");
      if (r.kind !== "error") continue;
      expect(r.error.remediation, "and each says what to do").toBeDefined();
    }
  });

  it("T3.7: `&&` at either end is delegated, and the shell reports it", () => {
    expect(command(parse("&& b", ctx()))).toBe("&& b");
    expect(command(parse("a &&", ctx()))).toBe("a &&");
  });

  it("T3.8, T3.9: an `&` inside quotes or inside `&&` is not a refusal", () => {
    expect(parse('echo "a & b"', ctx()).kind).toBe("shell");
    expect(parse("a && b", ctx()).kind).toBe("shell");
    expect(parse("sleep 5 &", ctx()).kind, "and a trailing bare one still is").toBe("error");
  });

  it("T3.10 (I8): a `$_` containing a space stays one token", () => {
    const r = parse("/promote $_", ctx({ lastUuid: "a b" }));
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    // Expansion follows tokenising, so the space cannot split anything. The
    // ordering removes the class rather than relying on UUIDs having no spaces.
    expect(r.residual).toEqual(["a b"]);
  });

  it("T3.11: `$_` twice expands to the same value both times", () => {
    const r = parse("/tail $_ $_", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    expect(r.residual).toEqual(["web:v3", "web:v3"]);
  });

  it("T3.12 (I20): the boundary rule, both directions", () => {
    const args = (input: string): readonly string[] => {
      const r = parse(input, ctx());
      return r.kind === "app" || r.kind === "local" ? r.residual : [];
    };

    expect(args("/tail $_x"), "$_x names the variable _x").toEqual(["$_x"]);
    expect(args("/tail --config=$_"), "the form a user types after a result").toEqual([
      "--config=web:v3",
    ]);
    expect(args("/tail web:$_")).toEqual(["web:web:v3"]);
    expect(args(`/tail "a $_ b"`)).toEqual(["a web:v3 b"]);
    expect(args("/tail '$_'"), "single-quoted").toEqual(["$_"]);
  });

  it("T3.13: a pipe with an app command on both sides rewrites both", () => {
    expect(command(parse("/ps | /help", ctx()))).toBe("widget ps | widget help");
  });

  it("T3.14: a redirect to a quoted path with spaces is delegated verbatim", () => {
    expect(command(parse('/ps > "my out.txt"', ctx()))).toBe('widget ps > "my out.txt"');
  });

  it("T3.15: `cd` with no argument, and `cd -`", () => {
    expect(parse("cd", ctx())).toEqual({ kind: "builtin", name: "cd", args: [] });
    expect(parse("cd -", ctx())).toEqual({ kind: "builtin", name: "cd", args: ["-"] });
  });

  it("T3.16: a 1 MB single-line input parses", () => {
    const big = `/ps --search=${"a".repeat(1_000_000)}`;
    const r = parse(big, ctx());
    expect(r.kind).toBe("app");
  });

  it("T3.17: a NUL is stripped and the remainder parses", () => {
    // Written as an escape: SS43's point is that a literal control character
    // in source is invisible in every editor and diff, and a test asserting a
    // NUL is stripped must be readable as one.
    const r = parse(`/p\u0000s --mine`, ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    expect(r.tool.name).toBe("ps");
  });

  it("T3.18: a hidden tool still parses", () => {
    const r = parse("/debug dump", ctx());
    expect(r.kind).toBe("local");
    if (r.kind !== "local") return;
    expect(r.tool.hidden).toBe(true);
  });

  it("T3.19 (§6): `/` alone carries no suggestion — see T3.1", () => {
    expect(parse("/", ctx()).kind).toBe("error");
  });

  it("T3.20 (§4): quoting disables the rewrite and not the classification", () => {
    // One test, because separately each half passes under the wrong rule: a
    // parser that honoured quoting everywhere passes the second, one that
    // ignored it everywhere passes the first.
    expect(command(parse('echo "/ps"', ctx()))).toBe('echo "/ps"');
    expect(parse("'/ps'", ctx()).kind).toBe("app");
    expect(parse("'cd' /tmp", ctx())).toEqual({ kind: "builtin", name: "cd", args: ["/tmp"] });
  });

  it("T3.21 (D18): an app command's arguments are not globbed", () => {
    const r = parse("/tail *.log", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    expect(r.residual, "no shell is in the loop").toEqual(["*.log"]);
    expect(command(parse("ls *.log", ctx())), "and the delegated line still is").toBe("ls *.log");
  });

  it("T3.22 (I17): the rewrite consults no manifest", () => {
    // A verb that does not exist still reaches the binary, and gets the
    // binary's own error — the same one bash would give. Consulting the
    // manifest here would make one typo fail two unrelated ways.
    expect(command(parse("/zzzzz | cat", ctx()))).toBe("widget zzzzz | cat");
  });

  it("T3.23 (SS40's exemption): astral characters survive tokenising and splicing", () => {
    // **The claim behind C18's SS40 exemption, demonstrated rather than
    // asserted.** The tokeniser addresses by code unit; that is correct here
    // because a surrogate pair is never a token boundary — neither half is
    // whitespace or an operator — and every span is spliced back into the
    // string it was measured in.
    const emoji = "👨‍👩‍👧";
    const r = tokenise(`/ps --search=${emoji}日本 | cat`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.value.map((t) => t.text)).toEqual(["/ps", `--search=${emoji}日本`, "|", "cat"]);
    expect(command(parse(`/ps --search=${emoji} | cat`, ctx()))).toBe(
      `widget ps --search=${emoji} | cat`,
    );
    expect(quote(`${emoji} x`), "and the quoter keeps it whole").toBe(`'${emoji} x'`);
  });

  it("T3.24 (I17): a redirect target is not a command position", () => {
    // The other half of the `/tmp` finding: `>` takes a filename, so nothing
    // after it is a command. `cat > /tmp` must reach the shell untouched.
    expect(command(parse("cat > /tmp", ctx()))).toBe("cat > /tmp");
    expect(command(parse("cat /etc | /ps", ctx())), "and after a pipe it is").toBe(
      "cat /etc | widget ps",
    );
  });
});
