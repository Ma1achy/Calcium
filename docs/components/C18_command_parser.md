# C18 — Command parser

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` (mechanism) + app (the prefix policy) |
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
               residual: readonly string[]; validation: ValidationResult }>
  | Readonly<{ kind: "local";   tool: ToolDef; argv: readonly string[];
               residual: readonly string[]; validation: ValidationResult }>
  | Readonly<{ kind: "builtin"; name: Builtin; args: readonly string[] }>
  | Readonly<{ kind: "builtinThenShell"; name: Builtin;
               args: readonly string[]; rest: string }>
  | Readonly<{ kind: "shell";   command: string; interactive: boolean }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "error";   error: ErrorLike }>;

type Builtin = "cd" | "export" | "pwd";

const TTY_MARKER = "tty";                // read through the policy: /tty, or :tty

type ParseContext = Readonly<{
  manifest: Manifest;
  binary:   string;                   // for rewriting /verb inside a shell command
  lastUuid: string | null;            // for $_
  policy?:  CommandPolicy;            // F2 — the prefix rule is pluggable
}>;

function parse(input: string, ctx: ParseContext): ParseResult;

interface CommandPolicy {
  readonly prefix: string;                       // "/" by default
  verbOf(token: Token): string | null;           // the verb, or null for "not mine"
}

export const slashPolicy: CommandPolicy;         // the default (D20, D23)

type Token = Readonly<{
  text:   string;                     // quotes removed, escapes applied
  start:  number;                     // offset into the input
  end:    number;                     // exclusive
  quoted: boolean;                    // any part of it was inside quotes
  kind:   "word" | "operator";
}>;

function tokenise(input: string): Result<readonly Token[], ErrorLike>;
function quote(text: string): string;
```

**`argv` is what gets spawned; `residual` is what was validated.** D24 spawns
`["<verb tokens…>", …args]`, so `/ps --mine` gives `argv ["ps","--mine"]` while
`validateInvocation` is handed C05's `ToolMatch.residual` — `["--mine"]`. One field
could not carry both, and with only `argv` the array validation ran against is not on
the result: commitment 9 is then believed rather than checked, because a test can see
that a `ValidationResult` is present and not that it corresponds to anything. Two
fields because they are two different things, and the redundancy is what makes the
correspondence assertable (T2.9).

**Tokens carry offsets, and this is not a convenience.** Two consumers need them and
neither can be served by token text:

- `builtinThenShell.rest` and every delegated `command` must be the user's own
  string, quoting intact (T3.14). Re-joining tokens loses exactly the quoting that
  delegation exists to preserve, so the `/verb` rewrite is a **splice into the input**
  rather than a re-join (§5).
- C19's `CompletionContext` carries `tokenIndex` and `prefix`, "the part of the
  current token before the cursor" — a question about offsets, not about text.

One shape serves both, which is what I11 is for.

**`interactive` is on the `shell` arm and on no other.** It is the shell half of C23
§4's handoff opt-in. The `app` arm needs nothing: it already carries `tool: ToolDef`,
and C05 I19's `interactive` field lives there — so C23 reads `result.tool.interactive`
for an app verb and `result.interactive` for a shell line, and the fact has one home
on each route rather than a copy with no reconciliation between the copies.

---

## 3. Tokenising

Standard shell quoting: single quotes are literal, double quotes allow `$_`, backslash escapes the next character. The tokeniser is shared with C19 so completion and execution agree about where the cursor's token starts — two tokenisers would disagree at exactly the awkward inputs.

Unterminated quotes are an error, not a silent close.

**Operators are tokens, not a pattern over the input.** `|`, `||`, `>`, `>>`, `<`,
`&&`, `;` and `&` are emitted as `kind: "operator"`; everything else is a word. A
regex over the raw string would classify `echo "a & b"` as backgrounding and
`echo "a | b"` as a pipe (T3.8), and it would read the slash in a quoted `"/usr/bin"`
as D23's. Every rule in §4 and §5 asks the token list, never the string.

A digit-prefixed redirect (`2>`) tokenises as the word `2` followed by the operator
`>`. That is enough: the line contains an operator, so it delegates whole, and C18
never needs to know what an fd is.

---

## 4. Classification

```
0  a refusal (§5) — trailing bare "&", or a job-control
   word as the first token                           → error
1  empty or whitespace only                          → empty
1a first token is the TTY marker (§5a)
     nothing after it                                → error
     next token is a built-in                        → error
     otherwise                                       → shell, interactive
2  first token is a built-in
     2a  no shell operator follows                   → builtin
     2b  followed by "&&" or ";"                     → builtin, then delegate the remainder
     2c  followed by "|" or a redirect               → shell (piping into cd is meaningless)
3  input contains a shell operator                   → shell        (§5)
4  first token starts with "/"
     and contains no further "/"                     → app or local (§6)
5  otherwise                                         → shell
```

**Rule 1a sits above 2 and 3 because both would otherwise claim the line first.**
`/tty cd /x` reaches rule 2 with `/tty` as its first token and so is not a built-in at
all; `/tty ls | cat` contains an operator and rule 3 would delegate it whole with the
marker still in the string. The marker is a statement about the *whole* line, so it is
read before the line is classified — and rule 0's refusals still run ahead of it,
because a trailing `&` is refused whether or not the terminal was asked for.

**Rule 2b is the case that ordering alone gets wrong.** `cd /tmp && make` must change the session's directory and *then* run `make` there — that is what bash does, and delegating the whole line to `sh -c` would change a subshell's directory and discard it. So a leading built-in followed by `&&` or `;` is split: the built-in is applied by L4, the remainder is delegated.

Checking built-ins after operators would break the same case in the other direction, which is why the rule is split rather than reordered.

```typescript
| Readonly<{ kind: "builtinThenShell"; name: "cd" | "export" | "pwd";
             args: readonly string[]; rest: string }>
```

**The split needs a non-empty remainder.** `cd /tmp &&` has nothing after the
operator, and T3.7 already rules that case — `&&` at the start or end of input is
delegated, and the shell reports its own syntax error. Rule 2b's wording did not say
so, and a split on an empty remainder would apply the `cd` and then report nothing,
which is the one outcome bash does not produce: the line is a syntax error, so the
directory must not change either. Empty remainder falls through to rule 3.

