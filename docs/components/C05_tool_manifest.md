# C05 — Tool manifest

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` (schema, loader, validator) + app (the manifest itself) |
| **Layer** | L0 data |
| **Depends on** | C04 (`ErrorLike` only). Otherwise pure types, a loader and a pure validator |
| **Consumed by** | C18 parser (classify, validate before spawn) · C19 completion (flags, enums, arity) · C06 transport (`local` vs spawn) · L4 (help generation, startup checks) |
| **Source** | A01 D14, D17, D22, D25, B6 · A01 §5 wiring · A02 §2, §6 |
| **Status** | Draft |

---

## 1. Purpose

The manifest is what stops the TUI from guessing. Without it, tab completion hand-maintains a copy of the far side's flags and drifts the first time someone adds one; the parser cannot reject `--open-mrr` before paying 300 ms to have a subprocess reject it; and `--help` is written twice.

It is also the thing that makes the framework general. Calcium knows nothing about `promote` or `--replicas`; it knows there is a tool with typed args, and every behaviour above is derived from that.

**During standalone development the manifest is a hand-written JSON fixture the app ships.** Whether the far side later generates it via `<binary> __manifest__ --json` (B6) is a wiring-time question. The expensive half was never the framework's (A01 §5).

**No state machine** in the manifest data itself. The *loader* has one — unloaded → loaded → sealed — because a manifest replaced mid-session would let completion and the parser disagree about the same command.

---

## 2. Public interface

```typescript
const ARG_TYPES = [
  "string", "int", "bool", "path", "enum", "duration", "pattern",
] as const;
type ArgType = (typeof ARG_TYPES)[number];

type FlagDef = Readonly<{
  name:        string;                // long form, without "--"
  short?:      string;                // single char, without "-"
  type:        ArgType;
  values?:     readonly string[];     // required iff type === "enum"
  pattern?:    string;                // required iff type === "pattern"; anchored regex
  repeatable?: boolean;
  requires?:   readonly string[];     // other flags that must accompany it
  conflicts?:  readonly string[];
  view?:       boolean;               // this flag makes the result a view — C22 §13a (I20)
  shellOnly?:  boolean;               // consumed by the shell, never transmitted (I21)
  interactive?: boolean;              // this flag decides the terminal contract (I23)
  summary:     string;
}>;

type ArgDef = Readonly<{
  name:     string;
  type:     ArgType;
  required: boolean;
  variadic?: boolean;
  values?:  readonly string[];
  pattern?: string;
  summary:  string;
}>;

type ToolMatch = Readonly<{
  tool:     ToolDef;
  consumed: number;                   // tokens the tool name consumed
  residual: readonly string[];        // the rest, to be validated as args
}>;

type ValidationResult =
  | Readonly<{
      ok: true;
      args: Readonly<Record<string, unknown>>;
      transmitted: readonly string[];   // the invocation minus the shell's own switches (I21)
      interactive: boolean;             // the resolved terminal contract (I23)
    }>
  | Readonly<{ ok: false; errors: readonly ErrorLike[] }>;

type ManifestError = Readonly<{ path: string; message: string }>;

type ToolDef = Readonly<{
  name:      string;                  // "ps", "serving scale" — spaces mean sub-verbs
  local:     boolean;                 // true = handled in-process, never spawned
  summary:   string;
  args:      readonly ArgDef[];
  flags:     readonly FlagDef[];
  streams?:  boolean;                 // emits NDJSON patches rather than one document
  oneShot?:  boolean;                 // writes one frame to stdout and exits; bypasses the TTY gate
  hidden?:   boolean;                 // omitted from help and completion, still invocable
  interactive?: boolean;              // takes the terminal — C23 §4's handoff (I19)
  view?:        boolean;              // the result is a pushed view — C22 §13a (I20)
}>;

type Manifest = Readonly<{
  schema: "tui.manifest/1";
  binary: string;
  version: string;                    // the far side's version, for skew reporting
  tools: readonly ToolDef[];          // every tool — what findTool and validation read
  appTools: readonly ToolDef[];       // what the app wrote — §3
}>;

function parseManifest(raw: unknown): Result<Manifest, readonly ManifestError[]>;
function findTool(m: Manifest, tokens: readonly string[]): ToolMatch | null;
function visibleTools(m: Manifest): readonly ToolDef[];
function validateInvocation(tool: ToolDef, argv: readonly string[]): ValidationResult;
function suggestName(name: string, candidates: readonly string[]): string | undefined;

