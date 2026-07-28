# C20 — History store

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L3 interaction |
| **Depends on** | C15 (reverse-search overlay) · C04 (`Block`, for overlay and listing content) · an injected filesystem and clock |
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

Appends are immediate — one line per submitted command, so a crash loses nothing. **A write failure is never fatal**: in-memory history continues, a warning is logged once, and the next successful write catches up (`j22`).

Cap is **10,000 entries**, FIFO. Both files rotate together; a mismatch in length between them is treated as corruption.

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

Redaction happens **before persistence, not before display**. The in-memory entry for the current session keeps its value so `↑` still works within the session; only what reaches disk is redacted.

---

## 4. Navigation

```typescript
interface HistoryStore {
  append(command: string, exitCode: number): void;
  previous(current: string): string | null;
  next(): string | null;
  resetNavigation(): void;
  search(query: string, from?: number): SearchHit | null;
  list(filter?: string): readonly HistoryEntry[];
  rerun(index: number): string | null;
  clear(): void;
  readonly entries: readonly HistoryEntry[];
  readonly navigating: boolean;
}

type HistoryEntry = Readonly<{ command: string; ts: number; exitCode: number }>;
type SearchHit = Readonly<{ command: string; index: number }>;
```

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

---

## 6. `/history`

| Form | Effect |
|---|---|
| `/history` | Table of index, timestamp, command |
| `/history <N>` | Returns entry N for re-execution |
| `/history clear` | Wipes, **after a confirm** — a non-dismissable overlay (C15 §3) |
| `/history --search=<term>` | Filtered listing |

Rendered as blocks through the normal path, so it scrolls, is themed, and its rows carry `fill` actions.

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
- **I8** — A write failure is non-fatal; in-memory history continues.
- **I9** — A corrupt file yields an empty history and a warning, never a refusal to start.
- **I10** — The cap is 10,000 entries, rotating both files together.
- **I11** — C20 reads no ambient clock or filesystem; both are injected, as is the state directory.
- **I12** — Paths are resolved from an injected `stateDir`, never hardcoded. Standalone development never writes to a real install.
- **I13** — Reverse search is a C15 overlay with `Block[]` content.
- **I14** — `/history clear` requires a non-dismissable confirm.
- **I15** — C20 imports nothing from `terminal/` and never commits a frame.

---

## 9. Commitments

1. History persists at `<stateDir>/history` with an index-aligned sidecar; `stateDir` is injected, never hardcoded.
2. Newlines are escaped, so multi-line commands survive a round trip.
3. Appends are immediate and write failures are non-fatal.
4. The cap is 10,000, FIFO, rotating both files together.
5. Corruption yields an empty history and a warning, never a failed start.
6. Redaction is positional first, entropy second, with identifiers exempt — `j22`'s entropy-only rule is corrected.
7. Redaction applies to disk only; the session keeps its values.
8. The draft is stashed on the first `↑` and restored on `↓` past the newest.
9. Navigation resets on edit and submit.
10. Consecutive duplicates are stored once.
11. Reverse search is a C15 overlay, substring and case-insensitive, most-recent-first.
12. `/history clear` requires a confirm that `Esc` cannot dismiss.
13. C20 returns strings; L4 applies them to the editor.
14. Clock and filesystem are injected.

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