**`rest` is delegated, and delegation means the rewrite.** `cd /tmp && /ps` must run
the app, so `rest` goes through §5's `/verb` rewrite exactly as a whole-line
delegation does. Written down because the variant's declaration says only "the
remainder", and a `rest` handed over verbatim would run `/ps` as a path.

**Interception ignores quoting; the rewrite honours it.** `'cd' /tmp` is the `cd`
built-in in bash, so it is one here — the built-in test is on token text. The `/verb`
rewrite is the opposite (§5), and the asymmetry has a reason rather than being an
oversight: quoting does not change what bash does with `cd`, and it does not change
what bash does with `/ps` either. The rewrite is C18 *altering* what the user typed,
so a quoted token is the user saying "leave this alone" and bash agrees with them.
Interception changes nothing about the text.

Anything more contorted than a leading built-in — `ls | cd`, `cd` in the middle of a pipeline — is meaningless and goes to the shell, which reports its own error.

**Rule 4's second clause is D23.** `/usr/bin/ls` has a slash after position 0, so it is a path and goes to the shell. App verbs never contain slashes, so one test separates them permanently.

**The policy answers one question: is this token the app's own verb, and what is the verb?** `parse` does everything else. An earlier draft had it return a `Classification` covering `builtin`, `shell` and `empty` — which is the second-parser shape the next sentence warns against, arrived at by the interface rather than by anyone deciding it: a `:` policy would have had to re-implement built-in interception and operator delegation, neither of which has anything to do with a prefix. It also took the first token as a `string`, which cannot express quoting, so §5's unquoted-only rewrite had nowhere to ask.

Returning the verb rather than a boolean is what keeps the prefix in one place. The policy owns both the test and the stripping, so nothing in `parse` needs a corresponding edit — and §5's rewrite predicate is literally `verbOf(token) !== null && !token.quoted`, which is how "one slash rule, not two" is made structural rather than remembered.

F2's intent is a replaceable prefix rule, not a replaceable parser.

The prefix itself is a **pluggable policy** (F2). `/` is this app's choice; another consumer may want `:` or none. Calcium supplies the default and the rule above describes it.

---

## 5. Shell delegation

**Anything involving a shell operator — `|`, `>`, `>>`, `<`, `&&`, `||`, `;` — is handed to the user's shell whole**, with any `/verb` token rewritten to `<binary> verb` first.

```
/ps --json | jq '.data[0].uuid'     →  sh -c "prism ps --json | jq '.data[0].uuid'"
git log --oneline | head -20        →  sh -c "git log --oneline | head -20"
```

### The rewrite predicate

**A token is rewritten when it is exactly what rule 4 would classify as a verb, it is
unquoted, and it is in command position.** Read without a predicate, "any `/verb`
token" rewrites `/usr/bin/ls` in `/usr/bin/ls | head` — which contradicts D23 one line
after D23 established it. The predicate is rule 4's, so there is one slash rule and
not two:

| Token | Rewritten | Why |
|---|---|---|
| `/ps` | `widget ps` | rule 4's shape |
| `/usr/bin/ls` | no | D23 — a slash after position 0 |
| `"/ps"`, `'/ps'` | no | quoted; the user meant the path |
| `/` | no | no verb after the prefix |
| `/tmp` in `cd /tmp \| ls` | no | not in command position |

### The rule the third clause is an instance of

> **C18 may not disagree with the shell about which token is a command in a line it
> is handing over.**

That is the principle, and the clause is what it comes to here. It is worth stating
as the principle because the next person will meet a case the predicate does not
cover and it will look safe to widen — the rewrite is only ever adding a binary in
front of a verb, and the token in question will obviously be one. The test is not
whether the token looks like a verb. It is whether the shell, reading the same
string, would call it a command. Where the two answers differ, C18 is corrupting a
line it does not own.

**Command position is the third clause, and it was missing.** D23 separates a verb
from a path by counting slashes, and a single-component absolute path has none to
count: `/tmp`, `/etc` and `/home` satisfy rule 4's shape exactly. Without this clause
`cd /tmp | ls` is delegated as `cd widget tmp | ls`.

**That row is the commonest line in this document, not an edge**, and it is the
argument for §8a being a table rather than a list of interesting inputs: `cd /tmp` is
in §4's opening example, in `j22`'s open question and in three test rows, and it
survived all of them because none of those asked what the *delegated string* was. It
took a cell where two rules meet — built-in interception against the rewrite — and it
was found the first time the table was executed rather than read.

A token is in command position if it is the first token, or the first after a
control operator (`|`, `||`, `&&`, `;`, `&`). It is *not* in command position after a
redirect, because `>` takes a filename. That is how a shell reads the same line,
which is the whole of why it is the rule.

The clause does nothing to rule 4, where the first token is in command position by
construction. **`/tmp` alone is still an unknown verb**, and that is D23's stated cost
rather than a new one: the prefix means the app, and a user who wants the directory
listed writes `ls /tmp`.

**The rewrite does not consult the manifest.** `/zzzzz | cat` becomes
`widget zzzzz | cat`, and the binary reports its own unknown verb — the same message
the user would get in bash. Consulting the manifest here would put a lookup in the
shell path purely to decide a rewrite, and it would make `/zzzzz` alone (a suggestion
at distance ≤ 2) and `/zzzzz | cat` (a missing file) fail in two unrelated ways for
one typo. Classification stays a question about characters.

**Every qualifying token is rewritten, not only the first** (T3.13), including a
`local` verb: in a pipeline there is no in-process path, so `/help | less` becomes
`widget help | less`. And **the splices are applied last-to-first**, because each one
changes the length of the string every later span was measured against.

**The splice covers one token, and the tool match may be longer.** `/serving scale web`
splices `[0,8)` — `/serving` → `widget serving` — and `scale web` follows unchanged,
giving `widget serving scale web`. The splice boundary and `findTool`'s longest-match
boundary are different lengths, which is exactly where an off-by-one hides; the
rewrite never asks about the match because it never asks the manifest.

