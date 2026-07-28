# C18 — Command parser

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` (mechanism) + app (the prefix policy) |
| **Layer** | L3 interaction |
| **Depends on** | C05 (`Manifest`, `findTool`, `validateInvocation`) · C04 (`ErrorLike`) |
| **Consumed by** | L4 execution pipeline · C19 (shares the tokeniser) |
| **Source** | A01 D17, D20–D25, F2 · `j22` §pass-through |
| **Status** | Draft |

---

## 1. Purpose

C18 turns what the user typed into what should happen. It tokenises, classifies, expands `$_`, validates against the manifest, and returns a decision — it does not execute anything.

**It is a pure function.** Session state — the last UUID, the working directory — arrives as context. That keeps every classification rule testable as a table of strings and makes the whole component runnable with no terminal, no manifest server and no subprocess.

The classification is what the `/` prefix bought (D20). With bare verbs, the parser had to consult the manifest to know whether `ps` meant Prism's or Unix's, and the answer changed as tools were added. Now it is a single-character check, and the collision class is gone permanently.

---

## 2. Result

```typescript
type ParseResult =
  | Readonly<{ kind: "app";     tool: ToolDef; argv: readonly string[];
               validation: ValidationResult }>
  | Readonly<{ kind: "local";   tool: ToolDef; argv: readonly string[];
               validation: ValidationResult }>
  | Readonly<{ kind: "builtin"; name: "cd" | "export" | "pwd"; args: readonly string[] }>
  | Readonly<{ kind: "shell";   command: string }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "error";   error: ErrorLike }>;

type ParseContext = Readonly<{
  manifest: Manifest;
  binary:   string;                   // for rewriting /verb inside a shell command
  lastUuid: string | null;            // for $_
  policy?:  CommandPolicy;            // F2 — the prefix rule is pluggable
}>;

function parse(input: string, ctx: ParseContext): ParseResult;

type Classification =
  | Readonly<{ kind: "app" | "local"; tokens: readonly string[] }>
  | Readonly<{ kind: "builtin"; name: string; tokens: readonly string[] }>
  | Readonly<{ kind: "shell" }>
  | Readonly<{ kind: "empty" }>;

interface CommandPolicy {
  readonly prefix: string;                       // "/" by default
  classify(firstToken: string, tokens: readonly string[]): Classification;
}

export const slashPolicy: CommandPolicy;         // the default (D20, D23)
```

---

## 3. Tokenising

Standard shell quoting: single quotes are literal, double quotes allow `$_`, backslash escapes the next character. The tokeniser is shared with C19 so completion and execution agree about where the cursor's token starts — two tokenisers would disagree at exactly the awkward inputs.

Unterminated quotes are an error, not a silent close.

---

## 4. Classification

```
1  empty or whitespace only                          → empty
2  first token is a built-in
     2a  no shell operator follows                   → builtin
     2b  followed by "&&" or ";"                     → builtin, then delegate the remainder
     2c  followed by "|" or a redirect               → shell (piping into cd is meaningless)
3  input contains a shell operator                   → shell        (§5)
4  first token starts with "/"
     and contains no further "/"                     → app or local (§6)
5  otherwise                                         → shell
```

**Rule 2b is the case that ordering alone gets wrong.** `cd /tmp && make` must change the session's directory and *then* run `make` there — that is what bash does, and delegating the whole line to `sh -c` would change a subshell's directory and discard it. So a leading built-in followed by `&&` or `;` is split: the built-in is applied by L4, the remainder is delegated.

Checking built-ins after operators would break the same case in the other direction, which is why the rule is split rather than reordered.

```typescript
| Readonly<{ kind: "builtinThenShell"; name: "cd" | "export" | "pwd";
             args: readonly string[]; rest: string }>
