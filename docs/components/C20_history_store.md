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

A malformed file is treated as empty and a warning is logged (`j22`). The session opens normally.

**A partial final line is not malformed, and the distinction is worth the sentence.** Every entry is written with its terminator, so a last line without one is an interrupted append — one entry, mid-flight, at the moment of a crash. Discarding 9,999 good commands to punish it would be the corruption rule doing more damage than the corruption. So: an unterminated final line is dropped with a warning, and *malformed* means an invalid escape or a null byte in the file, which is a file no writer of ours produced. Refusing to start because history is unreadable would be a worse failure than losing it — and the sidecar going missing while the commands survive is common enough (a partial copy, an interrupted rotation) that the commands are kept and the metadata reset.

---

## 3. Redaction

`j22` R12 specifies a heuristic: length ≥ 20 and Shannon entropy ≥ 3.5 bits per character gets `[REDACTED]`.

**That heuristic is broken for this tool as specified.** A UUID is 36 characters of hex with roughly 4 bits per character; a Git SHA is 40. Both clear the bar comfortably, and both are the single most common argument in Prism's history. `/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12` would persist as `/ps [REDACTED]`, which makes the feature actively harmful — the entries people most want to recall are exactly the ones destroyed.

So redaction is **primarily positional, with entropy as a secondary net**:

```
   SECRET = token|password|passwd|secret|api[-_]?key|credential|auth

P1 a flag whose name matches SECRET at a boundary —
   /(^|[-_])SECRET([-_]|$)/i — so --gitlab-token and --auth_token
   match and --tokens does not (B1). Its value is the rest of
   --flag=value, or the next token when that token does not
   begin with "-" (B2). Unconditional on length (B6).      → redact the value
P2 an assignment NAME=value whose NAME matches SECRET,
   scanned over the token list *and* over each line's text,
   so it reaches inside sh -c "GITLAB_PASSWORD=…" and
   ?private_token=… (B3). The value ends at whitespace,
   &, a quote, or end of line.                             → redact the value
E  otherwise the entropy heuristic — length ≥ 20 and ≥ 3.5
   bits per character — with exemptions for a UUID, 7–64
   hex characters (B5), a semver, a flag name, and a path:
   rooted (/, ./, ../, ~/), or containing a / with no
   segment that trips the bar on its own (B4).             → redact if still over
```

**The path exemption is defined by segments, not by punctuation**, and the first wording was "no `+` or `=` in any segment", which `aGVsbG8vd29ybGRzZWNyZXQ5OTk5` walks straight through. A path is a composition of names and a secret is one long high-entropy run, so the test is the one already written: exempt a slash-bearing token when **every segment** falls under the length-and-entropy bar. `/var/folders/T/x9f2kd8s0shx7q1p/prism-run` is exempt because its longest segment is sixteen characters; a base64 blob is not, because one segment is the blob.

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
  searchOpen(current: string): void;
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
type SearchState  = Readonly<{ query: string; hit: SearchHit | null; failed: boolean }>;
```

**Construction is asynchronous and everything after it is not.** The filesystem is injected and its reads return promises, so the load has to be awaited somewhere; doing it in `openHistory` means every call above answers from memory, synchronously, which is what lets `previous()` return a string rather than a promise on a keystroke path where a promise would be a frame of latency for no reason.

**`failed` is the third state a narrowing keystroke can produce**, and §7a Trace 2 is why the interface has a field for it: without one, the overlay either shows a line that does not contain the query beside it, or throws away a walk the user made on purpose. `searchEnd("accept")` also writes the navigation cursor to the hit's index (§7a Trace 1, I21) — the one place the two machines touch.

**`searchOpen` takes the buffer for the same reason `previous` does.** Trace 1 assumed a draft was already stashed because navigation came first. Searching from idle and accepting has no draft, and then `↓` past the newest returns nothing — the pre-search text is gone, by exactly the route I2 exists to close. So the buffer is stashed at `searchOpen` if navigation has not already stashed one, and the two entry points into the draft are symmetric.

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

**"Two independent machines" is the sentence §7a is written against**, and it does not survive the walk intact. They share a buffer, a submit and an entry list, and every defect below lives where one machine's rule meets the other's.

---

## 7a. The sequence trace

Indexed by rule interaction, not by input: each row is a point where two rules could both apply. Rows governed by one rule restate that rule and find nothing. The history for every row is three entries, oldest first — `E0 /ps --status=running`, `E1 /logs digit-42`, `E2 /ps 7f3a2c14-…` — and the buffer starts as the half-typed `gi`.

### Trace 1 — `⌃r` while navigating, then `Tab`

```
previous("gi")       draft ← "gi", cursor ← 2, returns E2        L4: setText(E2)
searchOpen           search active, query "", hit null           nav untouched
type "logs"          hit ← {E1, 1}
searchEnd("accept")  returns E1                                  L4: setText(E1)
next()               ???
```

**Three behaviours are reachable at the last line and the spec chooses none.**

- If `accept` counts as an edit, I3 fires, the draft is dropped, and `next()` returns null. The user who typed half a command, searched, and accepted has lost it silently.
- If accept leaves the cursor where navigation left it (2), `next()` returns nothing newer and then the draft — but the buffer holds `E1`, so `↓` jumps relative to an entry that is not the one on screen.
- If accept moves the cursor to the hit's index (1), `next()` returns `E2`, then `"gi"`, then idle.

**Ruling: accept writes the navigation cursor and keeps the draft.** The accepted text came from history, so continuing to walk from where it came from is the only reading under which `↑`/`↓` describe the buffer. The draft survives because I2's argument does not weaken for a user who searched on the way: losing it is a small thing that feels large. **This is the finding that retires "two independent machines"** — one machine writes the other's state, exactly once, and here is where.

### Trace 2 — a keystroke that matches nothing, then a backspace

```
query "ps"           hit {E2, 2}
searchOlder          hit {E0, 0}          the user has walked to the oldest match
type "x"             query "psx", no match
backspace            query "ps"           and the hit is ???
```

Retaining `{E0, 0}` while the query is `psx` puts a line on screen that does not contain the query the line above it displays. Clearing it and recomputing on the backspace returns the hit to `E2` — the newest — silently undoing a walk the user made deliberately.

**Ruling: `SearchState` carries `failed: boolean`.** The hit is retained, the overlay says `(failed reverse-i-search)`, and the next matching query resumes from the retained index rather than from the newest. Readline's wording is right for the reason it is right there: the label is what makes the retained line honest. Neither existing option was correct and the interface had no field for the third — T1.13 says "the query is retained and the result is empty", which is the display half of a decision nobody had taken.

`failed` also covers `⌃r` past the oldest match, and covering both is deliberate: each means *the last search action found nothing new*, and a fourth field distinguishing them would be a distinction the overlay does not draw.

### Trace 3 — the reset that eats its own navigation

```
previous("gi")    →  L4 applies setText(E2) to C17
                     C17 reports a change
                     L4 calls resetNavigation()        ← I3, read literally
