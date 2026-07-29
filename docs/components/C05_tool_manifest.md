# C05 — Tool manifest

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` (schema, loader, validator) + app (the manifest itself) |
| **Layer** | L0 data |
| **Depends on** | C04 (`ErrorLike` only). Otherwise pure types, a loader and a pure validator |
| **Consumed by** | C18 parser (classify, validate before spawn) · C19 completion (flags, enums, arity) · C06 transport (`local` vs spawn) · L4 (help generation, startup checks) |
| **Source** | A01 D14, D17, D22, D25, B6 · A01 §5 wiring · A02 §2, §6 |
| **Status** | Draft |

---

## 1. Purpose

The manifest is what stops the TUI from guessing. Without it, tab completion hand-maintains a copy of the far side's flags and drifts the first time someone adds one; the parser cannot reject `--open-mrr` before paying 300 ms to have a subprocess reject it; and `--help` is written twice.

It is also the thing that makes the framework general. `tui-kit` knows nothing about `promote` or `--replicas`; it knows there is a tool with typed args, and every behaviour above is derived from that.

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
  | Readonly<{ ok: true;  args: Readonly<Record<string, unknown>> }>
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
}>;

type Manifest = Readonly<{
  schema: "tui.manifest/1";
  binary: string;
  version: string;                    // the far side's version, for skew reporting
  tools: readonly ToolDef[];
}>;

function parseManifest(raw: unknown): Result<Manifest, readonly ManifestError[]>;
function findTool(m: Manifest, tokens: readonly string[]): ToolMatch | null;
function visibleTools(m: Manifest): readonly ToolDef[];
function validateInvocation(tool: ToolDef, argv: readonly string[]): ValidationResult;

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
- **I6** — Tool names are unique. Duplicates are a parse error, not a last-wins.
- **I7** — `findTool` returns the longest matching tool.
- **I8** — `validateInvocation` is pure and performs no I/O.
- **I9** — Validation failures are `ErrorLike`, rendering through the ordinary error path.
- **I10** — Validation never checks semantics — only shape, type, arity and declared relations.
- **I11** — A sealed store cannot be reloaded.
- **I12** — `local: true` tools are never spawned; `local: false` tools are never handled in-process.
- **I13** — C05 imports nothing from `terminal/`, `presentation/` or above.

---

## 7. Commitments

1. The manifest is the single source of truth for verbs, sub-verbs, flags, enums, arity and local-vs-spawn.
2. `tui-kit` owns the schema, loader and validator; the app owns the manifest content.
3. A hand-written fixture manifest ships; far-side generation is a wiring-time concern.
4. Sub-verbs are multi-token names, matched longest-first.
5. Validation runs before any spawn, is pure, and produces `ErrorLike`.
6. Validation checks shape only — never semantics.
7. Unknown fields are ignored; malformed known fields are errors.
8. Tool names are unique; duplicates fail parsing.
9. The store seals at the end of composition and cannot be reloaded after.
10. Version is exposed, not enforced. A missing tool degrades to "not available here".
11. `hidden` tools are omitted from help and completion but remain invocable.
12. `ArgType` carries no app-domain concepts; `pattern` is the extension point.

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

### Tier 2 — contract / interface

- **T2.1** (I1): the parsed manifest is frozen at every depth.
- **T2.2** (I8): `validateInvocation` called a hundred times returns deeply equal results and performs no I/O.
- **T2.3** (I2): a fuzz corpus of a thousand malformed inputs — truncated JSON, wrong types at every position, deeply nested junk — produces errors, never a throw.
- **T2.4**: every `ArgType` in the union has a validator — asserted exhaustively, so adding a type without one fails the build.
- **T2.5** (I12): every tool resolves to exactly one execution route; no tool is both local and spawnable.
- **T2.6** (I13): the module graph shows no import from `terminal/` or above.
- **T2.7**: `parseManifest` accepts its own serialised output — round-trip identity.
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

---

## 9. Out of scope

| Not here | Where |
|---|---|
| Classifying `/`-prefix vs bare vs path | C18 |
| Turning candidates into a menu, ghost text, caching | C19 |
| Spawning, streaming, cancellation | C06, C21 |
| Semantic validation of any kind | The far side |
| Generating the manifest | The far side (B6); a fixture ships until then |
| Rendering help | L4, from this data |
