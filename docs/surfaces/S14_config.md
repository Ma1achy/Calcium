# S14 — `/config`

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Live |
| **Package** | `prism-tui` |
| **Covers** | `/config` · `/config get` · `/config set` · `/config use-context` · `/config get-contexts` · `/config reset` |
| **Data source** | `prism config get --json`, `get-contexts --json` → `adaptConfig` (C07) |
| **Source** | `j23` · scratchpad 2 §7 · A01 D8 |
| **Status** | Draft |

---

## 1. Purpose

Four verbs to read and change a settings file is a CLI compromise. `/config` collapses them into one screen — every key, its value, its source, and a row action that puts the change in your prompt ready to edit.

**It is a live block whose rows fill the prompt, not an editable view.** Blocks carry no cursor, no input focus and no validation state; an editable one is a second line editor inside the render tree, and then two components own a cursor, two own undo, and two own what `Esc` means. The `fill` action reaches the same outcome with no new machinery: the row composes the command, C17 edits it, C23 runs it, C20 records it.

The flat verbs remain for scripting. This surface is the interactive path, not a replacement.

---

## 2. The screen

```
▌ ── config · ~/.calcium/config.toml ───────────────────────────────────────────
▌
▌     key                    value                        source
▌ ▸   current_context        fmx-prod                     config
▌ ▸   ui.theme               dark                         config
▌ ▸   ui.show_banner         true                         default
▌ ▸   terminal.colour_depth  24                           env
▌ ▸   terminal.mouse         true                         default
▌ ▸   history.cap            10000                        default
▌
▌ ── contexts · 2 ──────────────────────────────────────────────────────────────
▌
▌   ● fmx-prod      https://prism.fmx.io/v1        token valid · 30d
▌     fmx-staging   https://staging.prism.fmx.io   token expired
▌
▌   ⏎ edit   ␣ expand   ↕ switch context   ⊘ reset
```

**The `source` column is why this surface beats four verbs.** A value read from an environment variable that overrides your config file is the single most confusing thing about a settings system, and `/config get terminal.colour_depth` alone would just print `24`.

| Source | Meaning |
|---|---|
| `config` | Set in the file |
| `env` | Overridden by an environment variable this session |
| `default` | Not set anywhere; the framework's default |

An `env` row is `warn`-toned — not because it is wrong, but because it will not persist and people forget that.

---

## 3. Editing

`⏎` on a row fills the prompt:

```
❯ /config set ui.theme dark
```

Cursor at the end, current value present, ready to be replaced. **The current value is included rather than left blank** — most edits are a small change to what is there, and retyping a key path to change one word is the friction this surface exists to remove.

Expanding a row shows what the key accepts:

```
▌ ▾   ui.theme               dark                         config
▌       accepts    dark · light
▌       default    dark
▌       affects    every rendered element, immediately
```

Constraints come from the manifest's flag definitions where the key maps to one (C05), and are otherwise omitted rather than guessed.

### A fourth source: rejected

A value can be present in the file and **not in force**. C02 rejects out-of-range capability overrides (C02 T3.5); C10 rejects a theme override that fails the contrast floor (C10 §4). In both cases the default is used and the file still says otherwise.

| Source | Meaning | Tone |
|---|---|---|
| `config` | Set in the file and in force | default |
| `env` | An environment variable is overriding the file | warn |
| `default` | Not set anywhere | muted |
| `invalid` | **Set in the file, rejected, default in force** | error |

Without the fourth row this surface cannot distinguish "I never set that" from "I set that and it was thrown away" — and the second is exactly when someone stares at a file that plainly says `colour_depth = 12` and concludes the tool ignores its own config.

The expanded row carries the rejected value and the reason:

```
▌ ▾   terminal.colour_depth  24                           invalid
▌       in file    12
▌       rejected   not one of 1, 4, 8, 24
▌       in force   24  (default)
```

---

## 4. Contexts

The second section lists contexts with their endpoint and token state. `↕ switch` fills `/config use-context <name>`.

Token state is shown because switching to a context whose token expired three weeks ago produces a confusing failure two commands later. Stating it here costs one column.

The active context carries `●`; the others are plain. A context whose endpoint is unreachable is not probed — this surface reads config, and probing every context on every render would make opening it slow for no gain.

---

## 5. Reset

`⊘ reset` fills `/config reset`, which is the one genuinely destructive command in the set — it clears stored credentials as well as config (`j23`, delta D10).

**The fill includes no `--yes`.** The confirmation is the far side's, and pre-filling a flag that skips it would defeat the confirmation. This is the same reasoning as S05's `↕ scale` filling an incomplete `--replicas=`: where a command needs a deliberate act, the fill stops short of supplying it.

The expanded reset row states what is cleared:

