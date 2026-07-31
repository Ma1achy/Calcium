# C20 — History store

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L3 interaction |
| **Depends on** | C15 (reverse-search overlay) · C04 (`Block`, for overlay and listing content) · C18 (`tokenise`, for redaction) · an injected filesystem and clock |
| **Consumed by** | C16 (`↑`/`↓`, `⌃r`) · L4 (`/history`, applying the returned string to C17) |
| **Source** | `j22` #5, §history · A01 Appendix A.3 · A02 §2 |
| **Status** | Draft |

---

## 1. Purpose

History is what makes a shell feel like a shell — `↑↑ Enter` instead of retyping, `⌃r` instead of remembering. C20 owns the entries, their persistence, the navigation cursor, and reverse search.

**It does not touch the editor.** `previous()` and `next()` return strings; L4 applies them to C17. Consistent with the orchestration pattern used for `lifecycle.resume()`, theme switching and scroll commits, and it keeps C20 testable as a data structure.

---

## 2. Persistence

Entries live at `<stateDir>/history`, one command per line, with a sidecar at `<stateDir>/history.meta` carrying timestamp and exit code per line, index-aligned.

**Newlines are escaped.** Multi-line commands are real (C17 §4), and a one-command-per-line format that ignores them corrupts on the first `Alt-Enter`. `\n` is written as `\\n` and decoded on load; a literal backslash is doubled.

Appends are immediate — one line per submitted command, so a crash loses nothing. **A write failure is never fatal**: in-memory history continues, a warning is recorded once, and the next successful write catches up (`j22`).

**Writes are serialised (I16).** The injected filesystem is asynchronous, and two appends in flight at once can reach the two files in either order — which de-aligns the sidecar, and index alignment is the one thing §2 promises about it. So every write goes through a single chain, and `flush()` resolves when every append issued before it has settled or failed. This is what makes T3.16's last-writer-wins a statement about two *sessions* rather than about two keystrokes.

### The exit path is synchronous, so one write is too

C22 §8 flushes history inside `beforeRelease`, which C01 I5 requires to be synchronous and not to throw — a signal handler cannot await. Node does not wait for a pending promise at exit, so with an asynchronous `flush` alone the append still in flight when the process ends is lost, and that append is the command the user has just typed. It is the only one they would notice.

So `HistoryFs` carries **one synchronous escape, `appendFileSync`, used on the exit path and nowhere else** (I17). The seam is wider than it wants to be and the narrower alternatives are worse: a `flush` returning a synchronous drain puts the same call behind a shape that hides what it does, and accepting the loss means the feature's most visible entry is the one it drops. `drain()` is what `beforeRelease` calls; `flush()` remains for everything that can await.

Cap is **10,000 entries**, FIFO. `entries` never exceeds it. The two files are **compacted together** — rewritten from memory, newest 10,000 — when the file grows past cap + 256, and truncated to the newest 10,000 on load. The slack is there because the obvious reading of the cap is "rewrite both files on every append once full", which is a megabyte of writing per submitted command; the observable promise is about `entries` and about what a load produces, and both hold with the slack (I10). A mismatch in length between the two files is treated as corruption.

### Corruption

A malformed file is treated as empty and a warning is logged (`j22`). The session opens normally. Refusing to start because history is unreadable would be a worse failure than losing it — and the sidecar going missing while the commands survive is common enough (a partial copy, an interrupted rotation) that the commands are kept and the metadata reset.

---

## 3. Redaction

`j22` R12 specifies a heuristic: length ≥ 20 and Shannon entropy ≥ 3.5 bits per character gets `[REDACTED]`.

**That heuristic is broken for this tool as specified.** A UUID is 36 characters of hex with roughly 4 bits per character; a Git SHA is 40. Both clear the bar comfortably, and both are the single most common argument in Prism's history. `/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12` would persist as `/ps [REDACTED]`, which makes the feature actively harmful — the entries people most want to recall are exactly the ones destroyed.

So redaction is **primarily positional, with entropy as a secondary net**:

```
1  a token in the value position of a flag whose name matches
   /token|password|passwd|secret|api[-_]?key|credential|auth/i    → redact
2  an environment assignment matching the same pattern
   (TOKEN=…, GITLAB_PASSWORD=…)                                   → redact the value
3  otherwise, apply the entropy heuristic, but exempt tokens
   matching a UUID, a 7–40 character hex SHA, a semver, a path,
   or a flag name                                                 → redact if still over
```

Positional redaction is reliable and catches the realistic case — someone pasting `--token=ghp_…`. The entropy net catches an unrecognised shape without destroying the identifiers the tool is built around.

**"Flag" and "token" are C18's, where the command parses.** The rules above are positional, and a position is a token — so redaction tokenises with C18's `tokenise`, which already knows what a quote does. Where the command does not parse, it falls back to a whitespace split: a paste is not obliged to be valid input, and a secret inside an unparseable line is still a secret. Writing a second tokeniser here would be C18 ruling 4 contradicted one component over.

**Every line is scanned, and redaction runs before escaping (I18).** C17 §4 shipped three newline bindings, so a submitted command can carry a newline and `GITLAB_PASSWORD=hunter2` can sit on its third line. Redaction takes the logical command, line by line; escaping is what happens to the result on its way to disk. The other order scans `\\n`-joined text in which the environment rule's line anchor no longer has a line to anchor to.

Redaction happens **before persistence, not before display**. The in-memory entry for the current session keeps its value so `↑` still works within the session; only what reaches disk is redacted.

---

## 4. Navigation

```typescript
function openHistory(deps: HistoryDeps): Promise<HistoryStore>;

interface HistoryStore {
  append(command: string, exitCode: number): void;
  previous(current: string): string | null;
  next(): string | null;
  resetNavigation(): void;
  search(query: string, from?: number): SearchHit | null;
  list(filter?: string): readonly HistoryEntry[];
  listBlocks(filter?: string): readonly Block[];
  rerun(index: number): string | null;
  clear(): void;

  // Reverse search — §7's second machine, one call per column of its table.
  searchOpen(): void;
  searchType(text: string): void;
  searchBackspace(): void;
  searchOlder(): void;
  searchEnd(action: "submit" | "accept" | "cancel"): string | null;
  searchLayer(anchor: Readonly<{ row: number; rows: number }>): Layer;

  clearConfirmLayer(): Layer;

  flush(): Promise<void>;
  drain(): void;                       // synchronous; `beforeRelease` only

  readonly entries:     readonly HistoryEntry[];
  readonly navigating:  boolean;
  readonly searchState: SearchState | null;
  readonly warnings:    readonly string[];
}

type HistoryDeps = Readonly<{
  fs:       HistoryFs;
  clock:    () => number;
  stateDir: string;
  cap?:     number;                    // default 10,000
}>;

/** Narrow on purpose — see below. C22 §2's `FileSystem` satisfies it structurally. */
interface HistoryFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  appendFileSync(path: string, data: string): void;
}

type HistoryEntry = Readonly<{ command: string; ts: number; exitCode: number }>;
type SearchHit    = Readonly<{ command: string; index: number }>;
type SearchState  = Readonly<{ query: string; hit: SearchHit | null }>;
```

**Construction is asynchronous and everything after it is not.** The filesystem is injected and its reads return promises, so the load has to be awaited somewhere; doing it in `openHistory` means every call above answers from memory, synchronously, which is what lets `previous()` return a string rather than a promise on a keystroke path where a promise would be a frame of latency for no reason.

**`searchEnd` takes the action rather than being three methods.** §7's table has three columns that end a search and one behaviour behind them — deactivate, return the match or null — differing only in what L4 then does with the string. Three methods would be three implementations of one thing, and the failure mode is the familiar one: two of them get updated.

**`HistoryFs` is declared here, not imported.** C22 owns the real `FileSystem` and C22 does not exist; more to the point it is L4, and an L3 component reaching up for a type is the edge A02 Seam 4 exists to prevent. So the seam is C20's, narrow, and structurally satisfied by C22's when it lands — the `ReadDir` precedent in C19's path source, for the same reason: a wider type here would let a later edit reach for something the component never needed.