### What is refused, and where

Rule 0 runs on the token list before anything else. A trailing bare `&` is the last
token and `kind: "operator"`; a job-control word is refused **as the line's command**,
so `echo fg` is a line about the word `fg` and delegates.

**Command, not position 0**, and the distinction only became visible when the TTY
marker arrived. `/tty fg` is `fg` with the terminal asked for, and it wants the job
table `fg` wants — but the marker sits at position 0, so a literal reading let it
through. Until §5a there was no line where the two readings differed, which is why the
original wording was correct and unfalsifiable at once: A03 §2's vacuity class in a
sentence rather than in a rule. §8a's row is what asked.

Quoting does not disable the refusal, for the reason interception ignores quoting
(§4): `'fg'` is the `fg` built-in in bash, so it still wants a job table that still
does not exist. The two rules are asking one question — does quoting change what the
shell does with this word — and they must not answer it differently. It is no, twice.

`sleep 5 & echo x` is delegated whole: only a *trailing* `&` is refused, so
backgrounding mid-line reaches the shell and works there. That is the spec's answer
rather than an omission — the refusal exists because a background job has nowhere to
report to, and a job the user backgrounded inside a compound line is the shell's.

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

## 5a. The TTY marker

`/tty vim notes.md` hands the terminal to the child. It is the shell half of C23 §4's
handoff opt-in, and it is C18's rather than C23's for one reason: **a marker left on
the line would be passed to `sh` as an argument.** It has to be removed before
delegation, and removing a token from a line that is about to be delegated is the
operation §5 already performs on `/verb`. Same string, same splice, same owner. C23
reads the flag off the result and never parses the line.

It is not a manifest tool. `FRAMEWORK_TOOLS` are all `local: true` and C23 I27 fails
construction for a local verb with no handler; `/tty` has no handler, because C18
consumes it during parsing and no route ever sees it. And it is not a `Builtin`:
`cd`, `export` and `pwd` are session-state effects with arguments of their own, while
the marker has no effect at all. It modifies how the rest of the line is run.

**It is read through the policy**, so `prefixPolicy(":")` gives `:tty` and `/tty` is
then an ordinary path-ish token. The predicate is `verbOf(token) === TTY_MARKER` —
rule 4's own question with a name test added, and deliberately *not* §5's rewrite
predicate, which carries an unquoted clause this does not have.

### Head position only

| Input | Result |
|---|---|
| `/tty vim notes.md` | `shell` · `vim notes.md` · **interactive** |
| `ls \| /tty vim` | `shell` · `ls \| widget tty vim` · not interactive |

The second is not a special case; it is rule 3 and §5 doing exactly what they do to
every command-position `/verb`. The marker is a claim about who owns the terminal for
the duration of the line, and **a line with a pipeline has no single owner to give it
to** — `ls | vim` runs both at once. So the marker is meaningless anywhere but at the
head, and rather than inventing a rule to refuse it there, the token falls through to
the rewrite and reaches the binary, which reports an unknown verb in its own words.
That is the same outcome any other unknown `/verb` gets inside a delegated line, and
I17's principle is why: C18 may not disagree with the shell about which token is a
command in a line it is handing over.

### Quoting does not disable it — and this was ruled the other way first

`"/tty" vim` is the marker, and hands `vim` the terminal.

**The first ruling said the opposite** and reasoned from §4's asymmetry: the rewrite
honours quoting because the rewrite is C18 *altering* what the user typed, and
consuming the marker is altering what the user typed too. §8a's row is what corrected
it, which is the artefact doing its job — the two statements were each right where
they stood and could not both govern this cell.

The marker is a **classification**, not a rewrite, and every classification rule here
is quoting-blind: `'cd'` is the `cd` built-in (§4), `'fg'` is refused (§5), `'/ps'` is
the app verb `ps` — and that last row already says so in this document, one table
away. Quoting disables the rewrite alone, because the rewrite is the only thing that
edits a string being handed to a shell that will read the quotes itself.

The escape-hatch argument went with it. `'/ps'` offers no way to reach a `/ps` binary
either, so the marker owing one was an argument for a symmetry the component does not
have.

### `/tty` with a built-in is refused

| Input | Result |
|---|---|
| `/tty cd /x` | `error` · *`cd` changes this session's directory and cannot run under `/tty`* |
| `/tty export A=1` | `error` · same shape |

The marker forces the shell route, so `cd` would run in a subshell and exit, and the
session's directory would **silently** not change. That is correct behaviour for the
route and an unacceptable failure mode — it is precisely the silence C23 §4's argument
disqualified the maintained program list for, arriving through a door the argument had
not looked at.

Refusing is the only answer that says something. The user asked for two incompatible
things: a built-in is a session-state effect and a handoff is a subshell. Applying the
built-in and then handing off would be rule 2b's split wearing a marker, which reads as
clever and is wrong — `cd /x` under `/tty` is not `cd /x && …`, and there is no `&&`
to justify the reordering. Giving one of the two quietly is how a user learns not to
trust either.

This is the same knowledge rule 2 already encodes. C18 knows built-ins are session
effects, which is why it intercepts them at all; this is the one case where the route
the user selected destroys the effect.

### `/tty` with nothing after it

`error` — *`/tty` needs a command to run*. A marker with nothing to mark is not a
shell line with an empty command; the shell would report nothing, because there is
nothing left to report on once the marker is stripped.

### A tool named `tty`

An app may declare a verb called `tty`, and then `/tty vim` means two things. C18 is
the only component that can see both records — it holds the manifest and the policy —
so it reports the conflict rather than picking:

> `tty` is declared as a verb and is also the handoff marker — rename the verb

C05 cannot hold this rule: it is L0 `data/` and the marker is L3's, so a reserved-name
list there would be C05 knowing about a component four layers up. Reporting from here
costs one lookup and is loud, which is the property the whole opt-in was chosen for.

---

## 6. App and local commands

A `/`-prefixed first token with no further slash is looked up with `findTool`, longest-match-first so `serving scale` beats `serving` (C05 I7).

