# Migrating to `calcium-tui`

For a consumer moving from a build before the design reconciliation to this one. Every
change named here is a line under `## Unreleased` → `### Breaking` in
[`CHANGELOG.md`](CHANGELOG.md), which carries the commit and the ruling for each; this file
says what to *do*, in the order a consumer meets it.

This is 0.x: pin an exact version, and read the changelog before moving it.

## 1. Change your dependency and imports to `calcium-tui`

The package had a scoped name and is now `calcium-tui`. It is **not on a registry yet**
(A04 §9), so the dependency is a built clone:

```sh
git clone https://github.com/Ma1achy/Calcium.git calcium
cd calcium && npm install && npm run build
```

```jsonc
// package.json — remove the old scoped entry, add:
{ "dependencies": { "calcium-tui": "file:../calcium" } }
```

If you added a scope line to `.npmrc` for the old name, remove it; nothing reads it now.

Then rewrite the imports. The package has five entry points and each keeps its subpath:

| before | after |
|---|---|
| `@<scope>/calcium` | `calcium-tui` |
| `@<scope>/calcium/testing` | `calcium-tui/testing` |
| `@<scope>/calcium/fixtures` | `calcium-tui/fixtures` |
| `@<scope>/calcium/profiling` | `calcium-tui/profiling` |
| `@<scope>/calcium/mermaid` | `calcium-tui/mermaid` |

From the root of a git checkout, this rewrites exactly those five specifiers, in either quote
style, in `import`, `export … from` and `import()`:

```sh
perl -pi -e 's{(["\x27])\@[\w.-]+/calcium(/(?:testing|fixtures|profiling|mermaid))?\1}{$1calcium-tui$2$1}g' \
  $(git ls-files '*.ts' '*.tsx' '*.mts' '*.cts' '*.js' '*.mjs' '*.cjs')
```

It matches any scope, so read the diff before committing if you depend on an unrelated
package also called `@something/calcium`. A lookalike such as `@scope/calcium-extra` or an
unknown subpath is left alone. Then `npm install` and a type-check: anything the rewrite
missed fails to resolve rather than failing later.

## 2. Changes the compiler finds

After the rename, `tsc` reports each of these. The fix is the one named.

| change | what to do |
|---|---|
| `Glyph` `live` removed | Drop it. A live panel's title takes a spinner frame; `quote`'s ASCII rail is `\|`. |
| `Glyph` `step` removed | A call head sets `Notice.state` and `glyph: "work-unit"` (or `"queued"`); the renderer picks the mark. |
| `Glyph` `running` → `work-unit` | Rename. `CallState`'s `running` is unchanged. |
| `ChromeContext.copyMode` removed | Read `ChromeContext.owner` and `ChromeContext.copy`. |
| `Verdict` is `handle \| reject \| pass` | An intercept returns `InterceptVerdict`; only an intercept may return `global-intercept`. |
| `RouterDeps.refused` required | Supply `refused({ rung, cause })`; remove the router's exit dependencies. |
| `clearConfirmLayer` removed | Delete the call; the `history-clear-confirm` action is gone with it. |
| `PushedSurface` → `ChildSurface` | Rename, with `PushedSurfaceHandle` → `ChildSurfaceHandle`. No aliases. |
| `RefreshHost` has one kind | Use `{ kind: "entry", id }`. |
| `profileDeck` removed | Call `profileCard` for each id `CARDS` lists for the section. |
| `TerminalCapabilities.clipboard` required | Supply `"none"` or `"osc52"` in a literal. |
| `TerminalCapabilities.editor` required | Supply a `string` or `null` in a literal. |
| `AskAnswer.outcome` required | A fake `ctx.ask` answers `{ key, outcome: "answered" }`. |
| `CallState` gains `waiting` | Add the arm to an exhaustive `switch`. |
| `paneLeft`/`paneRight` → `elementLeft`/`elementRight` | Rename the `KeyAction`s. |

## 3. Changes refused when they run

These type-check and are refused by validation, construction or load, with a message naming
the rule. Run your tests and your adapters' fixtures once and they surface.

| refused | what to do |
|---|---|
| A document naming `glyph: "running"` | Write `work-unit` (§2). |
| `TuiConfig.keyActions` keyed by an old id | Key it by the design registry's action id; `docs/KEYS.md` lists them. |
| A manifest declaring `view` | Remove it, on a tool or a flag. |
| A manifest declaring `watch`, `unwatch` or `config` | Rename the verb; the three are reserved. |
| A `tui.view/1` `warn` or `error` cell or notice with no glyph | Give it a glyph, as `block()` already required. |
| A `TerminalLine.text` with a bidi format character | Remove the character at the adapter. |
| A tape with a malformed member | Each member needs a unique non-empty `id` and a `label`. |
| A `progress` with a field outside its union | Use the declared values for `quantity`, `granularity`, `liveness`. |
| A theme or override that cannot hold at 8 bits | Adjust the colours until `loadTheme` accepts the set. |

## 4. Changes in behaviour only

Nothing reports these. Read each against what your application relies on.

**Safety.**
- **An approval's default answer is `deny`.** `esc` on an approval refuses the tool, where it
  used to run it; the tool runs only on an `answered` outcome that is not `deny`.
- **`⌃c` is refused at a question and in either copy mode.** `esc` is the way out.

**Keys.**
- **Sixteen bindings are split by keyboard profile.** A Kitty-protocol terminal gets the
  registry's chords; a plain one gets the base route (`⌥1`…`⌥9`, `⌃home`/`⌃end`, `⌥w`,
  `⌃y`, `⌥,`/`⌥.`). `docs/KEYS.md` lists both.
- **Kitty `⌃⇧C` is copy**, never an interrupt.
- **`⌥⇧↑`/`⌥⇧↓` no longer page the transcript**; `⌥↑`/`⌥↓` do.
- **A line starting with `>` is never submitted**; it opens the action palette.
- **A key release reaches an attached child only.**

**Layout and drawing.**
- **The transcript is one column narrower.** Column 0 is the selection rail, so a block in the
  transcript lays out at `columns − 1`.
- **A child surface is told the panel's interior**, not the whole region.
- **A table's `expand` column is as wide as its widest disclosure marker** (`▹+N`).
- **Control characters in block text are shown, not stripped**, in caret form, and bidi
  format characters as `<U+XXXX>`. Copy carries the same form.
- **The prompt, the command echo and linear mode show a bidi character as `<U+XXXX>`**, and
  linear shows C0 and C1 in caret form rather than deleting them. What was typed is unchanged.
- **A finished `progress` or `count` bar draws zero rows.** A `capacity` bar persists.
- **A bar's alphabet follows the work it counts**: segmented work with no style draws posts.
- **At 256 colours some indices move** to hold the contrast floor. No 24-bit value changes.