**Warnings are returned, never emitted (I17).** C20 has no logger, cannot write to the terminal, and `console.*` is banned outright (SS33). This is C02's ruling and it transfers whole: *C20 decides what is wrong, never when the user is told.* A callback would decide the moment, and the moment for a write failure is during shutdown — C22 §8 restores the screen before printing diagnostics, and that ordering is load-bearing. `warnings` accumulates instead, deduplicated by cause, which is what "logged once" means for a read-only home producing one failure per command (T3.7).

**The draft is stashed on the first `previous()`.** A user who types half a command, presses `↑` to check something, then presses `↓` back past the newest entry gets their half-command returned, cursor and all. Losing it is a small thing that feels large, and it is the reason `previous` takes the current buffer rather than being nullary.

`resetNavigation()` is called on submit and on any edit, so the next `↑` starts from the newest entry rather than wherever the last walk ended.

Duplicate consecutive commands are stored once. Running `/ps` five times leaves one entry, so `↑` reaches the previous *different* command rather than the same one five times.

---

## 5. Reverse search

`⌃r` opens an overlay through C15 (`j22`):

```
(reverse-i-search) `digit`: /ps --family=digit-classifier --status=running
```

Substring, case-insensitive, most-recent-first. Typing narrows; another `⌃r` steps to an older match; `Enter` executes; `Esc` returns to the buffer unchanged; `Tab` accepts the match into the buffer for editing.

The overlay content is `Block[]` like every layer (C15 I4), so it is themed and degrades. The bindings are C16's, dispatched to the `overlay` target.

Searching an empty query shows nothing rather than the whole history — a full listing is `/history`.

**C20 builds the layer; L4 pushes it and calls `update`.** `searchLayer` returns a `Layer` anchored to the prompt row with `prefer: "above"` — the prompt is near the bottom by definition and C15 flips when there is no room. Narrowing is `update(id, { content })` on each keystroke, never a pop and a re-push: C15 §2 spells out what re-pushing costs (focus churn inside the thing being typed into, and the layer losing its position under anything stacked above it), and C19's menu already narrows through this seam. This is also the shape that keeps C20 a data structure — it constructs `Block[]` and hands it over, exactly as C19's `menuLayer` does, and touches no manager.

---

## 6. `/history`

| Form | Effect |
|---|---|
| `/history` | Table of index, timestamp, command |
| `/history <N>` | Returns entry N for re-execution |
| `/history clear` | Wipes, **after a confirm** — a non-dismissable overlay (C15 §3) |
| `/history --search=<term>` | Filtered listing |

Rendered as blocks through the normal path, so it scrolls, is themed, and its rows carry `fill` actions. `listBlocks` builds them; L4 commits them, as it commits everything.

**The confirm is C20's layer, frozen non-dismissable.** C15 already guarantees the behaviour — `pop()` inspects only the top layer and returns `null` without removing a non-dismissable one, and C16's single `overlay:escape → dismiss` row respects that — so nothing in the stack can wipe history on a stray `Esc`. What is left to get wrong is the layer C20 hands over, which is why `clearConfirmLayer` exists rather than a `dismissable` argument, and why T3.15 drives the real manager and the real router action instead of reading the field back.

---

## 7. State machine

Two independent machines.

**Navigation**

| From ↓ / call → | `previous` | `next` | `append` / edit |
|---|---|---|---|
| **idle** | stash draft, → navigating (T1.6) | null (T3.4) | idle |
| **navigating** | older entry, or stays at oldest (T1.7) | newer, or draft then → idle (T1.8) | → idle (T1.9) |

**Search**

| From ↓ / event → | `⌃r` | keystroke | `Enter` | `Esc` | `Tab` |
|---|---|---|---|---|---|
| **inactive** | → active (T1.11) | — | — | — | — |
| **active** | older match (T1.12) | narrows (T1.13) | → inactive, execute (T1.14) | → inactive, buffer unchanged (T1.15) | → inactive, accept into buffer (T1.16) |