interface ManifestStore {
  load(m: Manifest): void;
  seal(): void;
  readonly manifest: Manifest | null;
  readonly sealed: boolean;
}
```

`Result<T, E>` is **C04's**, imported rather than redeclared. An earlier draft of this section declared its own with `errors` plural where C04's has `error` singular — two shapes under one name, in one half of one layer, both of which compile. The plural now lives in the type argument, where it belongs: `Result<Manifest, readonly ManifestError[]>`. SS35 keeps it that way.

`findTool` takes tokens rather than a string because sub-verbs are multi-token: `["serving","scale","web"]` matches the tool `serving scale` and leaves `["web"]` as arguments. **Longest match wins**, so `serving scale` is preferred over a hypothetical `serving`.

### `ARG_TYPES` is closed, and this is the rule

An `ArgType` describes a **shape the framework can validate without knowing what it means**. `enum`, `duration` and `pattern` qualify. `uuid` and `target` do not — a UUID is a `pattern` and a target is a `string`, and adding either means the framework has begun to know Prism's nouns. This is the union EX5 asserts stays empty.

The list is a runtime constant with the type derived from it, so a new member without a validator row does not compile (T2.4) and a new member with one fails T1.7c against a list written out literally in the test.

### `hidden` — invocable, not offered

`visibleTools` omits a hidden tool; `findTool` still resolves it. That pair *is* the meaning of the field, and it is what makes it useful for a deprecation or an internal escape hatch: the verb keeps working for whoever knows its name while it leaves the help. A `hidden` that also stopped resolving would be a weak form of deleting the entry, and deleting the entry is how you delete a verb. T1.15 asserts the pair in one test, because separately both halves pass while the intent disappears between them.

### `view` — the tier, decided before the verb runs

A verb whose result needs the whole screen and its own letter keys is a **pushed view**
rather than a transcript entry, and A01 D4 is the test: *live vs pushed is decided by input
ownership — a pushed view takes letter keys while the prompt would otherwise hold focus, so
the prompt must go.* S12's logs view binds `l`, `g`, `G` and `/`; docker-tui's S3 binds
`n`/`p`, `L` and `d`.

**It is declared here because it must be known before the verb runs, and that is forced.**
C23 I3 appends the pending entry *before* the transport is invoked, and C13 has no delete —
C23 §8a A4 ruled it must not gain one. An adapter that decided the tier on seeing its result
would produce a view *and* the transcript entry B03 §2 says a push does not leave, with no
operation able to withdraw it. The full argument is C22 §13a; what it settles here is the
party, and the party is the one `interactive` already names.

**Both `ToolDef` and `FlagDef` carry it, and an invocation is a view if either says so.**
Two declaration sites and one rule, because the surfaces need both: `/dashboard` and
docker-tui's `container stats <id>` are verbs, while S12's `--logs` is a flag on a `ps`
that otherwise appends. A verb-level field alone cannot describe a tool whose tier depends
on how it was invoked, and duplicating `ps` into two tools to express it would put one
verb's flags in two places.

**S3 was named here as `ps <uuid> --watch` and cannot be built that way.** `docker ps`
takes no positional argument, `--watch` is not a docker flag, and C06 I4 sends argv to the
far side verbatim — so the declaration would have sent a rejected flag on a verb that
rejects the id, and nothing between here and the transport would have said so. The first
consumer to declare a view found it. The example is corrected rather than deleted because
the shape it reached for is real and S12 still needs it; what changes is the claim's
strength, and it is now written down that **the flag arm's only consumer is a test
fixture** while the verb arm has a real one.

**Two combinations are refused at parse (I20)**, in I19's shape and for I19's reason:

- **`view` with `interactive`.** Both hand input ownership away, to different places — the
  view to the shell's own keymap, the handoff to a child process. There is no arbitration
  that is not a guess, and whichever C23 picked the other declaration would do nothing and
  say nothing.
- **`view` with `oneShot`.** A one-shot writes one frame to stdout and exits, bypassing the
  TTY gate; a view is nothing but a claim on a terminal that stays. The flag would be inert,
  which is A03 §2's vacuity class arriving in a manifest.

`view` with `streams` is **allowed**, and deliberately: S12's logs view is a streaming
NDJSON source rendered into a pushed view, so refusing the pair would refuse the surface the
ruling was taken for.

### `interactive` — the app author is the only party who knows

A verb that drops into a REPL or opens an editor needs the terminal, and C23 §4's
handoff row gives it one. **Nothing can work out which verbs those are.** Detection is
not available — whether a child wants a TTY is not knowable before running it — and a
maintained list of TTY program names is the shape C23 I26 forbids, wrong for every wrapper
and alias, and silent when it is wrong. The app author knows that `prism shell` is a
REPL and nobody else does, so the declaration lives beside the other things only they
know.

It is a `ToolDef` field for the same reason `streams` is: it describes how the verb
behaves when invoked, which is what this type is for. C18 carries the whole `ToolDef`
on an `app` result, so the flag reaches C23 with no parser change at all — one fact
with one home, rather than a copy on the result and no reconciliation between them.

**Two combinations are refused at parse (I19), and both are refused because the
alternative is silent.**

- **`interactive` with `streams`.** A handoff gives the terminal to the child; a
  stream reads its stdout into the transcript. Mutually exclusive at the level of who
  owns the file descriptor, and there is no arbitration that is not a guess. Whichever
  C23 picked, the other declaration would do nothing and say nothing.
- **`interactive` with `local: true`.** A local verb is handled in-process and never
  spawned (I12), so there is no child to hand the terminal to. The flag would be
  inert — A03 §2's vacuity class arriving in a manifest rather than in a rule.

Both are cross-field rules of I4's kind and are enforced where I4 is, so they fail at
parse with a path rather than at the first invocation — which for an `interactive`
verb is a user watching a terminal do the wrong thing.

**C05 knows nothing about the `shell` route's marker.** That half of the opt-in is
C18's (C18 §5), because a shell line has no flags C05 could describe: `sh` is what
parses it. The asymmetry is in C23 §4 and is the reason there are two mechanisms.

**I19 does not refuse `interactive` with `oneShot`, and the argument for refusing it
is the same one.** A one-shot writes one frame to stdout and exits; a handoff gives the
terminal away and reads no stdout at all. No consumer has reached the pair and none is
foreseen, so it is named here rather than ruled — a refusal written for a combination
nobody has built is a rule with nothing to be wrong about.

### `interactive` resolves per invocation, and the arms cannot disagree

The section above is right that only the author knows, and wrong that the author knows
it **about the verb**. `docker run` attaches by default and detaches with `-d`; `docker
exec` needs the terminal for `-it … sh` and not for `… ls`. One verb, two terminal
contracts, chosen per invocation — and both are in one file of one app (F80).

So `FlagDef` carries `interactive` too, and **an invocation's contract is the tool's
declaration unless a flag present in it says otherwise.**

**A predicate is what F80 asked for and a manifest cannot hold one.** §1: the manifest
is JSON the app ships, and T2.7 asserts `parseManifest` accepts its own serialised
output. A function does not survive that round trip. What does is a declaration per
flag, resolved by the one walk that already knows which flags are present.

**Every arm on a tool carries the same value, because an arm equal to the default
declares nothing.** `interactive: true` on a flag of a verb already interactive changes
no invocation; so does `false` on a verb that was never interactive. Both are A03 §2's
vacuity class arriving in a manifest, both are refused at parse — and the refusal is
what makes the arms agree. On a verb declared interactive every arm reads `false`; on
one that is not, every arm reads `true`. **Two flags cannot disagree because no manifest
can express the disagreement**, so there is no precedence rule, no dominant value and
nothing to arbitrate. Making the wrong state unbuildable rather than resolving it is the
trade this repository has now won six times.

`docker run -dit` falls out of it rather than being encoded: `-d` carries the only arm
`run` can have, so the invocation is not interactive — which is what docker does — and
`-i` and `-t` carry no arm because they could only carry the default.

**`false` and absent differ here, and nowhere else in this type.** Every other optional
boolean in `FlagDef` and `ToolDef` means the same thing absent as it does `false`. On
this one, absent means *this flag does not decide* and `false` means *this flag decides,
and the answer is no*. The parse-time refusal above is what catches a reader who assumes
the usual reading: writing `interactive: false` where it would be inert fails with a
path rather than doing nothing.

#### The safe direction was measured and it is the other one

F80 chose `interactive: true` for `run` on an asymmetry — *wrong that way is a flicker;
wrong the other way is a hung session*. Both halves are false, and the finding is amended
rather than restated.

| | claimed | measured |
|---|---|---|
| `/run -it alpine sh` declared **not** interactive | the session waits on a child nothing can answer | `docker run -it` with a non-terminal stdin exits **1** at once: *cannot attach stdin to a TTY-enabled container*. Reported through the ordinary error path |
| any REPL spawned without a handoff | the same hang | C21 spawns `stdio: ["ignore", "pipe", "pipe"]` — stdin is `/dev/null`, so a child reading it gets EOF. **The named mechanism does not exist** |
| `/run -d nginx` declared interactive | a flicker | C23 §4 suspends, the child writes the container id to the **real** terminal, `resume()` and `invalidate()` repaint over it, and the transcript gets `run finished`. The invocation's only output is lost silently |

So the direction called cosmetic is the one that discards the result, and the direction
called catastrophic is a reported error. **Wrong in both directions**, which is the shape
F66 had: the conclusion survived because nobody measured either half, and the reason
given would have been falsified by reading one line of C21.

That is also why this is a ruling and not a preference. A field that cannot describe its
subject is a defect; a field that describes it in the direction that loses data is one
with a deadline.

#### Where the resolution happens, and where it is read

`validateInvocation` returns it, for I21's reason and not a new one: it is the walk that
knows which flags a token names, and C18 would have to re-derive the grammar to find
out. C18's `app` result carries `interactive: boolean` — **the same member its `shell`
arm has carried since C18 §5** — so C23 §4 reads one field name on both routes rather
than a resolved value on one and a declaration on the other.

**And the route is taken after the gate, not before it (I24).** C23 read
`tool.interactive` in `route`, above the `validation.ok` check that lives inside the
non-interactive arm — so a malformed invocation of an interactive verb was spawned
without being validated at all. D17's whole argument is that a malformed invocation
costs nothing rather than an interpreter's startup, and the verbs that bypassed it are
the ones whose failure takes the screen. F119.

---

## 3. Validation

`validateInvocation` is the pre-spawn gate (D17). It runs entirely locally and produces the same shape of failure as anything else in the system — an `ErrorLike` (C04), so a validation failure renders through the ordinary error path with no special casing.

What it checks:

| Check | Example failure |
|---|---|
| Unknown flag | `--open-mrr` → suggestion via edit distance ≤ 2 |
| Unknown short flag | `-Z` |
| Flag given a value it forbids, or missing one it requires | `--mine=yes`, `--status` |
| Enum value not in `values` | `--status=finished` → lists the valid set |
| Type mismatch | `--replicas=abc` for `int` |
| Missing required positional | `promote` with no uuid |
| Too many positionals | non-variadic tool given two |
| `requires` unsatisfied | `--traffic` without `--to=canary` |
| `conflicts` violated | `--side-by-side` with `--overlay` |
| Repeated non-repeatable flag | `--status=a --status=b` |

**It does not check semantics.** Whether a UUID exists, whether a family is deployed, whether a candidate is promotable — all far-side concerns. C05 rejects what is malformed, never what is merely wrong. Over-reaching here would put the framework in the business of knowing what Prism means.

**There is no `uuid`, `sigil` or `target` type.** Those are Prism concepts, and a framework that knows them is not general. Apps declare their own shapes with `type: "pattern"` and an anchored regex — Prism's target becomes `{ type: "pattern", pattern: "^[\\w.]+:[\\w]+$" }`, its sigils `{ type: "pattern", pattern: "^@[\\w-]+$" }`. Matching is syntactic; resolution is elsewhere.

### The gate is permissive, and this is the rule

**It rejects what the far side would certainly reject, never what it merely might.** An invocation that would have worked must not be stopped here — a pre-spawn gate that costs the user a working command has taken more than it saved, and the failure is silent, because the user simply believes the command is wrong.

So both `--status=running` and `--status running` are accepted. The far side's own parser takes both forms, and picking one to enforce would be the framework deciding something the far side had already decided.

Two consequences follow, and both are written down because neither is visible from the rule.

**Completion always inserts `=`.** C19 has to choose a form — it inserts text, and text is one form or the other — and `=` is the unambiguous one: it cannot be read as a flag followed by a positional. One form taught, both accepted. Stated here and in C19 §5 so the two cannot drift apart.

**A value beginning with `-` requires `=`, and the error says so.** `--since -1h` is a missing-value failure under this rule, because `-1h` reads as a flag and the alternative — guessing from the leading character — would make the same string mean two things on two tools. `--since=-1h` works. That is correct, and the default message is unhelpful about it:

```
not:  missing value for --since
but:  --since expects a value; a value beginning with "-" must use
      --since=-1h, or the parser reads it as a flag