| Outcome | Result |
|---|---|
| Found, `local: true` | `local` — handled in-process, never spawned |
| Found, `local: false` | `app` — goes to the transport |
| Not found | `error`, with an edit-distance suggestion at distance ≤ 2 |

The suggester is **C05's**, exported rather than rewritten. C05 already runs a
distance-2 cutoff for unknown flags, and two implementations of one cutoff agree
about the distance and diverge about the tie-break — so the divergence lands exactly
where a suggestion is *wrong* rather than absent, which A01 A.2 says costs more than
none. Same argument as the shared tokeniser, one primitive over.

**An app command's arguments are not glob-expanded**, because no shell is in the loop
(D18): `/tail *.log` reaches the transport as the literal `*.log`, while `ls *.log`
delegates and globs. That is the documented consequence of the argv-array rule rather
than an inconsistency, and it is written here because the two lines look alike and
behave differently.

**`/` alone is its own error, not an unknown verb with an empty name.** Rule 4 fires —
the prefix is at position 0 and there is no *further* slash — and the verb is the
empty string. Handed to the suggester that would list every verb within distance 2 of
`""`, which is every one- and two-character verb in the manifest. T3.1 says "not an
empty tool name" and this is what that means in the result: a distinct error saying
there is no verb after the prefix.

**A failing validation stays `app` or `local`.** The kind describes what the input
*is*, not whether it will succeed; L4 renders the errors and still shows what was
parsed, which is why §6 carries the result rather than throwing it. Converting to
`error` would lose the tool, and with it the help L4 wants to show beside the failure.

**Lookup precedes expansion.** `/zzz $_` with no last UUID is an unknown-verb error,
not a `$_`-unset one — the verb is the thing the user got wrong, `$_` never appears in
a verb token, and the cheaper, more useful message wins. Recorded because the two
errors are produced by different sections and nothing said which runs first.

Validation runs here, **before anything is spawned** (D17). A malformed invocation costs nothing rather than 300 ms of interpreter startup to be told the same thing. The result is carried on the `ParseResult` rather than thrown, so L4 can render the errors and still show what was parsed.

---

## 7. `$_` expansion

Resolved at parse time from `ctx.lastUuid`, in unquoted and double-quoted tokens, never in single-quoted ones.

**It expands where the next character is not a word character, and nowhere else.**
That is bash's own rule for `$_`, and adopting it rather than inventing one is the
whole argument: the same characters are delegated *unchanged* when the line is
addressed to the shell (below), so a `$_` that expanded differently on this side of
the prefix would make one string mean two things depending on a character D20 chose
for an unrelated reason.

| Form | Expands | Why |
|---|---|---|
| `$_` | yes | the whole token |
| `--target=$_` | yes | `$_` ends the token |
| `"a $_ b"` | yes | double-quoted, followed by a space |
| `web:$_` | yes | the boundary is the character after, not the token edge |
| `$_x` | no | `$_x` names the variable `_x`, which is not this |
| `'$_'` | no | single-quoted |

**This changes T3.12, which asserted the token-exact reading.** Under that reading
`--target=$_` and `--config=$_` do not expand — the two forms a user is likeliest to
type after a result — and the test's `x$_` half is what forced it. Writing the
classification table is what surfaced the pair: the invariant admitted two readings
that agree on every row anyone had written down and differ on the common one.

**Expansion applies to `app` and `local` commands only, never to shell-delegated input.** `$_` is a real variable in bash and zsh — the last argument of the previous command — and rewriting it inside a line the user is addressing to their own shell would silently break `echo $_`. In shell context `$_` belongs to the shell.

`$_` with no last UUID is an error carrying the mockup's wording (A01 Appendix A.3): *no previous result · submit or promote something first*.

Expansion happens **after** tokenising, so a UUID containing a space could not split a token — they cannot, but the ordering removes the class of bug rather than relying on the data.

---

## 8. Built-ins

`cd`, `export` and `pwd` are intercepted before shell delegation, because `sh -c "cd /tmp"` changes a subshell's directory and exits. The session's own cwd and environment must change, so L4 applies them and C18 only classifies.

`cd` with no argument goes home; `cd -` returns to the previous directory. Session-scoped, not persisted — matching bash, and matching `j22`'s open question, which resolved the same way.

---

## 8a. The classification table

Resolved by hand before any code, as C16's rung table and C17's edit trace were, and
kept here for the same reason: it is the contract in the form someone can check an
implementation against.

**It is indexed by rule interaction, not by input coverage.** A row governed by one
rule is a restatement of that rule and finds nothing; every defect these walks have
produced has lived in a cell where two correct statements overlap, which is also why
they survive review — a reader checks statements one at a time by construction.

Context throughout: the fixture manifest, `binary: "widget"`, `lastUuid: "web:v3"`.
`ok`/`fail` is the carried `validation`.

### The prefix against D23's slash

| Input | Rule | Result |
|---|---|---|
| `/ps --mine` | 4 | `app` · tool `ps` · argv `["ps","--mine"]` · residual `["--mine"]` · ok |
| `/help` | 4 | `local` · tool `help` · argv `["help"]` · residual `[]` · ok |
| `/serving scale web 3` | 4 | `app` · tool `serving scale` · argv `["serving","scale","web","3"]` · residual `["web","3"]` · ok — longest match, and the residual starts after both verb tokens |
| `/usr/bin/ls -la` | 5 | `shell` · `/usr/bin/ls -la` — **no rewrite** |
| `//ps` | 5 | `shell` · `//ps` |
| `/` | 4 | `error` · no verb after the prefix |
| `/pss` | 4 | `error` · `unknown verb: /pss — did you mean /ps?` |
| `/zzzzz` | 4 | `error` · `unknown verb: /zzzzz — /help for verbs` |
| `/debug dump` | 4 | `local` · resolves although `hidden` (C05 I11) |

### Built-in interception against operator delegation