---

## 8. Invariants

- **I1** — C20 never writes to C17; it returns strings and L4 applies them.
- **I2** — The draft is stashed on the first `previous` and restored on `next` past the newest.
- **I3** — Any edit or submit resets navigation.
- **I4** — Consecutive duplicates are stored once.
- **I5** — Redaction never destroys a UUID, hex SHA, semver, path or flag name.
- **I6** — Redaction applies to persisted data only; the in-session entry keeps its value.
- **I7** — Newlines are escaped on write and restored on read.
- **I8** — A write failure is non-fatal; in-memory history continues and the cause is recorded once.
- **I9** — A corrupt file yields an empty history and a warning, never a refusal to start.
- **I10** — `entries` never exceeds 10,000; the two files are compacted together, and a load yields the newest 10,000.
- **I11** — C20 reads no ambient clock or filesystem; both are injected, as is the state directory.
- **I12** — Paths are resolved from an injected `stateDir`, never hardcoded. Standalone development never writes to a real install.
- **I13** — Reverse search is a C15 overlay with `Block[]` content.
- **I14** — `/history clear` requires a non-dismissable confirm.
- **I15** — C20 imports nothing from `terminal/` and never commits a frame.
- **I16** — Writes are serialised; `flush()` resolves when every append issued before it has settled or failed, and the sidecar stays index-aligned under concurrent appends.
- **I17** — Warnings are returned, never emitted. C20 decides what is wrong, never when the user is told.
- **I18** — `drain()` is synchronous and puts every pending append on disk. It is the only thing `beforeRelease` calls, and the only use of `appendFileSync`.
- **I19** — Redaction runs over C18's tokens where the command parses and a whitespace split where it does not, line by line, and always before escaping.
- **I20** — A whitespace-only command is not stored; a null byte is stripped before storage.

---

## 9. Commitments

1. History persists at `<stateDir>/history` with an index-aligned sidecar; `stateDir` is injected, never hardcoded (I12).
2. Newlines are escaped, so multi-line commands survive a round trip (I7).
3. Appends are immediate and write failures are non-fatal (I8).
4. The cap is 10,000, FIFO; `entries` never exceeds it and the two files compact together (I10).
5. Corruption yields an empty history and a warning, never a failed start (I9).
6. Redaction is positional first, entropy second, with identifiers exempt — `j22`'s entropy-only rule is corrected (I5).
7. Redaction applies to disk only; the session keeps its values (I6).
8. The draft is stashed on the first `↑` and restored on `↓` past the newest (I2).
9. Navigation resets on edit and submit (I3).
10. Consecutive duplicates are stored once (I4).
11. Reverse search is a C15 overlay, substring and case-insensitive, most-recent-first (I13).
12. `/history clear` requires a confirm that `Esc` cannot dismiss (I14).
13. C20 returns strings; L4 applies them to the editor (I1).
14. Clock and filesystem are injected (I11).
15. Writes are serialised, and `flush()` reports them settled (I16).
16. Warnings are returned to the caller, never printed (I17).
17. The exit path drains synchronously, so the command just submitted survives a signal (I18).
18. Redaction is tokenised, runs line by line, and precedes escaping (I19).
19. A whitespace-only command is not stored and null bytes are stripped (I20).

---

## 10. Tests

Six tiers. Every cell of both §7 tables is covered.

### Tier 1 — unit