```
▌       clears     config file · stored credentials · context list
▌       keeps      command history (use --keep-history to also clear)
```

---

## 6. States

| State | Render |
|---|---|
| **Loading** | C23's pending entry |
| **Populated** | §2 |
| **No config file** | Cannot occur — C22's gate 2 dispatches to `config init` before a session opens (C22 §4) |
| **All defaults** | Every row `default`; a muted line reads `nothing set; all values are framework defaults` |
| **Env overrides present** | Those rows `warn`-toned, and the rule header adds `· 1 env override` |
| **Single context** | The contexts section renders with one row; `↕ switch` is not offered |
| **Corrupt file** | Cannot occur here — C22's gate 2 catches it at startup |
| **Narrow** | §7 |

**Two states that cannot occur are listed anyway**, because their absence is a consequence of C22's gates rather than something this surface handles, and a reader who does not know that will look for the handling.

---

## 7. Narrow widths

**Nothing drops.** The table is four columns summing to 51 cells with gaps — expand 1, key 20, value 16, source 8 — and the shell's minimum is 60 × 16 (D30). Below that S01's fallback replaces the frame entirely, so there is no width at which this surface renders with a column missing.

Priorities are still declared, because C11 requires them and a future column would need somewhere to sit in the order. They are simply never exercised, and saying so is better than inventing a drop sequence for widths that do not occur.

| Column | Priority | Min | Align | Trunc |
|---|---|---|---|---|
| expand | 100 | 1 | left | end |
| key | 95 | 20 | left | **start** |
| value | 90 | 16 | left | end |
| source | 70 | 8 | left | end |

Every column is left-aligned: nothing here is a number, and `24` in `terminal.colour_depth` is a value in a column of values rather than a numeric column. `align` is stated because `ColumnDef` requires it (C04 §3) and a table that leaves it unstated is a table whose figure decides it.

The contexts region below the second rule is a table too, and it declared no columns at all — the same gap S15 §5 had. It is headerless (`showHeader: false`), which is the shape C04 §3 names for a small list with row actions:

| Column | Priority | Min | Align | Flex |
|---|---|---|---|---|
| glyph | 100 | 1 | left | — |
| name | 95 | 13 | left | — |
| url | 80 | 29 | left | yes |
| token | 60 | 18 | left | — |

Key paths truncate from the **left**, keeping the leaf. Keys are sorted, so adjacent rows share their namespace; truncating the leaf would render `ui.theme` and `ui.show_banner` identically. Values truncate from the right.

**Declared as `truncateFrom: "start"`** — the field names the end characters are removed from, so `start` is the one that keeps the leaf (C04 I30). It did not exist when this paragraph was first written: the intent was stated in prose, `ColumnDef` could not carry it, and C11 truncated from the right unconditionally, so a narrow `key` column showed `ui.show_ba…` where this surface wants `…show_banner`. Found while declaring `align`, which is the same class of leak.

## 8. Interactions

| Action | Command | Kind |
|---|---|---|
| `⏎ edit` | `/config set <key> <current>` | fill |
| `↕ switch` | `/config use-context <name>` | fill |
| `⊘ reset` | `/config reset` | fill, **without `--yes`** |
| `{ } json` | `/config get --json` | fill |

Every action is a fill. Nothing on this surface changes anything directly — a theme toggled by a keypress and a theme set by a command would be two paths to one state, and the second one is already `/theme`.

---

## 9. Commitments

1. A live block whose rows fill the prompt — not an editable view, and the reason is recorded.
2. The `source` column distinguishes config, env, default and **invalid**; it is the reason this beats four verbs.
3. `env` rows are `warn`-toned, because an override that will not persist is easy to forget; `invalid` rows are `error`-toned and show the rejected value and reason.
4. `⏎` fills the key **and its current value**, so an edit is a change rather than a retype.
5. Expanded rows show accepted values from the manifest, or omit them rather than guessing.
6. Contexts show token state, so switching to an expired one fails here rather than two commands later.
7. Contexts are not probed for reachability; this surface reads config.
8. `⊘ reset` fills without `--yes`; the confirmation is the far side's and is not pre-answered.
9. The expanded reset row states what is cleared and what is kept.
10. Nothing drops at any width the shell renders at; the table fits in 51 cells and the minimum is 60.
11. Key paths truncate from the **left**, keeping the leaf — adjacent rows share a namespace, so truncating the leaf makes them identical.
12. Every action is a fill; nothing here mutates directly.

---

## 10. Tests

### Tier 1 — unit