```

Anything more contorted than a leading built-in — `ls | cd`, `cd` in the middle of a pipeline — is meaningless and goes to the shell, which reports its own error.

**Rule 4's second clause is D23.** `/usr/bin/ls` has a slash after position 0, so it is a path and goes to the shell. App verbs never contain slashes, so one test separates them permanently.

`CommandPolicy` decides only the **kind**; `parse` does the rest. A policy that also parsed would be a second parser, and F2's intent is a replaceable prefix rule, not a replaceable parser.

The prefix itself is a **pluggable policy** (F2). `/` is this app's choice; another consumer may want `:` or none. `tui-kit` supplies the default and the rule above describes it.

---

## 5. Shell delegation

**Anything involving a shell operator — `|`, `>`, `>>`, `<`, `&&`, `||`, `;` — is handed to the user's shell whole**, with any `/verb` token rewritten to `<binary> verb` first.

```
/ps --json | jq '.data[0].uuid'     →  sh -c "prism ps --json | jq '.data[0].uuid'"
git log --oneline | head -20        →  sh -c "git log --oneline | head -20"
```

This is a **correction to `j22`**, which refused brace expansion and globbing on the grounds that the Prism shell "is not bash". That reasoning assumed we would implement pipes and redirects ourselves. Delegating instead means globbing, brace expansion, variable expansion, quoting and operator precedence are all exactly right, because they are the user's actual shell doing them. Reimplementing a subset would be more work and would be wrong in ways users discover one at a time.

The output of a delegated command is a `raw` block. If you piped it, you asked for the pipe's output, not a rendered table — and `--json | jq` is the canonical case, where rendering would defeat the purpose.

**The argv-array rule (D18) is unaffected.** It exists so the TUI never constructs a shell string from data it assembled. Here the string is what the user typed, character for character, and the shell is the thing they were addressing. App commands invoked *without* operators still spawn as argv arrays with no shell in the loop.

### What is still refused

| Refused | Why |
|---|---|
| Trailing `&` | A background job has nowhere to report to in a single-buffer TUI |
| `fg`, `bg`, `jobs` | No job table to act on |

`&&` is not `&` — the tokeniser distinguishes them, and only a trailing bare `&` is refused. Nothing else is refused, because nothing else needs to be.

---

## 6. App and local commands

A `/`-prefixed first token with no further slash is looked up with `findTool`, longest-match-first so `serving scale` beats `serving` (C05 I6).

| Outcome | Result |
|---|---|
| Found, `local: true` | `local` — handled in-process, never spawned |
| Found, `local: false` | `app` — goes to the transport |
| Not found | `error`, with an edit-distance suggestion at distance ≤ 2 |

Validation runs here, **before anything is spawned** (D17). A malformed invocation costs nothing rather than 300 ms of interpreter startup to be told the same thing. The result is carried on the `ParseResult` rather than thrown, so L4 can render the errors and still show what was parsed.

---

## 7. `$_` expansion

Resolved at parse time from `ctx.lastUuid`, in unquoted and double-quoted tokens, never in single-quoted ones.

**Expansion applies to `app` and `local` commands only, never to shell-delegated input.** `$_` is a real variable in bash and zsh — the last argument of the previous command — and rewriting it inside a line the user is addressing to their own shell would silently break `echo $_`. In shell context `$_` belongs to the shell.

`$_` with no last UUID is an error carrying the mockup's wording (A01 Appendix A.3): *no previous result · submit or promote something first*.

Expansion happens **after** tokenising, so a UUID containing a space could not split a token — they cannot, but the ordering removes the class of bug rather than relying on the data.

---

## 8. Built-ins

`cd`, `export` and `pwd` are intercepted before shell delegation, because `sh -c "cd /tmp"` changes a subshell's directory and exits. The session's own cwd and environment must change, so L4 applies them and C18 only classifies.

`cd` with no argument goes home; `cd -` returns to the previous directory. Session-scoped, not persisted — matching bash, and matching `j22`'s open question, which resolved the same way.

---

## 9. Invariants

- **I1** — `parse` is pure and total: any input yields a `ParseResult`, never a throw.
- **I2** — Session state arrives as context; C18 stores nothing.
- **I3** — A first token containing `/` after position 0 is never an app command.
- **I4** — Any input containing a shell operator is delegated whole; C18 never implements a pipe or redirect.
- **I5** — `/verb` is rewritten to `<binary> verb` before delegation, so the shell sees a real command.
- **I6** — Validation runs before the result is returned; nothing is spawned to discover an invocation is malformed.
- **I7** — `$_` expands only in unquoted and double-quoted tokens, and only for `app` and `local` results — never in shell-delegated input, where it is the shell's own variable.
- **I8** — Expansion follows tokenising, never precedes it.
- **I9** — A leading built-in followed by `&&` or `;` is split from the remainder rather than delegated whole, so the session's directory and environment actually change.
- **I10** — Only a trailing bare `&` and the job-control words are refused.
- **I11** — The tokeniser is shared with C19; there is exactly one implementation.
- **I12** — The prefix rule is a policy; the default is `/` and it is replaceable (F2).
- **I13** — C18 imports nothing from `terminal/` or `presentation/` and never commits a frame.

---

## 10. Commitments

1. `parse` is a pure total function; session state is context.
2. Classification is a single-character check plus D23's slash rule.
3. Shell operators delegate the whole input to the user's shell, with `/verb` rewritten.
4. Delegated output is a `raw` block.
5. `j22`'s refusal of globbing and brace expansion is reversed — delegation gives correct semantics for free.
6. App commands without operators spawn as argv arrays; D18 is unaffected.
7. Only trailing `&` and job-control words are refused.
8. Tool lookup is longest-match; misses suggest at edit distance ≤ 2.
9. Validation happens before spawning.
10. `$_` expands after tokenising, in unquoted and double-quoted tokens, with the catalogued error wording.
11. A leading built-in is intercepted, including before `&&` or `;`, so `cd x && make` behaves as it does in bash.
12. `$_` is never expanded in shell-delegated input, where it belongs to the shell.
13. One tokeniser, shared with completion.
14. The prefix is a pluggable policy.

---

## 11. Tests

Six tiers. No state machine — C18 is pure.

### Tier 1 — unit

- **T1.1**: empty and whitespace-only input → `empty`.
- **T1.2**: `/ps --mine` → `app`, tool `ps`, argv `["ps","--mine"]`.
- **T1.3**: `/help` → `local`.
- **T1.4** (I3): `/usr/bin/ls -la` → `shell`, not an unknown-verb error.
- **T1.5**: `git status` → `shell`.
- **T1.6**: `/serving scale web --replicas=3` → longest match on `serving scale`, residual `["web","--replicas=3"]`.
- **T1.7**: `/pss` → `error` suggesting `/ps`; `/zzzzz` → `error` with no suggestion.
- **T1.8** (I5): `/ps --json | jq .` → `shell` with command `prism ps --json | jq .`.
- **T1.9**: `cd /tmp`, `pwd`, `export A=1` → `builtin`.
- **T1.9b** (I9): `cd /tmp && make` → `builtinThenShell` with `rest` of `make`; the args are `["/tmp"]`, not the whole line.
- **T1.9c**: `cd /tmp ; ls` → same split.
- **T1.9d**: `ls | cd` → `shell`; C18 does not attempt to intercept a built-in mid-pipeline.
- **T1.9e** (I7): `echo $_` with a last UUID set → delegated **unexpanded**; the shell's own `$_` is untouched.
- **T1.10** (I7): `/ps $_` with a last UUID → expanded; inside single quotes → literal.
- **T1.11**: `/ps $_` with no last UUID → `error` carrying the catalogued wording.
- **T1.12** (I10): `sleep 5 &` → `error`; `a && b` → `shell`.
- **T1.13** (I6): `/ps --status=nonsense` → `app` with a failing `validation`, and nothing spawned.
- **T1.14**: quoting — single, double, escaped spaces, nested → the documented token lists. Eight cases.

### Tier 2 — contract / interface

- **T2.1** (I1): a fuzz corpus of ten thousand strings — control characters, unbalanced quotes, huge tokens, nulls — yields a result, never a throw.
- **T2.2** (I2): a source scan finds no module state in `parser/`.
- **T2.3** (I11): C18 and C19 import the same tokeniser symbol; a duplicate implementation fails the check.
- **T2.4** (I13): the module graph shows no import from `terminal/` or `presentation/`, and no scheduler call.
- **T2.5**: every `ParseResult` variant is produced by at least one corpus input — exhaustive over the union.
- **T2.6** (I12): swapping the policy to a `:` prefix reclassifies the corpus consistently, with no other behaviour change.
- **T2.7** (I6): a spy proves the transport is never touched during parsing.

### Tier 3 — edge cases

- **T3.1**: `/` alone → `error`, not an empty tool name.
- **T3.2**: `//ps` → path rule applies; `shell`.
- **T3.3**: `/ps` with trailing whitespace → parses identically.
- **T3.4**: unterminated single quote → `error`, not a silent close.
- **T3.5**: unterminated double quote → same.
- **T3.6**: a backslash at end of input → `error`.
- **T3.7**: `&&` at the start or end of input → delegated; the shell reports the syntax error, not C18.
- **T3.8**: `&` inside a quoted string (`echo "a & b"`) → not a backgrounding refusal.
- **T3.9**: `&` inside `&&` → not refused.
- **T3.10** (I8): a `$_` value containing a space → stays one token, because expansion follows tokenising.
- **T3.11**: `$_` appearing twice → both expand to the same value.
- **T3.12**: `$_x` and `x$_` → only exact `$_` expands; adjacency does not.
- **T3.13**: a pipe with an app command on both sides → delegated whole; both rewritten.
- **T3.14**: a redirect to a path containing spaces, quoted → delegated verbatim, quoting preserved.
- **T3.15**: `cd` with no argument → home; `cd -` → previous.
- **T3.16**: a 1 MB single-line input → parses within budget.
- **T3.17**: input containing a null byte → stripped, remainder parses.
- **T3.18**: a tool marked `hidden` → still parses and runs; it is only absent from help and completion (C05 I11).