- **T1.1**: `append` stores command, timestamp and exit code.
- **T1.2** (I4): the same command twice consecutively → one entry; interleaved with another → two.
- **T1.3** (I10): 10,001 appends → 10,000 entries, oldest dropped, sidecar the same length.
- **T1.4** (I7): a command containing `\n` round-trips through write and load unchanged.
- **T1.5** (I7): a command containing a literal backslash round-trips.
- **T1.6** (I2): `previous("half typed")` → newest entry; the draft is stashed.
- **T1.7**: repeated `previous` walks back and stops at the oldest.
- **T1.8** (I2): `next` past the newest → the stashed draft, then `navigating` false.
- **T1.9** (I3): `append` during navigation → navigation resets.
- **T1.10**: `resetNavigation` → the next `previous` starts from the newest.
- **T1.11**: `⌃r` → search active.
- **T1.12**: a second `⌃r` → the next older match.
- **T1.13**: typing narrows; no match → the query is retained and the result is empty.
- **T1.14**: `Enter` → returns the match and deactivates.
- **T1.15**: `Esc` → deactivates, buffer unchanged.
- **T1.16**: `Tab` → returns the match for editing without executing.

### Tier 2 — contract / interface

- **T2.1** (I5, the important one): a corpus of realistic commands — UUIDs, 7- and 40-character SHAs, semvers, absolute and relative paths, flag names — survives redaction intact.
- **T2.2** (I5): `--token=ghp_16C7e42F292c6912E7710c838347Ae178B4a`, `GITLAB_PASSWORD=hunter2`, `--api-key foo` → redacted in all three positions.
- **T2.3** (I6): a redacted-on-disk entry is still complete in `entries` for the current session.
- **T2.4** (I11, I12): a source scan finds no clock, no direct `fs`, and no `~/.prism` literal in `history/`.
- **T2.4b** (I12): two stores with different `stateDir`s do not observe each other's entries.
- **T2.5** (I1): a source scan finds no C17 import.
- **T2.6** (I15): the module graph shows no import from `terminal/` and no scheduler call.
- **T2.7** (I13): reverse-search content is `Block[]`; a compile-level test rejects React.
- **T2.8**: `entries` is immutable.
- **T2.9** (I17): no warning is emitted. Across the corrupt-file, read-only and disk-full fixtures, neither `stdout` nor `stderr` is written to; each cause appears once in `warnings`. The C02 T2.7 analogue, and the same argument.
- **T2.10** (I18): a source scan finds `appendFileSync` called from one place, and that place is `drain`.
- **T2.11** (I11): `HistoryFs` is structurally satisfied by C22 §2's `FileSystem` — a compile-level test, deferred until C22 exists.

### Tier 3 — edge cases

- **T3.1** (I9): a truncated history file → empty history, warning, session opens.
- **T3.2** (I9): a sidecar shorter than the command file → commands kept, metadata reset.
- **T3.3** (I9): a sidecar containing non-numeric fields → treated as corrupt; commands kept.
- **T3.4**: `next` without a prior `previous` → null.
- **T3.5**: `previous` on empty history → null, no draft stashed.
- **T3.6**: `previous` with an empty current buffer → an empty draft is stashed and restored.
- **T3.7** (I8): a read-only home directory → in-memory history works for the whole session; the warning appears once, not per command.
- **T3.8** (I8): the disk fills mid-session → same behaviour; a later successful write persists what is in memory.
- **T3.9**: a 1 MB pasted command → stored, escaped, and round-trips.
- **T3.10**: a command that is only whitespace → not stored.
- **T3.11**: search with an empty query → no results, not everything.
- **T3.12**: search matching nothing → the query is retained so the user can delete a character.
- **T3.13**: search for a substring appearing in 500 entries → most-recent-first, `⌃r` walks them all without repeating.
- **T3.14**: `/history <N>` out of range → an error, not a crash.
- **T3.15**: `/history clear` with `Esc` on the confirm → nothing is cleared (C15 I3).
- **T3.16**: two sessions appending concurrently → last writer wins; entries may be lost but neither file is corrupted. The `j22` limitation, documented and tested.
- **T3.17**: a command containing a null byte → stripped before storage.
- **T3.18**: unicode and CJK commands → round-trip byte-identical.
- **T3.19** (I16): a hundred appends issued without awaiting, against a filesystem whose writes settle out of order → the two files have the same length and each index names the command it was written with.
- **T3.20** (I18): an append followed by `drain()` with `flush()` never awaited → the entry is on disk.
- **T3.21** (I10): cap + 300 appends → the file is compacted, the newest 10,000 survive, both files agree, and the compaction happened once rather than 300 times.
- **T3.22** (I19): a three-line command with `GITLAB_PASSWORD=hunter2` on the last line → the value is redacted and the newlines are escaped, in that order.
- **T3.23** (I20): a whitespace-only command is not stored; a command containing a null byte is stored without it.

