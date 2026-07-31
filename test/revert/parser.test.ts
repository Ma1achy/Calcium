// C18 tier 6 — fail-on-revert. Each names the change that makes it fail, not
// only the assertion.
//
// **These are the mutation pass written down.** Every module was mutated on
// landing — the rewrite re-joining tokens, the splices running first-to-last,
// built-ins checked after operators, `$_` expanded in shell input, the command
// position dropped — and what each one broke is what each of these pins.
import { describe, expect, it } from "vitest";

import { parse, tokenise } from "../../src/interaction/parser/index.js";
import type { ParseContext, ParseResult } from "../../src/interaction/parser/index.js";
import { fixture } from "../support/manifest.js";

const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({
  manifest: fixture(),
  binary: "widget",
  lastUuid: "web:v3",
  ...over,
});

const command = (r: ParseResult): string => (r.kind === "shell" ? r.command : `not shell: ${r.kind}`);

describe("C18 tier 6 — fail on revert", () => {
  it("T6.1 (I3): dropping the slash-after-position-0 rule → a path becomes an unknown verb", () => {
    expect(parse("/usr/bin/ls -la", ctx()).kind).toBe("shell");
  });

  it("T6.2 (I4): implementing pipes internally → shell semantics start drifting", () => {
    // The whole line reaches the shell, operators included. A parser that split
    // on `|` itself would return two results, or one with the pipe removed.
    expect(command(parse("/ps --json | jq . | head -1", ctx()))).toBe(
      "widget ps --json | jq . | head -1",
    );
  });

  it("T6.3 (I5): delegating without rewriting → the shell cannot find /ps", () => {
    expect(command(parse("/ps | cat", ctx()))).toContain("widget ps");
  });

  it("T6.5 (I8): expanding before tokenising → a value with a space splits a token", () => {
    const r = parse("/promote $_", ctx({ lastUuid: "a b" }));
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    expect(r.residual, "one argument, not two").toEqual(["a b"]);
  });

  it("T6.6 (I7): expanding inside single quotes → the user's literal is rewritten", () => {
    const r = parse("/tail '$_'", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    expect(r.residual).toEqual(["$_"]);
  });

  it("T6.8 (I10): refusing `&&` along with `&` → a conjunction stops working", () => {
    expect(parse("a && b", ctx()).kind).toBe("shell");
    expect(parse("sleep 5 &", ctx()).kind).toBe("error");
  });

  it("T6.10 (I1): a throw on unbalanced quotes → totality is gone", () => {
    expect(() => parse("'a", ctx())).not.toThrow();
    expect(parse("'a", ctx()).kind).toBe("error");
  });

  it("T6.11 (I12): hardcoding `/` outside the policy → the prefix stops being pluggable", () => {
    // Asserted through the default policy's absence rather than its presence:
    // with a `:` policy, `/ps` must be a path.
    const colon = ctx({ policy: { prefix: ":", verbOf: () => null } });
    expect(command(parse("/ps | cat", colon))).toBe("/ps | cat");
  });

  it("T6.12 (I9): classifying built-ins after operators → cd runs in the wrong directory", () => {
    const r = parse("cd /tmp && make", ctx());
    expect(r.kind, "a subshell's cd is discarded").toBe("builtinThenShell");
    if (r.kind !== "builtinThenShell") return;
    expect(r.args).toEqual(["/tmp"]);
    expect(r.rest).toBe("make");
  });

  it("T6.13 (I7): expanding `$_` in shell input → `echo $_` stops meaning the shell's", () => {
    expect(command(parse("echo $_", ctx()))).toBe("echo $_");
  });

  it("T6.14 (I16): re-joining tokens instead of splicing → quoting is lost", () => {
    // The failure is silent and specific: the tokens are all there, the command
    // reads plausibly, and the shell now sees three words where the user wrote
    // one filename.
    expect(command(parse('cat > "my file.txt"', ctx()))).toBe('cat > "my file.txt"');
    expect(command(parse("echo 'a  b' | cat", ctx()))).toBe("echo 'a  b' | cat");
  });

  it("T6.15 (I17): rewriting any token that starts with `/` → D23 is undone", () => {
    expect(command(parse("/usr/bin/ls | head", ctx()))).toBe("/usr/bin/ls | head");
  });

  it("T6.15b (I17): dropping the command-position clause → `cd /tmp | ls` is corrupted", () => {
    // A single-component absolute path has no slash for D23 to count, so
    // without this clause the commonest line in the spec is delegated as
    // `cd widget tmp | ls`.
    expect(command(parse("cd /tmp | ls", ctx()))).toBe("cd /tmp | ls");
    expect(command(parse("cat > /etc", ctx())), "and a redirect target too").toBe("cat > /etc");
  });

  it("T6.16 (I18): splicing first-to-last → the second rewrite lands inside the first", () => {
    expect(command(parse("/ps | /help", ctx({ binary: "/opt/my tools/widget" })))).toBe(
      "'/opt/my tools/widget' ps | '/opt/my tools/widget' help",
    );
  });

  it("T6.17 (I19): recomputing validation → the carried result stops corresponding", () => {
    const r = parse("/ps --since -1h", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    // The residual is the array validation was given. A recomputation over
    // `argv` — the plausible mistake, since it is the other field — would
    // validate the verb as a positional and fail differently.
    expect(r.residual).toEqual(["--since", "-1h"]);
    expect(r.validation.ok).toBe(false);
  });

  it("T6.18 (I20): the token-exact reading → `--config=$_` reaches the far side unexpanded", () => {
    const r = parse("/tail --config=$_", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    expect(r.residual).toEqual(["--config=web:v3"]);
  });

  it("T6.19 (I22): checking the refusals on the raw input → a quoted `&` is refused", () => {
    expect(parse('echo "a & b"', ctx()).kind).toBe("shell");
  });

  it("T6.20 (I24): splitting on an empty remainder → cd runs on a line the shell rejects", () => {
    expect(parse("cd /tmp &&", ctx()).kind).toBe("shell");
    expect(parse("cd /tmp ;", ctx()).kind).toBe("shell");
  });

  it("T6.22 (§3): closing an unterminated quote silently → something unTyped runs", () => {
    // The tokeniser is where this would be done "helpfully", and the result is
    // a command the user did not write reaching their shell.
    const r = tokenise(`echo "a`);
    expect(r.ok).toBe(false);
  });
});