### Tier 4 — integration

- **T4.1** (with C05): validation errors from `validateInvocation` are carried through unchanged.
- **T4.2** (with C05): adding a flag to the manifest makes a previously-invalid invocation valid, with no parser change.
- **T4.3** (with C19): the shared tokeniser gives the same token boundaries for completion and execution on a corpus of partial inputs.
- **T4.4** (with C06, L4): an `app` result reaches the transport; a `shell` result never does.
- **T4.5** (with L4): a `builtin` `cd` changes the session cwd, and the next `app` command spawns there (C06 T3.22 from this side).
- **T4.6** (with C07): a delegated command's output renders as a `raw` block, not through an adapter.
- **T4.7** (with L4): `$_` is populated from the previous result's UUID and cleared when a command returns none.

### Tier 5 — e2e

- **T5.1**: `/ps --json | jq '.data[0].uuid'` in a real session → jq's output appears as raw text.
- **T5.2**: `ls *.md` → globbing works, because the shell does it. The `j22` reversal, tested.
- **T5.3**: `echo {a,b,c}` → brace expansion works.
- **T5.4**: `cd ..` then `/ps` → the verb spawns in the new directory.
- **T5.5**: `/promote $_ --open-mr` immediately after a submit → the UUID resolves and the command is reproducible in bash exactly as displayed.
- **T5.6**: `sleep 5 &` → refused with the documented message; the session is unaffected.