- **T1.1**: the surface adapts to rule, table, rule, table, tip.
- **T1.2**: each source value renders its documented label and tone — three cases.
- **T1.3**: an env-overridden row is `warn`-toned and counted in the rule header.
- **T1.4**: `⏎` fills `/config set <key> <current value>` with the cursor at end.
- **T1.5**: an expanded row with a manifest-backed key shows accepted values; one without omits the row.
- **T1.6**: contexts render token state; the active one carries `●`.
- **T1.7b**: each of the four `source` values renders its documented tone.
- **T1.7c**: an `invalid` row's expansion shows the file value, the rejection reason, and what is in force.
- **T1.7**: a single context → `↕ switch` not offered.
- **T1.8**: `⊘ reset` fills without `--yes`.
- **T1.9**: the expanded reset row names what is cleared and what is kept.
- **T1.10**: all-defaults → the muted `nothing set` line.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths.
- **T2.3**: every action re-parses through C18 to the intended `ParseResult`.
- **T2.4**: no action carries `--yes`, `--force` or any confirmation-skipping flag — scanned across every emitted command.
- **T2.5**: no action mutates directly; every one is a `fill`.

### Tier 3 — edge cases

- **T3.1**: zero contexts → the section is omitted, not rendered empty. Cannot normally occur, but an envelope may say so.
- **T3.2**: a value of 200 characters → truncated in the cell, whole in the expand panel.
- **T3.3**: a key path of 60 characters → truncated from the **left**, leaf intact; two keys sharing a namespace remain distinguishable.
- **T3.4**: a value containing a space → the fill quotes it, and re-tokenising yields one token (C19 T3.4's quoter).
- **T3.5**: a value that is an empty string → fills as `""`, not as a bare key.
- **T3.6**: a boolean value → fills as `true`/`false`, not `1`/`0`.
- **T3.7**: at 59 columns → `source` drops and appears in every expand panel.
- **T3.8**: an env override of a key that is also in the file → one row, source `env`, and the file value shown in the expand panel.
- **T3.9**: a context with no token → `no token` rather than blank.
- **T3.10**: 40 keys → all render; the block scrolls.
- **T3.11**: a key present in the envelope but unknown to the manifest → renders with no constraints, not as an error.

- **T3.13**: a config value rejected by C02's range check → `invalid`, not `default`.
- **T3.14**: a theme override rejected by C10's contrast floor → `invalid`, with the failing tone named.

- **T3.15**: at 60 columns — the narrowest the shell renders — every column is present.

### Tier 4 — integration

- **T4.1** (with C11): `source` drops only below 60 and reaches the expand panel (C11 I2).
- **T4.2** (with C23): every fill lands as one undo unit with the cursor at end.
- **T4.3** (with C17, C19): a value containing a space survives fill → edit → submit → parse.
- **T4.4** (with C10): `/config set ui.theme light` submitted from here switches the theme through the normal path, with no local shortcut.
- **T4.5** (with C05): accepted values come from the manifest, not from a table here.
- **T4.6** (with C22): the file path in the rule header is the resolved `stateDir`, not a hardcoded default of any name.

### Tier 5 — e2e

- **T5.1**: golden frames at 60 / 80 / 100 / 160.
- **T5.2**: golden frames for the six reachable §6 states.
- **T5.3**: `⏎` on `ui.theme`, edit `dark` to `light`, submit → the theme changes and the config file is written.
- **T5.4**: an env-overridden key edited and submitted → the file changes, the env still wins, and the row still reads `env`.
- **T5.5**: `⊘ reset` → the far side's confirmation is reached, not skipped.

- **T4.7** (with C02, C10): the `source` shown matches which value each component actually used, not what the file says.

### Tier 6 — fail-on-revert

- **T6.1** (C1): making rows editable in place → a second cursor and a second undo stack appear, and the reason this is a live block is lost.
- **T6.2** (C2): dropping the `source` column → T1.2 fails, and an env override becomes invisible.
- **T6.3** (C4): filling without the current value → T1.4 fails, and every edit becomes a retype.
- **T6.4** (C5): guessing accepted values → T1.5 fails on a key the manifest does not describe.
- **T6.5** (C8): pre-filling `--yes` on reset → T2.4 fails, and a destructive command loses its confirmation.
- **T6.6** (C6): omitting token state from contexts → T1.6 fails, and switching to an expired context fails two commands later.
- **T6.7** (C10): dropping `source` without the expand fallback → T3.7 fails.
- **T6.8** (C12): adding a direct toggle → T2.5 fails, and one state gains two write paths.

---

- **T6.9** (C2): collapsing `invalid` into `default` → T3.13 fails, and a rejected edit is indistinguishable from no edit.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| First-run setup | C22 §4 gate 2 |
| Identity and tokens | S15 |
| The theme itself | C10, `/theme` |
| Config file format and precedence | The far side |
| Editing in place | Deliberately absent — §1 |