| Input | Rule | Result |
|---|---|---|
| `cd /tmp` | 2a | `builtin` · `cd` · args `["/tmp"]` |
| `cd` | 2a | `builtin` · `cd` · args `[]` |
| `cd -` | 2a | `builtin` · `cd` · args `["-"]` |
| `export A=1` | 2a | `builtin` · `export` · args `["A=1"]` |
| `cd /tmp && make` | 2b | `builtinThenShell` · `cd` · args `["/tmp"]` · rest `make` |
| `cd /tmp ; ls` | 2b | same shape · rest `ls` |
| `cd /tmp && /ps` | 2b | `builtinThenShell` · args `["/tmp"]` · rest **`widget ps`** |
| `cd /tmp &&` | 3 | `shell` · `cd /tmp &&` — empty remainder, the shell reports the syntax error |
| `cd /tmp \| ls` | 2c | `shell` · verbatim |
| `ls \| cd` | 3 | `shell` · verbatim |
| `'cd' /tmp` | 2a | `builtin` · quoting does not disable interception |
| `'/ps'` | 4 | `app` — quoting disables the *rewrite* (§5), never the classification; bash reads `'/ps'` and `/ps` alike |

### The rewrite against everything it meets

| Input | Rule | Delegated command |
|---|---|---|
| `/ps --json \| jq '.data[0].uuid'` | 3 | `widget ps --json \| jq '.data[0].uuid'` |
| `/serving scale web \| cat` | 3 | `widget serving scale web \| cat` |
| `/ps \| /help` | 3 | `widget ps \| widget help` |
| `/zzzzz \| cat` | 3 | `widget zzzzz \| cat` — no manifest lookup |
| `echo "/ps"` | 5 | `echo "/ps"` |
| `echo '/ps'` | 5 | `echo '/ps'` |
| `/usr/bin/ls \| head` | 3 | `/usr/bin/ls \| head` |
| `cat > "my file.txt"` | 3 | `cat > "my file.txt"` |
| `ls *.md` | 5 | `ls *.md` — no operator; rule 5, and the shell globs |
| `/tail *.log` | 4 | `app` · argv `["tail","*.log"]` — **not** globbed (D18) |

### `$_`, both halves of I7

| Input | Result |
|---|---|
| `echo $_` | `shell` · `echo $_` — unexpanded |
| `/promote $_` | `app` · argv `["promote","web:v3"]` · ok |
| `/promote "$_"` | `app` · argv `["promote","web:v3"]` · ok |
| `/promote '$_'` | `app` · argv `["promote","$_"]` · **fail** (pattern) — carried, still `app` |
| `/serving scale web 3 --config=$_` | `app` · `--config=web:v3` |
| `/promote $_x` | `app` · argv `["promote","$_x"]` · fail — carried |
| `/promote $_` with `lastUuid: null` | `error` · `no previous result · submit or promote something first` |
| `/zzz $_` with `lastUuid: null` | `error` · unknown verb — lookup precedes expansion |

### Refusals against the tokeniser

| Input | Rule | Result |
|---|---|---|
| `sleep 5 &` | 0 | `error` |
| `a && b` | 3 | `shell` |
| `echo "a & b"` | 5 | `shell` — the `&` is inside a word token |
| `sleep 5 & echo x` | 3 | `shell` — only a *trailing* `&` is refused |
| `fg` | 0 | `error` |
| `echo fg` | 5 | `shell` — first token only |
| `&& b` | 3 | `shell` — the shell reports the syntax error |

### Totality against the error path