### Tier 4 — integration

- **T4.1** (with C16): `↑`/`↓` reach C20 only when the prompt has focus.
- **T4.2** (with C17, L4): navigation replaces the buffer as one undo unit, cursor at end; the draft returns with its cursor.
- **T4.3** (with C15): `⌃r` opens an overlay; keys route to it; `Esc` pops it.
- **T4.4** (with C15): `/history clear` raises a non-dismissable confirm.
- **T4.5** (with C18): a stored command re-parses to the same `ParseResult` it did originally.
- **T4.6** (with C13, L4): `/clear` empties the transcript and leaves history untouched (C13 T4.7 from this side).
- **T4.7** (with L4): `/history` renders as a block table whose rows carry `fill` actions.

### Tier 5 — e2e

- **T5.1**: 200 commands across two sessions → history persists, order preserved, cap respected.
- **T5.2**: typing half a command, `↑` three times, `↓` four times → the half-command returns intact.
- **T5.3**: `⌃r`, narrowing, `⌃r` again, `Enter` → the older match executes.
- **T5.4**: a session where a token is pasted → the on-disk file contains `[REDACTED]` and no fragment of the secret.
- **T5.5**: a multi-line command submitted, session restarted, recalled with `↑` → identical, newlines intact.
- **T5.6**: a session started with a deliberately corrupted history file → opens, warns once, works.
- **T5.7** (I18): a command submitted and the session ended through `beforeRelease` without awaiting anything → the command is on disk. The case the asynchronous signature quietly breaks.

### Tier 6 — fail-on-revert

- **T6.1** (I5): reverting to the entropy-only heuristic → T2.1 fails, and every UUID in history is destroyed.
- **T6.2** (I6): redacting in memory as well as on disk → T2.3 fails and `↑` stops working within a session.
- **T6.3** (I2): dropping the draft stash → T1.8 and T5.2 fail.
- **T6.4** (I3): not resetting navigation on edit → T1.9 fails, and `↑` resumes from a stale position.
- **T6.5** (I7): writing newlines unescaped → T1.4 and T5.5 fail, and a multi-line command corrupts the file.
- **T6.6** (I8): treating a write failure as fatal → T3.7 fails, and a read-only home ends the session.
- **T6.7** (I9): refusing to start on corruption → T5.6 fails.
- **T6.8** (I1): calling C17 directly → T2.5 fails.
- **T6.9** (I11): reading the ambient clock → T2.4 fails and timestamps become untestable.
- **T6.12** (I12): hardcoding `~/.prism` → T2.4 fails, and standalone development appends to the developer's real history.
- **T6.10** (I14): making the clear confirm dismissable → T3.15 fails, and a stray `Esc` wipes history.
- **T6.11** (I4): storing consecutive duplicates → T1.2 fails and `↑` walks the same command repeatedly.
- **T6.13** (I16): issuing appends in parallel rather than through the chain → T3.19 fails and the sidecar de-aligns, so every timestamp names the wrong command.
- **T6.14** (I18): removing `drain` from `beforeRelease` → T5.7 fails, and the command lost is the one just typed.
- **T6.15** (I17): emitting the warning instead of accumulating it → T2.9 fails, and a write on the alternate screen is discarded by the release that follows it.
- **T6.16** (I19): escaping before redacting → T3.22 fails, because the environment rule has no line left to anchor to.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| Applying a recalled command to the buffer | L4, via C17 |
| Which keys navigate or search | C16 |
| Overlay placement | C15 |
| Executing a recalled command | L4 |
| Cross-session locking | Phase 1B — last-writer-wins is documented and tested |
| Sharing history across machines | Out of scope |