### Tier 6 — fail-on-revert

- **T6.1** (I3): dropping the slash-after-position-0 rule → T1.4 fails, and `/usr/bin/ls` becomes an unknown verb.
- **T6.2** (I4): implementing pipes internally → T1.8 and T5.2 fail, and shell semantics start drifting.
- **T6.3** (I5): delegating without rewriting `/verb` → T1.8 fails, and the shell cannot find `/ps`.
- **T6.4** (I6): validating after spawn → T2.7 fails, and every typo costs an interpreter start.
- **T6.5** (I8): expanding before tokenising → T3.10 fails.
- **T6.12** (I9): classifying built-ins after operators → T1.9b fails and `cd x && make` silently runs in the wrong directory.
- **T6.13** (I7): expanding `$_` in shell input → T1.9e fails and `echo $_` stops meaning what the shell means.
- **T6.6** (I7): expanding inside single quotes → T1.10 fails.
- **T6.7** (I9): delegating `cd` to the shell → T4.5 fails, and the directory silently never changes.
- **T6.8** (I10): refusing `&&` along with `&` → T1.12 and T3.9 fail.
- **T6.9** (I11): a second tokeniser in the completion module → T2.3 fails.
- **T6.10** (I1): a throw on unbalanced quotes → T2.1 fails.
- **T6.11** (I12): hardcoding `/` outside the policy → T2.6 fails.

---

## 12. Out of scope

| Not here | Where |
|---|---|
| Executing anything | L4, C06, C21 |
| Completion candidates | C19, which shares the tokeniser |
| The manifest's contents | C05 and the app |
| Applying `cd` and `export` | L4 |
| Rendering errors | C07's error path |
| Job control | Refused; `SIGTSTP` is C01's |