```

The remediation quotes the token the user actually typed. Same principle as T6.9's `ArgType` message: the failure that says what to do instead earns its extra line.

### Conflicts are directional

`conflicts` is a declaration on one flag, and the schema has never required the other flag to declare it back. `--side-by-side` naming `conflicts: ["overlay"]` while `--overlay` names nothing is how an app ordinarily writes it, and **each declaration is checked in its own right** — a one-directional conflict is a violation and is reported.

Deduplicating by name order assumed a symmetry that was never there, and dropped exactly those one-directional declarations: silently, because the pair was still *seen*, just never reported from the direction that declared it.

The *report* is deduplicated on the unordered pair. One error for one mistake — a mutual declaration is one thing the user did wrong, and reporting it twice would be a worse message rather than a stricter check. T1.12 asserts the single error, and this paragraph is what stops the "optimisation" returning.

---

## 3. The framework's own verbs

**`parseManifest` returns the app's tools plus Calcium's six**, and this belongs here rather than in C22 because it is a statement about what a manifest *is*.

`/help`, `/clear`, `/theme`, `/history`, `/debug` and `/exit` are verbs. They have names, they take arguments, they complete, they validate, and they appear in help. Everything the manifest exists to describe is true of them, and the only reason they were absent is that nobody wrote them down. C23 ships the handlers (C23 §2); C18 classifies `local` from the manifest; so without the rows, the handlers are registered for verbs nothing can ever classify to — which is precisely what C23 I27's reconciliation reports, and it is right to.

**In C05 rather than C22.** Put the merge in session construction and `parseManifest` returns something that is not yet a manifest — the seam-shaped defect where a value is valid at one call site and incomplete at another. C05 already validates, rejects duplicates and seals; "the framework's verbs are present" is one more thing that is true of every parsed manifest.

**Shadowing becomes a parse error for free**, which is the property worth more than the tidiness. I6 already refuses duplicate names, so an app declaring its own `clear` collides with the framework's and fails loudly at parse rather than silently overriding a verb the framework's own code depends on. No rule had to be added for that.

Three consequences, each checked rather than assumed:

- **`hidden` is the mechanism for anything an app should not see in completion**, and `/debug` uses it. `visibleTools` drops it and `findTool` still resolves it, which is exactly the pair that field means (§ToolDef). The other five are ordinary.
- **The six need no eighth `ArgType`.** `/theme` takes an `enum`, `/history` and `/debug` an optional `int`. EX5 claims the union stays domain-free, and the framework's own verbs failing it would have been the strongest counterexample there could be. They do not.
- **They are a `ToolDef[]`, not a `Manifest` fragment.** A fragment implies a schema version and a merge of two schemas; an array is just tools, and tools is all this is.

### The partition lives on `Manifest`, not on `ToolDef`

`tools` is every tool; `appTools` is what the app wrote. **`ToolDef` stays a description of a verb**, and that is the point of putting the split one level up.

A `source: "app" | "framework"` field on each tool would be settable by an app writing a manifest by hand — meaningless from its side, and a lie if set wrongly. Worse, every consumer *could* read it, and eventually one branches on it: `findTool` treating framework verbs differently, `visibleTools` filtering by source instead of by `hidden`, a renderer badging them. The partition makes the legitimate uses available and the illegitimate ones awkward, which a field does the opposite of.

**Two consumers, not one.** `serialise` emits `appTools`, because what round-trips is what the app wrote. And **`/help` groups by it**: `/clear` and `/exit` are different in kind from `/ps` and `/promote`, and a flat list hides that. The second consumer is why this is a partition rather than a filter at one call site.

**And T2.7's property gets sharper rather than weaker.** *Parsing its own serialised output yields an equal manifest* still holds exactly — serialise emits `appTools`, parse re-derives the framework's six, and the two are equal. That is a stronger claim than round-tripping a flat list, because it asserts the derivation is deterministic as well as that nothing is lost.

Without the partition the property is simply false: a parsed manifest contains rows the parser added, and re-parsing them hits §3's collision check. The check cannot tell an app declaring `clear` from a re-parse of output that already contains it, and nothing in the input distinguishes them — the same shape as C13's patch gate before it read `origin`.

**Error paths keep naming what the app wrote.** `fail` indexes as `tools[3]`, so framework rows are appended after the app's and never shift an index. A collision reports the framework by name rather than by index, because "already declared at `tools[7]`" is meaningless against a file with two entries in it.

---

## 3a. The match index

`findTool` must stay sub-millisecond on a manifest of 5,000 tools (T3.14), and a linear scan comparing multi-token prefixes does not. Tools are indexed by name, with the longest token count tried first, so longest-match falls out of the walk order rather than out of a sort at the end.

The index is built once per manifest and held in a `WeakMap` keyed on the **manifest object**, not on its content. Keyed on content, two manifests differing only in a field the key ignores would share an index — a bug that passes every other test in §8, which is why T2.8 asserts the identity property directly. Purity holds: same input, same output, no I/O, and the index dies with the manifest that produced it.

---

## 4. The loader state machine

| From ↓ / call → | `load(m)` | `seal()` |
|---|---|---|
| **unloaded** | → loaded (T1.1) | throw (T3.1) |
| **loaded** | → loaded, replaces (T1.2) | → sealed (T1.3) |
| **sealed** | throw (T3.2) | no-op (T3.3) |

Sealing happens at the end of composition, before input is accepted. A manifest swapped mid-session would leave completion offering flags the parser rejects — a class of bug that is very hard to see and trivially prevented.

Reloading in the `loaded` state is permitted because wiring (A01 §5 step 2) replaces the shipped fixture with one fetched from the far side, before sealing.

---

## 5. Version skew

The manifest carries the far side's `version`. C05 does not compare it to anything — it exposes it, and L4 decides what to say.

This is deliberately weaker than a compatibility check. **Reading the actual tool surface is strictly better than comparing version strings** (A01 §O1 reasoning): a tool absent from the manifest simply is not offered, and a tool with an unfamiliar flag is described by the manifest rather than by the framework's assumptions. Skew degrades into "that verb is not available here" rather than a hard refusal.

---

## 6. Invariants

- **I1** — A parsed manifest is deeply immutable.
- **I2** — `parseManifest` is total: any input produces either a manifest or a list of errors, never a throw.
- **I3** — Parsing is strict about structure and lenient about extension. Unknown *fields* are ignored; malformed *known* fields are errors. A newer far side can add fields without breaking an older TUI.
- **I4** — `values` is present iff `type === "enum"`; `pattern` is present iff `type === "pattern"`. Enforced at parse.
- **I5** — No `ArgType` encodes an app-domain concept. The union is closed and generic; app-specific shapes use `pattern`.
- **I6** — Tool names are unique. Duplicates are a parse error, not a last-wins — **including against the framework's six** (§3), so an app shadowing `clear` fails at parse rather than silently overriding a verb Calcium's own handlers depend on.
- **I7** — `findTool` returns the longest matching tool.
- **I8** — `validateInvocation` is pure and performs no I/O.
- **I9** — Validation failures are `ErrorLike`, rendering through the ordinary error path.
- **I10** — Validation never checks semantics — only shape, type, arity and declared relations.
- **I11** — A sealed store cannot be reloaded.
- **I12** — `local: true` tools are never spawned; `local: false` tools are never handled in-process.
- **I13** — The manifest version is exposed and never enforced. C05 refuses no manifest for its version alone; a verb the manifest does not declare degrades to "not available here" at the point of use, because a far side that dropped one verb is still a far side worth talking to.
- **I14** — A `hidden` tool is omitted from help and completion and remains fully invocable. Hiding is a presentation decision, never an access-control one — C05 has no notion of permission and a hidden verb that refused to run would be inventing one.
- **I15** — C05 imports nothing from `terminal/`, `presentation/` or above.
- **I16** — The gate is permissive: `--flag=value` and `--flag value` are both accepted, and no invocation the far side would have run is rejected here.
- **I17** — A `conflicts` declaration is checked in the direction it is declared; reporting is deduplicated on the unordered pair, so one mistake is one error.
- **I18** — There is exactly one distance-2 suggester in the tree, and it is C05's. A01 A.2's cutoff is a policy about *when a suggestion is worth making*, and two implementations agree about the distance and diverge about the tie-break — which is where a suggestion is wrong rather than absent, and a wrong suggestion is the thing the cutoff exists to prevent.
- **I19** — `interactive` is refused with `streams` and refused with `local: true`, **wherever either is declared** — a flag's arm re-creates the same impossible verb, and a refusal reading only the tool covers one of the two ways to write it (I24). Enforced at parse, as I4 is. Both combinations describe a verb that cannot exist, and both would otherwise be discovered by a user watching a terminal misbehave rather than by the author who declared them.
- **I20** — `view` is declarable on a `ToolDef` and on a `FlagDef`, and an invocation is a view if either declares it. It is refused with `interactive` and with `oneShot`, at parse, as I19 is, **and the refusal reads both declarations of each** (I24); it is permitted with `streams`, because S12's logs view is exactly that pair. The declaration lives here rather than on the document an adapter returns because C22 §13a shows an adapter-side decision cannot be implemented: C23 I3 appends the pending entry first and C13 has nothing that removes it.
- **I21** — A flag declared `shellOnly` is validated exactly as any other and is **absent from `argv`**. `validateInvocation` returns `transmitted` — the invocation minus those switches — because it is the one walk that knows where a flag ends, and a second copy of that grammar in C18 is the drift a shared implementation prevents. The value survives in `args`, so the shell can read what the far side never sees. **The axis is transmission, not presentation**: `--json` selects a rendering *and* is understood by the far side, so it stays transmitted; `--raw` means nothing to the binary, and `/inspect <c> --raw` ran `docker inspect <c> --raw` for docker to exit 125 (F39). `shellOnly` is refused on anything but a `bool` and refused with a `short`, at parse: a switch spans one token and a strip is a comparison, while a valued or clustered flag spans tokens the parser would have to re-derive.
- **I22** — `--help` is reserved on **every** tool, appended where the framework's six verbs are appended, and an app declaring it fails at parse as an app declaring `clear` does. Reserved rather than asked for, because a per-app `--help` is a per-app discipline and one app forgetting it is a verb with no help — the silent failure `usageBlocks` already argues against for hardcoded usage strings. Appended to `tools` and never to `appTools`, so the round-trip re-derives it rather than re-parsing it (F92).
- **I23** — `interactive` is declarable on a `FlagDef` as well as on a `ToolDef`, and an invocation's contract is the tool's declaration unless a flag present in it carries an arm. **An arm equal to the tool's default is refused at parse**, which is what makes the arms on a tool agree: every one reads `!default`, so two flags cannot disagree and there is nothing to arbitrate. Resolved by `validateInvocation` — the walk that knows which flags a token names — and returned on the success arm, for I21's reason. `false` and absent differ on this member and on no other in either type: absent means *this flag does not decide* (F80).
- **I24** — A cross-field refusal reads every declaration of each field it names, not the tool's. `view` on a flag with `interactive` on the tool is the pair I20 forbids, written the other way, and it parsed (F118). The conservative form is deliberate: an arm resolving `interactive` to `false` beside a `view` flag would be legal, and refusing it costs an app nothing today because no app declares one — **the limit is recorded rather than discovered**, and the first consumer to want the pair is the argument for narrowing it.

---

## 7. Commitments

1. The manifest is the single source of truth for verbs, sub-verbs, flags, enums, arity and local-vs-spawn (I1).
2. Calcium owns the schema, loader and validator; the app owns the manifest content (→ A01 §2).
3. A hand-written fixture manifest ships; far-side generation is a wiring-time concern (→ A01 §5).
4. Sub-verbs are multi-token names, matched longest-first (I7).
5. Validation runs before any spawn, is pure, and produces `ErrorLike` (I8, I9).
6. Validation checks shape only — never semantics (I10).
7. Unknown fields are ignored; malformed known fields are errors (I3).
8. Tool names are unique; duplicates fail parsing (I6).
9. The store seals at the end of composition and cannot be reloaded after (I11).
10. Version is exposed, not enforced. A missing tool degrades to "not available here" (I13).
11. `hidden` tools are omitted from help and completion but remain invocable (I14).
12. `ArgType` carries no app-domain concepts; `pattern` is the extension point (I5).
13. The gate is permissive — both flag-value forms are accepted, completion teaches `=`, and a value beginning with `-` is refused with a message that names the fix (I16).
14. Conflicts are directional in the check and deduplicated in the report (I17).
15. The distance-2 suggester is exported, so C18's unknown verbs and C05's unknown flags are one implementation (I18).
16. `interactive` declares a terminal contract, on a tool or on a flag, and the two combinations that cannot exist are refused at parse wherever they are declared (I19, I24).
17. `view` declares that a result is a pushed view rather than a transcript entry, on a tool or on a flag, and it is read before the verb runs because nothing can withdraw a pending entry afterwards (I20, C22 §13a).
18. A flag may be declared `shellOnly`: validated, readable, and never transmitted. The split is computed by the validator, not re-derived by the parser, and it is refused on anything but a switch (I21).
19. `--help` is a flag Calcium reserves on every verb, on the same terms as the six verbs it reserves — appended, collision-checked, and absent from what round-trips (I22).
20. A verb's terminal contract is resolved per invocation, by the validator, from the tool's declaration and the flags actually present — and an arm that could only restate the default is refused, so no two arms can disagree (I23).
21. A cross-field refusal covers every way its combination can be written, not the one the first consumer used (I24).

---

## 8. Tests

Six tiers. Every cell of the §4 transition table is covered.

### Tier 1 — unit

- **T1.1**: `load` from unloaded → `manifest` populated, `sealed` false.
- **T1.2**: `load` twice → the second replaces the first.
- **T1.3**: `seal` from loaded → `sealed` true, manifest unchanged.
- **T1.4** (I2): `parseManifest` on a valid fixture → `ok`, deeply frozen.
- **T1.5** (I3): a manifest with an unknown top-level field and unknown per-tool fields → parses, fields ignored.
- **T1.6** (I3): a manifest whose `tools[0].flags` is a string → parse error naming the path, no throw.
- **T1.7** (I4): `type:"enum"` without `values` → parse error; `values` on a non-enum → parse error; `type:"pattern"` without `pattern` → parse error.
- **T1.7b** (I4): an unanchored or syntactically invalid `pattern` → parse error, not a runtime throw at validation.
- **T1.7c** (I5): `ARG_TYPES` equals a list written out **literally in the test file**, so adding `uuid` or `target` fails the build. Literal rather than derived: a list computed from `ARG_TYPES` agrees with itself and passes on any addition, which is a rule with nothing to be wrong about.
- **T1.8** (I6): two tools named `ps` → parse error, not last-wins.
- **T1.9** (I7): tools `serving` and `serving scale` both present, tokens `["serving","scale","web"]` → matches `serving scale`, residual `["web"]`.
- **T1.10** (I7): tokens `["serving"]` → matches `serving`, residual `[]`.
- **T1.11**: tokens matching nothing → `null`.
- **T1.12**: each validation check in §3 fires on a crafted argv and passes on the corrected one — ten cases, one per row.
- **T1.13**: unknown flag `--open-mrr` against a tool with `--open-mr` → error carries the suggestion; `--zzzzz` → error with no suggestion.
- **T1.14** (I9): every validation failure is `ErrorLike` with a non-empty `message`.
- **T1.15**: a `hidden: true` tool is absent from `visibleTools` **and** resolvable through `findTool` — asserted together, in one test. Split into two, both pass while the intent they encode goes missing.
- **T1.15b**: `oneShot: true` is carried through parsing and is readable by C22's gate.
- **T1.16** (I16): `--status running` and `--status=running` produce the same `args`. Both forms, one result — the permissive rule as an equality rather than as two separate passes.
- **T1.17** (I16, §3): `--since -1h` → a `missing_value` error whose remediation names the token and the `=` form; `--since=-1h` validates. Both halves in one test: the message is only right if the thing it recommends actually works.
- **T1.18** (I17): a one-directional `conflicts` declaration, given both flags → one error, reported from the flag that declares it. A mutual declaration → still one error.
- **T1.19b** (I23, I24): a flag arm equal to the tool's default → parse error at `tools[i].flags[j].interactive`, in both directions (`true` on a plain verb, `false` on an interactive one); a flag arm of `true` on a `streams` tool and on a `local` tool → parse error, which is I19 read through the flag; a flag declaring `view` on a tool declaring `interactive` → parse error, **which is the row that fails today** (F118). And the arm that must survive all four: `run` declared `interactive: true` with `detach` declaring `false` parses, and the value reaches the `FlagDef`.
- **T1.19** (I19): `interactive` with `streams` → parse error at the tool's path; `interactive` with `local: true` → parse error; `interactive` alone on a spawned tool → parses, and the field survives onto the `ToolDef`. The third half is what stops the rule from being a blanket refusal that passes the first two.

### Tier 2 — contract / interface

- **T2.1** (I1): the parsed manifest is frozen at every depth.
- **T2.2** (I8): `validateInvocation` called a hundred times returns deeply equal results and performs no I/O.
- **T2.3** (I2): a fuzz corpus of a thousand malformed inputs — truncated JSON, wrong types at every position, deeply nested junk — produces errors, never a throw.
- **T2.4**: every `ArgType` in the union has a validator — asserted exhaustively, so adding a type without one fails the build.
- **T2.5** (I12): every tool resolves to exactly one execution route; no tool is both local and spawnable.
- **T2.6** (I15): the module graph shows no import from `terminal/` or above.
- **T2.7**: `parseManifest` accepts its own serialised output — round-trip identity.
- **T2.10** (I23): `validateInvocation` resolves the contract. `run -d nginx` → `false`; `run -it alpine sh` → `true`; `run -dit nginx` → `false` **with no precedence rule consulted**, because `-i` and `-t` carry no arm and cannot; `exec c ls` → `false` and `exec -it c sh` → `true` on a tool that declares nothing. The `-dit` row is the one that would need arbitration under any other shape, and it is the discriminator.
- **T2.9** (I18): the exported `suggestName` is the one the flag path uses — an unknown flag's suggestion and the same call made directly agree, including the tie-break where two candidates sit at the same distance. Identity of behaviour asserted on the case where two implementations would differ, not on the case where they would agree.
- **T2.8** (I8): `findTool` over the same manifest twice returns deeply equal results, **and** a second manifest object with identical content does not observe the first's results. `findTool` caches its match index (§3a) and this is the first cache in the tree, so purity is asserted rather than argued. The second half is the load-bearing one: a cache keyed on content rather than object identity passes every other test in this suite and breaks the moment two manifests differ only in a field the key ignores. Asserted by comparing results — the test does not know the cache exists.

### Tier 3 — edge cases

- **T3.1**: `seal` before `load` → throws.
- **T3.2** (I11): `load` after `seal` → throws.
- **T3.3**: `seal` twice → no-op.
- **T3.4**: an empty `tools` array → parses; `findTool` always returns null; the shell still opens.
- **T3.5**: a tool with no args and no flags → validates a bare invocation, rejects any argument.
- **T3.6**: a variadic positional → accepts zero, one and many.
- **T3.7**: `--` terminator → everything after it is positional, including tokens that look like flags.
- **T3.8**: a flag value containing `=` (`--search=a=b`) → value is `a=b`.
- **T3.9**: a flag value that is empty (`--search=`) → accepted as empty string, distinct from absent.
- **T3.10**: clustered short flags (`-abc`) → expanded to three, and rejected if any takes a value.
- **T3.11**: a `requires` cycle between two flags → parse error, not an infinite loop at validation.
- **T3.12**: `conflicts` naming a flag that does not exist → parse error.
- **T3.13**: a tool name containing more spaces than any invocation supplies → never matches, no crash.
- **T3.14**: a manifest 10 MB in size with 5,000 tools → parses within budget; `findTool` stays sub-millisecond. **Measured: 9.6 MB parsed in 32 ms, `findTool` averaging 0.6 µs per call** — the bound is 1,000 µs, so there are three orders of magnitude of headroom, and a regression of ten times would still pass. The figure is here rather than only the bound because a bound with no measured value behind it is a bound nobody can tell has moved.
- **T3.15**: duplicate flag names within one tool → parse error.
- **T3.16**: a short flag colliding across two flags of the same tool → parse error.
- **T3.17**: unicode in tool and flag names → handled, and completion matches on grapheme boundaries.
- **T3.18**: a value-taking flag last in `argv`, with no token after it → the plain "requires a value" message. There is no token to quote and no `=` form to recommend, so the remediation is absent rather than invented.

### Tier 4 — integration

- **T4.1** (with C18): a classified `/`-prefixed input resolves through `findTool` and validates before any transport call. Asserted by a spy proving the transport was never reached on a validation failure.
- **T4.2** (with C19): completion candidates for `--status=` come from the manifest's `values`, with no hardcoded list anywhere in the completion module.
- **T4.3** (with C19): adding a flag to the fixture manifest makes it completable with no TypeScript change. The anti-drift property, tested directly.
- **T4.4** (with C06): a `local: true` tool never reaches the transport; a `local: false` tool always does.
- **T4.5** (with C06): `streams: true` selects the streaming transport path.
- **T4.6** (with C04): a validation failure renders as an ordinary error document — same blocks as a far-side failure, no special case.
- **T4.7** (with L4): help output is generated wholly from the manifest; no verb text is hardcoded.

### Tier 5 — e2e

- **T5.1**: a session started with the fixture manifest completes, validates and rejects correctly for every tool, with no far side present at all.
- **T5.2**: replacing the fixture with a manifest fetched from a real binary (B6) changes the completable surface with no code change.
- **T5.3**: a manifest declaring a tool the TUI has no adapter for → the tool runs and renders through the fallback adapter.
- **T5.4**: a manifest omitting a tool the app previously had → the verb is reported as unavailable, and the session continues.

### Tier 6 — fail-on-revert

- **T6.1** (I10): adding a semantic check — verifying a UUID exists at validation time → T2.2 fails on the I/O assertion.
- **T6.2** (I3): making unknown fields a parse error → T1.5 fails, catching the regression that breaks against a newer far side.
- **T6.3** (I7): shortest-match resolution → T1.9 fails.
- **T6.4** (I11): permitting reload after seal → T3.2 fails.
- **T6.5** (I6): last-wins on duplicate names → T1.8 fails.
- **T6.6** (anti-drift): hardcoding an enum in the completion module → T4.3 fails when the fixture changes and the completion does not.
- **T6.7** (I2): a parse path that throws on malformed input → T2.3 fails.
- **T6.8** (I12): spawning a `local` tool → T4.4 fails.
- **T6.9** (I5): adding a domain-specific `ArgType` → T1.7c fails, with a message carrying the rule rather than the diff: *an `ArgType` describes a shape, not a domain concept — a uuid is a `pattern`, a target is a `string`*. A build failure that says what to do instead earns its extra line.
- **T6.10** (I16): rejecting `--flag value` pre-spawn → T1.16 fails, and the gate starts refusing invocations the far side would have run.
- **T6.11** (§3): reverting the `-`-value remediation to a bare "missing value" → T1.17 fails on the message, leaving the user to discover `=` for themselves.
- **T6.12** (I17): deduplicating conflicts by name order rather than by the unordered pair → T1.18 fails on the one-directional case, which is the ordinary way an app declares it.
- **T6.14** (I23): resolving the contract from `tool.interactive` alone → T2.10's `-d` row fails. The verb is spawned into a handoff, the container id is written to a terminal that is repainted a frame later, and the transcript says it finished — which is the failure measured in §2 and the reason the field changed shape.
- **T6.15** (I24): reading only the tool's `view` in I20's refusal → T1.19b's fourth row fails. That is the state the rule shipped in, and it passed every test written against the pair declared the way its first consumer declared it.
- **T6.13** (I19): accepting `interactive` alongside `streams` → T1.19 fails. A verb declaring both reaches C23, where whichever path loses does nothing and reports nothing — the failure the parse-time refusal exists to move to the author.

---

## 8a. The walk — the rows where two declarations meet

**A classification table, not a trace.** A manifest is at rest: there are no events between
its rules, so every interaction here is two statements that both hold about one declaration.
C18 §8a is the same shape and for the same reason; C16's and C19's traces are not, and
choosing the trace because `interactive` sounds like a state machine is how the structural
half goes unexamined.

Indexed by **which two declarations could both claim the answer**, not by which inputs exist.
A row governed by one rule restates that rule.

| # | tool | flag arm | else | the two rules | ruling |
|---|---|---|---|---|---|
| 1 | — | `true` | — | *only the author knows* × *an arm decides* | permitted — `exec` is the consumer |
| 2 | `true` | `false` | — | same | permitted — `run --detach` is the consumer |
| 3 | `true` | `true` | — | *an arm decides* × *the tool is the default* | **refused**: it decides what was already decided (A03 §2) |
| 4 | — | `false` | — | same | **refused**: same |
| 5 | — | `true` | `streams` | I19 × the arm | **refused** — I19 read through the flag |
| 6 | — | `true` | `local` | I19 × the arm | **refused** — same |
| 7 | `true` | `false` | `streams` | I19 already refuses the tool pair | unreachable; no rule needed |
| 8 | — | `true` | tool `view` | I20 × the arm | **refused** |
| 9 | `true` | — | **flag** `view` | I20 reads the tool's `view` only | **refused — and it parses at HEAD.** F118 |
| 10 | — | `true` | flag `view` | both arms | **refused** |
| 11 | `true` | `false` | flag `view` | resolves to *not interactive, is a view* — legal | **refused anyway**; I24 records the limit |
| 12 | `true` | `false` on two flags | — | *two arms* × *arbitration* | resolved `false`; rows 3–4 make disagreement unbuildable, so there is nothing to arbitrate |
| 13 | `true` | `false`, flag **absent** from this invocation | — | *declared* × *present* | the default: resolution reads the flags actually given |
| 14 | `true` | `false` on a `shellOnly` flag | — | I21 strips it from `argv` × it still decides | resolved `false` — it is an occurrence, and presence is what resolution reads, not transmission |
| 15 | any | any | **validation failed** | *the contract is resolved by the validator* × *C23 routes on it* | **route after the gate.** F119 — C23 read the declaration above the `validation.ok` check, so an interactive verb was spawned unvalidated |

**Three of fifteen are defects at HEAD**, and none is a row about `interactive` alone.
Row 9 is a rule covering one of the two ways to write its own combination; row 15 is a
gate the route steps over; rows 3 and 4 are the ruling that removes the arbitration the
naive shape would have needed. Rows 1, 2, 13 and 14 are the ones that had to keep working.

**Row 12 is the one worth reading twice.** It is the row every other shape of this field
answers with a precedence policy — *`false` wins*, *the last flag wins*, *the tool wins* —
and the ruling answers it by making the question unaskable. A policy would have been
correct, testable, and a thing to remember; rows 3 and 4 mean there is nothing to remember.

## 8b. The walk — entry 6's third axis, and what a presentation flag selects

**A table again, and for §8a's reason.** A manifest is at rest; a flag's declarations are
statements that all hold at once, with no event between them. Indexed by which two
declarations could both claim an answer.

### 8b.1 — the premise the roadmap states is false at HEAD, and this is what remains

Roadmap 2.2 reads *"every declared flag is transmitted, so `--raw` reached docker and it
exited 125"* and *"the shim absorbed it."* **Both halves are the old state.** I21 shipped:
`validateInvocation` returns `transmitted`, a `shellOnly` switch is absent from `argv`, and
`examples/docker/bin/docker-json:152` records the strip being **deleted** rather than
commented, citing F39 by name.

So F39 is two claims and only one is closed:

| F39's claim | at HEAD |
|---|---|
| `--raw` reaches the far side and it exits 125 | **closed** by I21 — the flag never reaches `argv` |
| there is no way to declare a flag that selects a **rendering** rather than an invocation | **open**, and it is the whole of entry 6.2 |

**The finding's body is stale in the other direction from its title**, which is why this is
worth a row rather than a correction in passing: F39 still reads *"absorbed by the shim, which
now strips `--raw` for `inspect`"*, and the shim says the opposite. Read the abstract against
its own section before reading the section against the code — here the title survived and the
body did not.

### 8b.2 — the axis is settled before the design starts, and `shellOnly` settled it

I21 states it outright: **the axis is transmission, not presentation, and the two do not
coincide.**

| flag | selects a rendering | far side understands it | `shellOnly` |
|---|---|---|---|
| `--json` | yes | yes — C06 appends it | **no**, it stays transmitted |
| `--raw` | yes | no | yes |
| `--all` | no | yes | no |
| `--help` | *not a rendering of the result* — see 8b.3 | no | yes |

**Two of the four cells disagree with each other**, so no widening of `shellOnly` can express
presentation: `--json` is presentation-selecting and transmitted, `--raw` is presentation-
selecting and not. A field that meant both would be wrong about `--json` on the day it landed.
That is a ruling inherited rather than made, and the walk's job here is to record that it was
already made and by which sentence.

### 8b.3 — the row the walk owes: two consumers that look alike

`--help` and `--raw` are both `shellOnly`, both change what the reader sees, and **they are
not the same kind of thing.**

| | `--raw` | `--help` |
|---|---|---|
| is there a result to render? | **yes** — the verb runs and returns a document | **no** — the verb does not run at all |
| what is selected | a rendering **of the result** | a mode **of the invocation** |
| when it is read | after the far side answers | before anything is spawned |
| built today | no | yes — I22, and `usageBlocks` at `src/shell/documents.ts:215` |

**These are two axes and one of them already exists.** `--help` is the invocation-mode axis
and it is not a field at all — it is a reserved name (I22) whose behaviour the shell hardcodes,
because *a per-app `--help` is a per-app discipline*. `--raw` is the result-rendering axis and
it has no field.

**The ruling: entry 6.2's field is the result-rendering axis alone, and it does not
generalise to invocation modes.** The reasons, in the order they bind:

1. **They are read at different times by different code.** An invocation mode is resolved
   before the spawn, by the same walk that resolves `interactive` (I23); a result rendering is
   resolved after a document exists, by whatever composes it. A field spanning both would be
   read twice by two components for two purposes, which is the seam A02 forbids one field from
   straddling.
2. **The invocation-mode axis already has an occupant and it is not a field.** `--help` is
   reserved, and I22's argument for reserving it — one app forgetting it is a verb with no
   help — applies to every member of that axis. A declarable invocation mode would be the
   thing I22 refuses.
3. **Two consumers that look alike is where a vocabulary gets fixed wrongly**, and the
   measured instance is `view` (I20): a flag-level and a tool-level declaration of *the same*
   axis, which cost F118 — a refusal reading one declaration of two. A field covering two
   axes would be that defect with no second declaration to compare against.

**What the field does NOT decide, stated because the absence is the finding.** It does not
decide transmission — I21 does, independently, and `--json` is the case that proves they must
stay separate. An app declaring `--json` writes the presentation field **and no `shellOnly`**;
an app declaring `--raw` writes both. If a future field implies the other, `--json` is the row
that breaks it.

### 8b.4 — what the walk cannot rule, and why it stops here

**The field's *value* is not rulable from inside this component.** A rendering selector names
something C09 resolves, and C05 is L0: it can carry a string the way `kind` is a string, or a
closed set the way `ARG_TYPES` is closed. §2's `ARG_TYPES` rule says a closed set is right when
the framework must understand every member, and an app's `--wide` is not a member the framework
can know. That is a C09/C22 question and it is named here rather than answered, which is what
*say so rather than choosing* asks for.

**And one fact belongs beside the field before it is written, not after.** MG24 matches
published members by name and is exact for 376 of 1150 members — the figure `make enforce`
prints every run. If this field is named `kind`, `id`, `text` or `width`, **MG24 can say
nothing about whether anything consumes it**, because those names have 30, 23, 15 and 10 owners
respectively. `elementId` was named for exactly this reason in C26 and the argument was correct
and guaranteed nothing (F159); here the argument is correct and the *other* half — the name —
is the half that still works. A firing is trustworthy; only a silence is suspect.

### 8b.5 — the code step falsified the walk, and the field has no instance

**§8b.1 divided F39 into a closed half and an open half. Going to write the open half showed
it has no instance.** The walk is right that no field declares a presentation. It was wrong
that anything needs one, and the three examples the roadmap names are the measurement:

| the want | how it works at HEAD | field needed? |
|---|---|---|
| `--raw` | declared `shellOnly`, read at `examples/docker/src/inspect.ts:192` as `ctx.flags["raw"]`, and the adapter returns `splitRaw(…)` instead of `structuredBlocks(…)` | **no** |
| `--json` | transmitted, because the far side understands it — the case §8b.2 uses to prove the axes differ | **no** |
| `--wide` | `--raw`'s shape exactly: a `shellOnly` switch the adapter reads | **no** |

The consumer's own comment is the ruling written before the walk asked: *"`ctx.flags`, not
`result.argv`: a shellOnly flag is absent from argv by construction, **which is the whole of
what F39 asked for** (C05 I21)."*

**So F39 is CLOSED, and marking it PARTIAL an hour earlier was the same error one level up.**
§8b.1 read F39's second sentence — *there is no way to declare a flag that selects a rendering*
— as an open defect without asking whether any app still hits one. That is *a citation reads as
coverage* inverted: a sentence read as a **gap** because it is literally true, with no check
that anything is missing. The test is the same in both directions — **would landing this close
it** — and here the thing that landed was I21, and it closed it.

**F39's sentence named the wrong axis, which is why this was findable only from the code.** It
said *rendering rather than invocation* and the axis it actually needed was **transmission**.
I21 gave it transmission and the want evaporated, because rendering was never the framework's
decision — the adapter composes the document, and which blocks it puts in is the adapter's
business by construction (A02 Seam 2). C13's patch gate is the precedent: two instances looked
like one axis and the third showed the axis was wrong rather than the classification incomplete.

### 8b.6 — the ruling: the field arrives with the resolution that reads it

**A presentation-selecting field would be a published member with no consumer**, which is
MG24's founding class and F21's shape — *a field that existed, so nothing looked*.

**This repo has already ruled this exact question, three weeks ago, on this exact kind of
field.** C26 §5 draws `arrow` and `escape` on `NavElement`; `presentation/blocks/types.ts:134`
records why they are not there: *"landing them before C26 §4's resolution exists would publish
two fields with no reader… They arrive with the resolution that reads them, in the commit that
gives them a consumer."* That withdrawal was re-measured against the widened MG24 (F159) and
holds. The same ruling applies here and is inherited rather than re-derived.

**Its consumer is named and it is entry 21.** `--help` per verb is the one party that needs to
know *this flag changes what you see* as distinct from *this flag changes what runs*, because
that is a grouping in rendered usage. `usageBlocks` exists (`src/shell/documents.ts:215`), and
until it renders per-verb help nothing reads the distinction.

**And that answers the value question §8b.4 left open, by dissolving it.** The value set is
whatever `--help` must be able to say, so it cannot be chosen before the consumer exists —
choosing it now would be picking a vocabulary for a reader that has not been written, which is
how `view` acquired two declarations and F118. §2's `ARG_TYPES` rule says a closed set is right
when the framework must understand every member; **whether the framework must understand this
one is a question only entry 21 can answer**, and it is the freeze-relevant part.

**What the freeze needs from this section, since that was the reason for spec-first.** Nothing
is added to `FlagDef`. The public type is unchanged, and a field added later with its consumer
is additive — which is what entry 6.2 always claimed to be, and is now true of the deferral
rather than of the field.

### 8b.7 — the reader exists, and it answers 6.2 by not needing it

**§8b.6 deferred the value set to entry 21's `--help`, on the ground that a vocabulary cannot
be chosen before its reader is written. Going to write that reader found it already written.**

| entry 21's claim | at HEAD |
|---|---|
| reserve `--help` framework-side | `FRAMEWORK_FLAGS` — `framework.ts:126`, `shellOnly: true` — appended to every tool (I22) |
| a user-invokable path, not only `exitCode === 2` | `execution.ts:1300` routes both `app` and `local` on `validation.args["help"]`, gated on `validation.ok`, and returns before any spawn |
| the document | `usageDoc` — `src/shell/documents.ts:211` — `status: "ok"`, because asking what a verb takes is not an error |
| `/help`'s flat wall becomes two-level | `handlers.ts:110` groups by C05 §3's partition, and `/help keys` is the second question |
| tested | T4.8 asserts **both halves** — the document, and that nothing spawned |

**So the question is answerable now, and the answer is that there is no field.**

**`--help` replaces the result; it does not select among renderings of one.** The route returns
before the spawn, so there is no result to render — `usageDoc` is composed from the manifest
alone. That is the disjunction the deferral turned on, and it falls on the side where no
vocabulary is needed: *one rendering that replaces the result entirely* is a boolean `shellOnly`
switch whose handler composes a different document, which is exactly what `--raw` already is at
`examples/docker/src/inspect.ts:192` — the same shape, one handled framework-side because the
name is reserved, one adapter-side because the app declared it.

**And `usageBlocks` groups nothing.** `mapping.ts:169` lists every flag flat, `--help` among
them, *"since it is a flag like any other"* (T4.8). The one reader that could have wanted to say
*these change what you see* does not distinguish them — so the grouping want has no instance
either, which was the last thing holding the field open.

### 8b.8 — the ruling, and §2's closed-set test answered

**Entry 6.2 closes with no field, and `FlagDef` is unchanged permanently rather than pending.**

§2 asks whether the framework must understand every member of a set. **There are no members.**
The framework understands exactly one presentation-selecting flag — `--help` — and it
understands it by **reserving the name**, which is I22's mechanism and not a field. Every other
one is the app's, read from `ctx.flags`, and A02 Seam 2 already says which blocks go into a
document is the adapter's business. A field would have published a fact the framework has no
use for, to be read by a component that composes nothing.

**Three deferrals in a row, each correct and each nearly wrong in the same direction.** §8b.4
left the value open as a C09/C22 question; §8b.6 narrowed it to *whatever entry 21 must say*;
§8b.7 found entry 21 built and needing nothing. **Every step was a citation to a downstream
reader, and every step reads as coverage** — the finding is not that any of the three was
mistaken but that a deferral chain is a claim nothing resolves. *Would landing this close it*
applies to a deferral as much as to a fix, and the only thing that answered it was going to the
reader and finding it there.

## 9. Out of scope

| Not here | Where |
|---|---|
| Classifying `/`-prefix vs bare vs path | C18 |
| Turning candidates into a menu, ghost text, caching | C19 |
| Spawning, streaming, cancellation | C06, C21 |
| Semantic validation of any kind | The far side |
| Generating the manifest | The far side (B6); a fixture ships until then |
| Rendering help | L4, from this data |