| Input | Result |
|---|---|
| `` (empty), `   `, `\t` | `empty` |
| `'unterminated` | `error` — not a silent close |
| `"unterminated` | `error` |
| `abc\` | `error` |
| `/ps` + trailing spaces | identical to `/ps` |
| `/ps --status=nonsense` | `app` · fail (enum) — carried |
| `/ps --since -1h` | `app` · fail (missing value, C05's remediation) — carried |
| input with a NUL | stripped; the remainder parses |

### The marker against everything already in this table

Added when the marker was, and indexed the same way: every row is a cell where the
marker rule and one existing rule both have a claim. A row where only the marker
applies is a restatement of §5a and is not here.

| Input | Rules | Result |
|---|---|---|
| `/tty vim notes.md` | 1a | `shell` · `vim notes.md` · **interactive** |
| `/tty` | 1a | `error` · a marker with nothing to mark |
| `/tty ` (trailing space) | 1a | same — the tokeniser has already dropped it |
| `/tty cd /x` | 1a × 2 | `error` · the built-in's effect cannot survive the route |
| `/tty export A=1` | 1a × 2 | `error` · same |
| `/tty pwd` | 1a × 2 | `error` · same, and `pwd` is the row that looks harmless — it reports the *subshell's* directory, which is the session's until the first `cd` and then quietly is not |
| `/tty ls \| cat` | 1a × 3 | `shell` · `ls \| cat` · **interactive** — the marker is stripped, and the rest is an ordinary delegation with an operator in it |
| `ls \| /tty vim` | 3 × 5 | `shell` · `ls \| widget tty vim` · not interactive — command position, so the rewrite claims it (§5a) |
| `/tty /ps` | 1a × 5 | `shell` · `widget ps` · **interactive** — one token consumed, the next rewritten, both on one line |
| `/tty /usr/bin/less f` | 1a × 5 | `shell` · `/usr/bin/less f` · **interactive** — D23's slash rule still refuses the rewrite |
| `"/tty" vim` | 1a × §4's asymmetry | `shell` · `vim` · **interactive** — **corrected.** The first ruling had quoting disable the marker; classification is quoting-blind and only the rewrite is not |
| `/tty sleep 5 &` | 0 × 1a | `error` · the trailing-`&` refusal, because rule 0 runs on tokens before anything is classified |
| `/tty fg` | 0 × 1a | `error` · **corrected.** Rule 0 refuses job control as the line's *command*, and a leading marker is not the command — read as position 0 it let this through |
| `/tty` under `prefixPolicy(":")` | 1a × I12 | `shell` · `/tty` · not interactive — and `:tty vim` is the marker |
| `/tty vim` with a tool named `tty` | 1a × 4 | `error` · two records of one name, reported rather than resolved |
| `/ttyx vim` | 4 | `error` · `unknown verb: /ttyx` — the marker is a name test, not a prefix test |

Three of these were rulings rather than readings, and **two of the sixteen came back
wrong when the table was replayed against the code** — which is the first time an
artefact here has been corrected by its own replay rather than by a later component.

`"/tty" vim` is the better of the two. The reasoning that produced the wrong answer
was sound and cited the right section; it simply asked whether the marker resembles
the *rewrite*, when the question was whether it resembles a *classification*. Every
classification rule in §4 is quoting-blind and one of them is three tables above this
one. A row governed by one rule would never have asked.

`/tty fg` is the cheaper one and the more dangerous. Rule 0 says a job-control word is
refused "as a first token", and with a marker in front of it `fg` is not the first
token — so the refusal silently stopped applying to exactly the line that most wants
it. **The wording was the defect**: rule 0 means the line's *command*, and until the
marker existed those were the same thing, so nothing could tell the two readings
apart. §5's paragraph now says command rather than first token.

`/tty pwd` is the one that argues for the table having been written at all: refusing
`cd` reads as obvious and refusing `pwd` does not, and `pwd` is where the wrong answer
is least visible.

### What it found

Thirteen, and four are contradictions rather than gaps — two statements each correct
where it stands, which is the class this artefact exists for.

1. **`builtinThenShell` was not in §2's union.** T1.9b requires the variant; T2.5
   claims to be exhaustive over the union — so T2.5 passed by being exhaustive over a
   union missing the variant its sibling demands. *Contradiction.*
2. **The rewrite predicate was unstated**, and "any `/verb` token" rewrites
   `/usr/bin/ls` in a delegated line — contradicting D23 one section after D23.
   *Contradiction.*
3. **T3.12 forced the token-exact `$_` reading**, under which `--target=$_` does not
   expand. The two readings agree on every row anyone had written and differ on the
   commonest form. *Contradiction.*
4. **Rule 2b splits on an empty remainder**, which T3.7 already ruled the other way.
   *Contradiction.*
5. `rest` never said it goes through the rewrite; without it `cd /tmp && /ps` runs a
   path.
6. The rewrite's relationship to the manifest was unstated — one typo would have
   failed two unrelated ways.
7. `/` alone needed its own error; the suggester on `""` returns every short verb.
8. Nothing said whether lookup or expansion reports first.
9. Nothing said a failing validation keeps its kind.
10. Nothing said where the refusals sit in the order, or that job-control words are
    refused as a first token only.
11. Quoting disables the rewrite and not the interception, and the asymmetry needed
    its reason written down.
12. Multiple rewrites must splice last-to-first; each changes the length every later
    span was measured against.
13. An app command's arguments are not globbed — a documented consequence of D18 that
    two adjacent rows make look like an inconsistency.

## 8b. The delegation figure

The analogue of C17's "read the frame, not only the numbers". A splice can be
arithmetically perfect about offsets and still hand the shell something it parses
differently, and the only way to see that is to write the string out and then run it.

`binary: "/opt/my tools/widget"` — a path with a space, because that is the case the
quoter exists for.

| Input | Spans replaced | Handed to `spawnShell` |
|---|---|---|
| `/ps --json \| jq .` | `[0,3)` | `'/opt/my tools/widget' ps --json \| jq .` |
| `/serving scale web \| cat` | `[0,8)` | `'/opt/my tools/widget' serving scale web \| cat` |
| `/ps \| /help` | `[6,11)` then `[0,3)` | `'/opt/my tools/widget' ps \| '/opt/my tools/widget' help` |
| `cat > "my file.txt"` | none | `cat > "my file.txt"` |
| `cd /tmp && /ps` | `[11,14)` of the rest | rest: `'/opt/my tools/widget' ps` |
| `echo "/ps"` | none | `echo "/ps"` |

Read the third row: the spans are listed in the order they are applied, and applying
`[0,3)` first would leave `[6,11)` pointing into the middle of the inserted path.

**The verb is not quoted and the binary always is.** A verb that reached rule 4's
predicate is a run of non-slash, non-whitespace, unquoted characters, and quoting it
would change `widget ps` into `widget 'ps'` for no gain. The binary is app-supplied
and may be anything, so it goes through `quote` unconditionally rather than when it
looks like it needs it — T4.8 runs the first two rows through the real `spawnShell`
and compares output, because a string that looks right and a string the shell agrees
with are different claims.

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
- **I12** — The prefix rule is a policy, and the policy decides one thing: whether a token is the app's own verb, and which. Everything else — built-ins, operators, refusals — is `parse`'s and identical under every policy, so a replaceable prefix never becomes a replaceable parser (F2).
- **I13** — Output from a shell-delegated command reaches the transcript as a `raw` block. C18 does not parse it, because what the user's shell produced is text by construction and pretending otherwise would put a second envelope contract in the one place there is deliberately none.
- **I14** — An unknown verb is matched against the manifest at a Levenshtein distance of **2** and no further (A01 A.2). Beyond the cutoff the suggestion is dropped for a generic hint, because a wrong suggestion costs more than none — it sends the reader to a verb that exists and does something else.
- **I15** — C18 imports nothing from `terminal/` or `presentation/` and never commits a frame.
- **I16** — Tokens carry source offsets, and every delegated string is spliced into the input rather than re-joined from tokens, so the user's quoting survives verbatim.
- **I17** — A token is rewritten only if it satisfies rule 4's predicate, is unquoted, and is in command position. The rule the third clause instantiates: **C18 may not disagree with the shell about which token is a command in a line it is handing over.** A single-component absolute path has no slash for D23 to count, so without it `cd /tmp | ls` is delegated as `cd widget tmp | ls`. The rewrite consults no manifest, so a verb that does not exist still reaches the binary and gets the binary's own error.
- **I18** — Multiple rewrites are applied last-to-first, because each changes the length every earlier-measured span depends on.
- **I19** — `residual` on the result is exactly the array `validateInvocation` was given, and `validateInvocation` is called once per parse.
- **I20** — `$_` expands where the following character is not a word character, matching the shell's own rule for the same sigil, and never inside single quotes.
- **I21** — Tool lookup precedes `$_` expansion, and a failing validation keeps its `app` or `local` kind rather than becoming an `error`.
- **I22** — The refusals are evaluated first and on tokens, never on the raw input; a job-control word is refused as the line's **command** — position 0, or position 1 behind a TTY marker, which is not itself a command — quoted or not, because quoting does not stop bash treating it as the built-in — the same answer §4's interception gives.
- **I23** — The distance-2 suggester is C05's; there is exactly one implementation, as there is exactly one tokeniser.
- **I24** — A leading built-in with an empty remainder is not a split; it delegates whole, so a syntax error leaves the session's directory alone.
- **I25** — The TTY marker is recognised at head position only, through the policy, and **quoting does not disable it** — classification is quoting-blind here as it is for built-ins, job control and app verbs; only the rewrite honours quoting. Elsewhere it is an ordinary rewrite candidate, because a line with a pipeline has no single owner to give the terminal to.
- **I26** — The marker is stripped before delegation. A delegated command never contains it, on any route — `sh` would receive it as an argument.
- **I27** — The marker with a `Builtin` after it is an error, and the built-in is not applied. The route destroys the effect, so giving the user one of the two things they asked for is worse than giving them neither and saying so.

---

## 10. Commitments

1. `parse` is a pure total function; session state is context (I1, I2).
2. Classification is a single-character check plus D23's slash rule (I3).
3. Shell operators delegate the whole input to the user's shell, with `/verb` rewritten (I4, I5).
4. Delegated output is a `raw` block (I13).
5. `j22`'s refusal of globbing and brace expansion is reversed — delegation gives correct semantics for free (I4).
6. App commands without operators reach the transport as an argv array rather than a string, so delegation never widens the shell boundary; the array itself is C06's guarantee (→ C06 I3).
7. Only trailing `&` and job-control words are refused (I10).
8. Tool lookup is longest-match; misses suggest at edit distance ≤ 2 (I14).
9. Validation happens before spawning (I6).
10. `$_` expands after tokenising, in unquoted and double-quoted tokens, with the catalogued error wording (I7, I8).
11. A leading built-in is intercepted, including before `&&` or `;`, so `cd x && make` behaves as it does in bash (I9).
12. `$_` is never expanded in shell-delegated input, where it belongs to the shell (I7).
13. One tokeniser, shared with completion (I11).
14. The prefix is a pluggable policy (I12).
15. Delegated strings are spliced from the input, so quoting reaches the shell verbatim (I16).
16. The rewrite predicate is rule 4's, unquoted, in command position, and manifest-free — one slash rule, not two, and C18 never disagrees with the shell about which token is a command in a line it is handing over (I17).
17. Rewrites apply last-to-first, so the splice boundary and the tool-match boundary can differ safely (I18).
18. The validated array is carried, so "validation before spawning" is assertable rather than believed (I19).
19. `$_` follows the shell's own boundary rule, because the same string is delegated unchanged on the other side of the prefix (I20).
20. Lookup reports before expansion, and a failing validation still says what was parsed (I21).
21. Refusals run first, on tokens, and job control is a first-token word whether or not it is quoted (I22).
22. One distance-2 suggester, shared with C05 (I23).
23. An empty remainder is not a split (I24).
24. The TTY marker is head-position, policy-read, quoting-blind like every other classification rule, and always stripped before delegation (I25, I26).
25. A marker with a built-in after it is refused rather than half-applied, and a marker with nothing after it is refused rather than delegated empty (I27).

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
- **T1.7** (I14): `/pss` → `error` suggesting `/ps`; `/zzzzz` → `error` with no suggestion; and the **boundary** — `/psxy` is two edits and suggests, `/psxyz` is three and does not. Without the boundary row nothing distinguishes a cutoff of 2 from one of 4, because every declining case in the list declines under all of them.
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
- **T1.15** (I17): the rewrite predicate table of §5, all five rows, in a delegated line — `/tmp` as an argument among them.
- **T1.16** (I18): `/ps | /help` → both rewritten, and the second one's text is intact — the assertion that fails when the splices run first-to-last.
- **T1.17** (I24): `cd /tmp &&` → `shell`, not a split; the whole input is delegated.
- **T1.18** (I22): `fg` → `error`; `echo fg` → `shell`; `'fg'` → `error`, the same answer `'cd'` gets.
- **T1.19** (I21): `/zzz $_` with `lastUuid: null` → the unknown-verb error, not the `$_` one.
- **T1.20** (I21): `/ps --status=nonsense` → kind `app` with a failing validation, and `tool` still present.
- **T1.21** (I25, I26): `/tty vim notes.md` → `shell` · `vim notes.md` · `interactive` true. Both halves in one assertion: the flag is set **and** the command does not contain the marker, because a test that checks only the flag passes while `sh` receives `/tty` as an argument.
- **T1.22** (I27): `/tty cd /x` → `error`, and the result is not a `builtin` or a `builtinThenShell`. The negative half is the assertion — refusing is only meaningful if the built-in did not also come back for L4 to apply.

### Tier 2 — contract / interface

- **T2.1** (I1): a fuzz corpus of ten thousand strings — control characters, unbalanced quotes, huge tokens, nulls — yields a result, never a throw.
- **T2.2** (I2): a source scan finds no module state in `parser/`.
- **T2.3** (I11): C18 and C19 import the same tokeniser symbol; a duplicate implementation fails the check.
- **T2.4** (I15): the module graph shows no import from `terminal/` or `presentation/`, and no scheduler call.
- **T2.5**: every `ParseResult` variant is produced by at least one corpus input — exhaustive over the union.
- **T2.6** (I12): swapping the policy to a `:` prefix reclassifies the corpus consistently, with no other behaviour change.
- **T2.7** (I6): a spy proves the transport is never touched during parsing.
- **T2.8** (I16): for every corpus input, `input.slice(t.start, t.end)` reconstructs each token's source, and the concatenation of the spans plus the gaps is the input — the tokeniser cannot lose a character it did not report.
- **T2.9** (I19): for every `app` and `local` result, the carried `validation` equals `validateInvocation(tool, result.residual)`, and a counting spy proves it was called once.
- **T2.10** (I23): C18 imports C05's suggester; a second edit-distance implementation fails SS30.
- **T2.11** (§8a): the classification table replayed row for row, asserting the **whole** result — kind, tool, argv, residual, validation and the rule that fired.

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
- **T3.12** (I20): `$_x` → literal, because `$_x` names a different variable; `--config=$_` and `web:$_` → expanded. **Restated** — it asserted the token-exact reading, under which the two commonest forms silently do not expand (§7).
- **T3.13**: a pipe with an app command on both sides → delegated whole; both rewritten.
- **T3.14**: a redirect to a path containing spaces, quoted → delegated verbatim, quoting preserved.
- **T3.15**: `cd` with no argument → home; `cd -` → previous.
- **T3.16**: a 1 MB single-line input → parses within budget.
- **T3.17**: input containing a null byte → stripped, remainder parses.
- **T3.18**: a tool marked `hidden` → still parses and runs; it is only absent from help and completion (C05 I11).
- **T3.19** (§6): `/` alone → an error saying there is no verb after the prefix, carrying no suggestion — distinguishable from an unknown-verb error, not merely non-empty.
- **T3.20** (§4): `'cd' /tmp` → `builtin`; quoting does not disable interception, and `echo "/ps"` in the same test does not get rewritten, so the asymmetry is one assertion.
- **T3.21** (D18): `/tail *.log` → argv carries the literal `*.log`; `ls *.log` delegates.
- **T3.22** (I17): `/zzzzz | cat` → delegated as `widget zzzzz | cat`; no manifest lookup occurs, proved by a spy on `findTool`.
- **T3.23** (SS40's exemption): astral characters survive tokenising and splicing. Listed here because it was in the tree and not in this section — the same drift §8a's own history records, found while numbering the two rows below.
- **T3.24** (I25, I12): under `prefixPolicy(":")`, `:tty vim` is interactive and `/tty vim` is a plain shell line. Asserted as a pair, because a hardcoded `"/tty"` satisfies the first row and fails only the second.
- **T3.25** (§5a): a manifest declaring a tool named `tty`, then `/tty vim` → `error` naming both records. The fixture manifest has no such tool, so this row builds its own — and it asserts the ordinary manifest still parses `/tty vim` as interactive, or the conflict rule is indistinguishable from the marker being broken.

### Tier 4 — integration

- **T4.1** (with C05): validation errors from `validateInvocation` are carried through unchanged.
- **T4.2** (with C05): adding a flag to the manifest makes a previously-invalid invocation valid, with no parser change.
- **T4.3** (with C19): the shared tokeniser gives the same token boundaries for completion and execution on a corpus of partial inputs.
- **T4.4** (with C06, L4): an `app` result reaches the transport; a `shell` result never does.
- **T4.5** (with L4): a `builtin` `cd` changes the session cwd, and the next `app` command spawns there (C06 T3.22 from this side).
- **T4.6** (with C07): a delegated command's output renders as a `raw` block, not through an adapter.
- **T4.7** (with L4): `$_` is populated from the previous result's UUID and cleared when a command returns none.
- **T4.8** (with C21, I16): §8b's figure run for real. The string `parse` produced goes to `spawnShell` and the shell's output is compared — a pipe, a glob, a quoted redirect path with spaces, and a binary that is a path with a space. A splice can be arithmetically perfect and still be parsed differently by `sh`, and only running it says which.

### Tier 5 — e2e

- **T5.1**: `/ps --json | jq '.data[0].uuid'` in a real session → jq's output appears as raw text.
- **T5.2**: `ls *.md` → globbing works, because the shell does it. The `j22` reversal, tested.
- **T5.3**: `echo {a,b,c}` → brace expansion works.
- **T5.4**: `cd ..` then `/ps` → the verb spawns in the new directory.
- **T5.5**: `/ps --search=$_ --open-mr` immediately after a submit → the UUID resolves and the command is reproducible in bash exactly as displayed.

  **This row named `/promote $_ --open-mr` and could not be written.** `promote` declares no flags and takes one argument matching `^[\w.]+:[\w]+$`, so `--open-mr` is refused and a UUID cannot satisfy the pattern — the line was refused by C05 before `$_` could be shown to have resolved, and a refusal notice is what the assertion would have been reading. The verb came from a real app's manifest and the fixture manifest is the one every session in the suite is built from.

  `ps` carries both parts and is a better subject for the claim than the original: `--search=$_` is the `--flag=$_` form, which is exactly the reading §7's correction turned on, and `--open-mr` is one of its declared flags. The claim — expansion, and a displayed line reproducible in bash — is unchanged.
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
- **T6.14** (I16): re-joining tokens instead of splicing → T3.14 fails, and a quoted redirect path loses its quotes on the way to the shell.
- **T6.15** (I17): rewriting any token that starts with `/` → T1.15 fails, and `/usr/bin/ls | head` becomes `widget usr/bin/ls | head`.
- **T6.15b** (I17): dropping the command-position clause → T2.11's `cd /tmp | ls` row fails, and the commonest line in this document is delegated as `cd widget tmp | ls`.
- **T6.16** (I18): splicing first-to-last → T1.16 fails, and the second rewrite lands inside the first one's inserted text.
- **T6.17** (I19): recomputing validation at the second call site → T2.9's call count fails; the two results can then disagree where it is least visible.
- **T6.18** (I20): the token-exact reading → T3.12 fails, and `--config=$_` reaches the far side unexpanded.
- **T6.19** (I22): checking the refusals on the raw input → T3.8 fails, and `echo "a & b"` is refused as a background job.
- **T6.20** (I24): splitting on an empty remainder → T1.17 fails, and `cd /tmp &&` changes the directory on a line the shell rejects.
- **T6.21** (I23): a second distance-2 implementation in `parser/` → T2.10 and SS30 fail.
- **T6.22** (I26): dropping the strip — delegating the line with the marker still in it → T1.21's second half fails. The first half still passes, which is why the two are one test.
- **T6.23** (I27): applying the built-in and delegating the rest under a marker → T1.22 fails. The revert is the plausible one: it reads as rule 2b's split and there is no `&&` to justify it, so the session's directory changes and the child gets a terminal, and only the negative assertion sees it.
- **T6.24** (I25): recognising the marker in any command position rather than at the head → T2.11's `ls | /tty vim` row fails, and one member of a pipeline claims a terminal both members are using.

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