next()            →  null.  ↑ works exactly once and ↓ never does.
```

I3 says "any edit"; §4 says "on submit and on any edit". Neither excludes the edit that navigation itself causes, and C20 cannot tell the difference because it never sees the editor (I1).

**Ruling: the reset is on *user* edits, and L4 suppresses it for the `setText` it performs on C20's behalf.** It lands as an L4 obligation because the seam is L4's — the same place T4.2 already requires the replacement to be one undo unit. Written into I3 rather than left to the orchestrator's judgement: the failure is instant and total, and the fix after the fact is a seam rewrite about who owns the flag.

### Trace 4 — an append while a search holds an index

`SearchHit.index` names a position in `entries`. An append at the cap drops `E0` and shifts every index down by one, so a retained hit resolves to a different command — the C13/C14 deltas-read-as-state class, one component later.

It is **not constructible today**: within a session an append follows a submit, a submit requires the prompt to have focus, and while the search overlay is up it does not. Building machinery against it would be C16's unreachable rung again.

**Ruling: remove the class instead of defending against it.** `searchEnd` returns `hit.command` — the string captured when the hit was found — and never re-reads `entries[hit.index]`. `rerun(index)` stays index-addressed because its index comes from the user and is range-checked (T3.14). One line, and the row cannot come back when L4 grows a path that does append.

### Trace 5 — `clear()` under each machine

Also unreachable, for two reasons worth recording: `/history clear` is itself a submitted command, and the submit resets navigation before the confirm is raised; and the confirm is non-dismissable, so C16 skips global shortcuts beneath it (C16 §5) and `⌃r` cannot fire while it is open.

**Ruling: say so, and make `clear()` total anyway** — it resets navigation and cancels any search. The two are not in tension: C16's precedent is against *ordering behaviour around* an unconstructible state, not against leaving a cursor dangling into an emptied array for the cost of one line.

### Trace 6 — the exit row

```
append A     issued, in flight
append B     queued behind A
beforeRelease → drain()
```

Drain must write what the chain has not. Writing from the last **issued** index loses `A` — which is the command just typed, the entry ruling 9 exists for. Writing from the last **confirmed** index may write `A` twice if its in-flight call also lands.

**Ruling: drain writes from the last confirmed write, and a load collapses consecutive duplicates.** The overlap becomes invisible under a rule the component already has — I4 — and the choice is between an entry that appears twice for one load and the entry that matters disappearing. C22 §8 already warns that a double flush duplicates entries; this is the same hazard reached from the other side, and collapsing on load is what disarms both.

**I4 was an append-time rule and is now also a load-time one.** That is a widening the walk forced, not a restatement.

---

## 7b. The classification table

Redaction has no events. Its rules all hold at rest and interact structurally — two correct statements overlapping on one token — so a trace cannot reach them however many rows it has. This is C19's gap, and the shape that closes it is C18's table.

`P1` is the flag-value rule, `P2` the environment assignment, `E` the entropy net with its exemptions.

| Input | Rule that fires | What reaches disk |
|---|---|---|
| `--token=7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12` | P1 | `--token=[REDACTED]` — the UUID exemption belongs to E and does not rescue a flagged value |
| `/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12` | E, exempt | unchanged — the row the whole correction exists for |
| `/ps --tokens=3` | **P1, wrongly** | `--tokens=[REDACTED]` unless the name match is boundary-delimited |
| `/deploy --api-key --verbose` | **P1, wrongly** | `--api-key [REDACTED]` — the *next flag* eaten, and the command unreplayable |
| `--api-key foo` | P1 | `--api-key [REDACTED]` |
| `--password=` | P1, empty value | unchanged — no `[REDACTED]` for nothing |
| `sh -c "GITLAB_PASSWORD=hunter2 deploy"` | **none** | the secret, in full |
| `curl 'https://host/api?private_token=abc123'` | **none** | the secret, in full |
| `--path=/var/folders/T/x9f2kd8s0shx7q1p/prism-run` | E, exempt | unchanged |
| `aGVsbG8rd29ybGQvc2VjcmV0Kzk5OTk5OTk=` | **E, exempt, wrongly** | the blob, if the path exemption is "contains a slash" |
| `--sha=e3b0c442…7852b855` (64 hex) | **E, wrongly** | `[REDACTED]` — a SHA-256 destroyed by a 7–40 exemption |
| `ghp_16C7e42F292c6912E7710c838347Ae178B4a` positional | E | `[REDACTED]` — the net working as intended |
| a 40-character hex string that genuinely is a secret | E, exempt | **the secret — the accepted miss**, recorded rather than discovered later |
| `--token=$TOKEN` | P1 | `--token=[REDACTED]` — accepted; nothing of value is lost |
| `[REDACTED]` | none | unchanged — idempotent |
| `--password hunter2` | P1 | `--password [REDACTED]` — P is unconditional on length; E would not have fired |

### What it found

- **B1 — the flag name must match with boundaries.** `/token/` matches `--tokens`, and a redactor that eats a count is one people turn off. `(^|[-_])(token|password|passwd|secret|api[-_]?key|credential|auth)([-_]|$)` — which still catches `--gitlab-token` and `--auth_token`.
- **B2 — the next-token form needs a leading-dash guard.** Without it `--api-key --verbose` redacts the following flag and the entry no longer describes what was run. `--token` at end of line redacts nothing.
- **B3 — P2 must also run as a text scan over each line, not only over tokens.** A quoted delegation is one token whose text contains the assignment, and `sh -c "GITLAB_PASSWORD=… deploy"` is the commonest way a secret reaches the shell path. The same scan catches `?private_token=…` in a URL, which no positional rule sees either. The value ends at whitespace, `&`, a quote, or end of line.
- **B4 — the path exemption cannot be "contains a slash".** The base64 alphabet contains `/`, so the obvious form exempts most of what E exists to catch. A path starts with `/`, `./`, `../` or `~/`, or is a relative path whose segments carry no `+` or `=`.
- **B5 — the hex exemption's range destroys SHA-256.** 7–40 is Git's; a 64-character digest is as much an identifier as a commit is, and this tool prints them. 7–64.
- **B6 — P is unconditional on length and E is not.** `--password hunter2` is seven low-entropy characters and is still a password. Recorded because the natural implementation applies one length bar to everything.

**Four of these six destroy a legitimate command and two leak a secret**, and every one lives in a cell where two correct statements overlap: a flag rule meeting a name that contains a keyword, a next-token rule meeting a flag, a token rule meeting a quoted string, an exemption meeting an alphabet. None is visible to a reader checking the three rules one at a time, which is how all three read as correct in §3.

---

## 8. Invariants

- **I1** — C20 never writes to C17; it returns strings and L4 applies them.
- **I2** — The draft is stashed on the first `previous` and restored on `next` past the newest.
- **I3** — A *user* edit or a submit resets navigation. The `setText` L4 applies on C20's behalf does not, or `↑` works once and `↓` never does (§7a Trace 3).
- **I4** — Consecutive duplicates are stored once, at append **and** on load.
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
- **I21** — `searchEnd("accept")` sets the navigation cursor to the hit's index and preserves the stashed draft, which `searchOpen` stashes when navigation has not. The only place one machine writes the other's state.
- **I22** — A search action that finds nothing sets `failed` and retains both the query and the previous hit; the next matching query resumes from that hit, not from the newest.
- **I23** — `searchEnd` returns the command captured in the hit, never a re-read of `entries[index]`.
- **I24** — Redaction never destroys a flag name, a numeric value behind a name that merely contains a keyword, or a flag following a valueless secret flag.
- **I25** — The assignment rule reaches inside quoted token text and URL query values, not only bare tokens.
- **I26** — The path exemption does not exempt a base64 blob.
- **I27** — `drain()` writes from the last confirmed write, and the duplicate this may produce is collapsed on load by I4.

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
20. Accepting a search result moves the navigation cursor to it and keeps the draft (I21).
21. A search that finds nothing says so rather than lying or restarting (I22).
22. A search result is returned from the hit, never re-read by index (I23).
23. Redaction destroys no flag name, count or following flag (I24).
24. The assignment rule reaches inside quoted text and URL query values (I25).
25. The path exemption does not exempt base64 (I26).
26. The exit drain writes from the last confirmed write; I4 collapses the overlap on load (I27).

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
- **T1.17** (I21): a draft, `previous`, `⌃r`, narrow, accept → the cursor is at the hit; `next` walks newer from *there*, and past the newest returns the draft. §7a Trace 1.
- **T1.18** (I22): a keystroke that matches nothing → `failed`, the query and the previous hit retained; a backspace resumes from that hit rather than from the newest. §7a Trace 2.
- **T1.19** (I23): the hit's command is returned after `entries` has changed underneath it.
- **T1.20** (I4): a file containing consecutive duplicates → collapsed on load, not only on append.

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
- **T2.12** (I24, I25, I26): every row of §7b, asserting the rule that fired as well as the output. A row that produces the right string through the wrong rule is a redactor that will produce the wrong string for the next input, and asserting output alone cannot tell them apart.

### Tier 3 — edge cases

- **T3.1** (I9): a history file containing an invalid escape → empty history, warning, session opens.
- **T3.1b** (I9): a history file whose last line has no terminator → that entry is dropped, the rest survive, and a warning is recorded. The partial write, told apart from the corruption.
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
- **T3.24** (I27): `drain()` after an append whose asynchronous write also lands → the file holds the entry twice and a load yields it once. The overlap §7a Trace 6 accepts, shown harmless rather than assumed to be.
- **T3.25** (I21): `clear()` while navigating and while searching → both machines idle, no dangling cursor. Unreachable through the real path (§7a Trace 5) and total anyway.

### Tier 4 — integration

- **T4.1** (with C16): `↑`/`↓` reach C20 only when the prompt has focus.
- **T4.2** (with C17, L4): navigation replaces the buffer as one undo unit, cursor at end; the draft returns with its cursor.
- **T4.3** (with C15): `⌃r` opens an overlay; keys route to it; `Esc` pops it.
- **T4.4** (with C15): `/history clear` raises a non-dismissable confirm.
- **T4.5** (with C18): a stored command re-parses to the same `ParseResult` it did originally.
- **T4.6** (with C13, L4): `/clear` empties the transcript and leaves history untouched (C13 T4.7 from this side).
- **T4.7** (with L4): `/history` renders as a block table whose rows carry `fill` actions.
- **T4.8** (with C17, L4, I3): the `setText` L4 applies for a navigation step does not reset navigation, and a keystroke the user types does. §7a Trace 3, and the only tier that can see both halves.

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
- **T6.17** (I21): accepting a search result without moving the cursor → T1.17 fails, and `↓` walks relative to an entry that is not the one on screen.
- **T6.18** (I22): clearing the hit on a failed keystroke → T1.18 fails, and a walk to the oldest match is silently undone by one typo.
- **T6.19** (I24): dropping the boundary from the flag-name match → T2.12 fails on `--tokens=3`, and a count is redacted.
- **T6.20** (I25): scanning tokens only → T2.12 fails on `sh -c "GITLAB_PASSWORD=…"`, and the commonest delegated-shell secret persists in full.
- **T6.21** (I26): exempting anything containing a slash → T2.12 fails on the base64 row, and the entropy net stops catching what it exists for.
- **T6.22** (I3): resetting navigation on C20's own `setText` → T4.8 fails, `↑` works once and `↓` never does.
- **T6.23** (I27): draining from the last issued write rather than the last confirmed one → T5.7 fails, and the command lost is the one just typed.

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
