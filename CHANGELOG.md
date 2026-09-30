# Changelog

Changes to `@fmx/calcium` that a consumer can see. **Kept by hand under `## Unreleased`
until a generator exists** (A04 §9), and every breaking change is named as one.

This is 0.x: a minor version may break the API with no deprecation cycle (README, *This is
0.x, deliberately*). Pin an exact version and read this file before moving it.

Each entry names the commit or lane that made the change, so the reasoning is one
`git show` away. New entries are appended to the section they belong in; when a version is
tagged, `## Unreleased` becomes its heading and a fresh one opens above it.

## Unreleased

### Breaking

- **`Glyph`: `live` is removed** (81aa90eb). A live panel's title takes a spinner frame
  instead of a mark, and `quote`'s ASCII rail, which `live` held, is now `|`.
- **`Glyph`: `step` is removed** (263a10cc). A call head carries `Notice.state` and the
  renderer resolves its mark from the state and the terminal (C09 I45): `●` or `○` where
  tone carries, and the state's own mark at 1 bit and in ASCII. The head's `glyph` is
  `work-unit`, or `queued` for a queued call.
- **`Glyph`: `running` is renamed `work-unit`** (51ed697f). `work-unit` is the design
  registry's id for `●` / `*`. `CallState`'s `running` is unchanged. A document naming
  `glyph: "running"` is now refused by `validateDocument` (C04 I6), and a builder or adapter
  writing it no longer type-checks.
- **`ChromeContext.copyMode` is removed** (965169c0). Use `ChromeContext.owner` (an
  `OwnerRung | null`) and `ChromeContext.copy` (a `CopyState`) to tell which copy mode is
  up. `ChromeContext` reaches a consumer through `ChromeFn` and `LabelFn`.
- **`⌃c` is refused at a question and in either copy mode** (M5). It no longer answers the
  question with its default or leaves the mode. `esc` is the way out.
- **`Verdict` is `handle | reject | pass`** (M5). Intercepts use `InterceptVerdict`
  (`handle | reject | global-intercept`), and a handler cannot return `global-intercept`.
- **`RouterDeps.refused({ rung, cause })` is required** (M5), and the router's exit
  dependencies are removed.
- **A key release reaches an attached child only** (M5).
- **`clearConfirmLayer` and `history-clear-confirm` are removed** (M5).

### Added

- **`Glyph`: `focus`** (73c01458). The focus gutter's mark, `▸` / `>`, as a slot of its
  own. It was drawn with `expand`'s, which is now the hollow `▹` / `(`.
- **`Glyph`: `question` and `current`** (70f4acc8). A question's mark, `⟩` / `?`, and the
  current item in a row you navigate, `›` / `*` (C09 I88).
- **`GlyphSet.choiceOpen`** (02aa16f4). An unchosen choice's mark, `○` / `@`; it was the
  plot's `hollow`, `○` / `o`. `GlyphSet` is not on a package entry point. It is listed
  because a choice row's ASCII rendering changes.
- **`ChromeContext.hints?: OwnerHints`** (M5). The owner line's chords come from the
  session keymap (`chord(target, action)`). It also carries the substate's name, the open
  question's state and default, and copy mode's one-shot refusal.
- **`Layer.owner?: LayerOwner`** (M5). `{ rung: "question" }` or
  `{ rung: "substate", name: "find" | "complete" | "preview" }`. A declared owner that the
  layer's own fields contradict is refused at push.
- **Keymap: `prompt ⏎ → submit` and `interaction ⏎ → keepField`** (M5). `ownerLine` takes
  a seventh argument, `hints`, which defaults to the default keymap.
