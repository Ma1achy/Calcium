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
- **`TuiConfig.keyActions` is keyed by the design registry's action id** (4a2019ed, M6), and
  an id outside the reserved set is a construction error (C24 I39).
- **Sixteen bindings are split by keyboard profile** (5ccc3676, M6). A chord only a Kitty-protocol
  terminal can send (`⌘1`…`⌘9`, `⌘↑`/`⌘↓`, `⌃⇧C`, `⌃⇧V`, `⌃⇧⇥`) is bound under
  `enhanced-terminal`; a plain terminal gets the base route (`⌥1`…`⌥9`, `⌃home`/`⌃end`, `⌥w`,
  `⌃y`, `⌥,`/`⌥.`). `docs/KEYS.md` lists both.
- **Kitty `⌃⇧C` is copy, never an interrupt** (601310a3, M6, C16 I67).
- **A line whose first character is `>` is never submitted** (c810c521, M6, C16 I68). It opens
  the action palette; `> notes` no longer reaches the shell as a redirect.
- **`PushedSurface` is `ChildSurface`, `PushedSurfaceHandle` is `ChildSurfaceHandle`, and the
  schema string `"calcium.pushed-surface/1"` is `"calcium.child-surface/1"`** (M9; record restored
  in 36761bc5). No aliases are exported.
- **`RefreshHost` has one kind, `{ kind: "entry"; id }`** (36761bc5, C24 I40). `b.live` is driven
  only in a transcript entry.
- **A manifest declaring `view` is refused** (f10e7a3f, C05 I27), naming its retirement — on a
  tool or a flag, `true` or `false`.
- **`watch`, `unwatch` and `config` are reserved verb names** (f10e7a3f, C05 I28); a manifest
  declaring one is refused. `config` is now the framework's ninth verb (70913a44).
- **A child surface is told the panel's interior** (de2fcd48, C24 I41): `SurfaceContext.width`
  and `height` exclude the entry's chrome and the panel border, where they were the whole region.
- **`profileDeck` is removed from the public API** (85c82136, ruling 78, C24 I33). It served the
  retired `/profile` view. Draw a section by calling `profileCard` for each id `CARDS` lists for it.
- **A `tui.view/1` document with a `warn` or `error` cell or notice and no glyph is refused at the
  wire** (9d7db83d, ruling 77, C04 I6), as `block()` always refused it.
- **`TerminalCapabilities.clipboard: "none" | "osc52"` is a required field** (54fae41a,
  ruling 72, C02 I18). A literal typed as `TerminalCapabilities` must supply it. It is read
  from the terminal's identification: kitty, Ghostty, WezTerm, foot and Windows Terminal answer
  `osc52`; iTerm2, tmux and an unidentified terminal answer `none`. A reader whose terminal
  takes OSC 52 anyway declares it with `TuiConfig.capabilities: { clipboard: "osc52" }`.
- **The transcript is drawn one column narrower** (b38aca61, rulings 67 and 68, C14 I57). The
  frame reserves column 0 of the transcript region on every row for the selection rail, `▌`
  (`|` in ASCII); overlays and the prompt keep the full width. What a block in the transcript
  is given to lay out at is `columns − 1`, and a command echo no longer lines up with the
  prompt's `❯`.
- **A table with an `expand` column reserves it at the widest disclosure marker it draws**
  (4e3c7153, ruling 82, C11 I32, C11 I15 amended). A collapsed row draws `▹+N` (`(+N` in
  ASCII), N being the columns dropped at this width plus the row's detail blocks; an expanded
  row draws `▿`. The columns after the marker move right by up to the count's width and flex
  columns give it up; no drop set moves. A declared `minWidth: 1` is no longer the column's
  width.
- **Control characters in block text are shown, not stripped** (a25f3b60, 1ef3b4d1, ruling 71,
  C09 I127–I128). C0, DEL and C1 draw in caret form (`^[[2J`, where the residue `[2J` was
  drawn before), and every bidi format character draws as `<U+XXXX>`, once, at the block
  registry's resolve. Copy carries the same form. *Cost, stated in the ruling:* right-to-left
  text shows its marks.
- **A `TerminalLine.text` carrying a bidi format character is refused by `validateDocument`**
  (1ef3b4d1, ruling 71, C04 I110), as C0 and C1 controls already were.
- **A tape's members are validated** (c714e137, C04 I144): each is a record with a non-empty
  string `id` unique among the members, a string `label`, and an optional string `detail` and
  `CallState` `state`; `current` is a string. A `current` naming no member stays valid.
- **A `progress` block's fields are validated** (5f89073b, C04 I146): `painted` a boolean;
  `quantity`, `granularity` and `liveness` each in their union; `style` a string.
- **A finished bar is gone, not full** (5f89073b, C04 I145). A `progress` whose `quantity` is
  `progress` or `count`, with `total > 0` and `current ≥ total`, measures and draws zero rows.
  A `capacity` bar and one with no declared quantity persist.
- **A bar's alphabet follows the work it counts** (5f89073b, C09 I136, registry 0.20). Counted
  (segmented) work with no style draws posts, `▮▯`, where it drew `slant`, `▰▱`; `braille` on
  segmented work draws posts; posts on continuous work draw blocks; other styles stand. `braille` fills in eighths, `⡀⡄⡆⡇⣇⣧⣷⣿`, so a
  bar short of full ends on `⣇` rather than `⣿`. Painted and ASCII bars stay whole-cell.
- **At 256 colours the quantiser holds the contrast floor** (c6240116, 8b7a6ffe, rulings 75 and
  79, C10 I69 and I17). An ink or ground whose nearest cube entry misses its floor takes the
  nearest entry that clears, and `muted` is kept on an index apart from `ok`, `warn`, `error`,
  `info` and `accent`. Some 8-bit indices change in every theme (193 cells were short); no
  24-bit value moves.
- **`loadTheme` and `applyOverrides` refuse a set that cannot hold at 8 bits** (8b7a6ffe,
  a022dd41, ruling 79, C10 I70): a quantised cell below its floor, or two of `ok`, `warn`,
  `error`, `info`, `accent` and `muted` with different 24-bit values painting one 8-bit index
  on a ground the gate measures. The shipped theme objects are not re-measured at load (their
  gate runs at build); a copy of one, a set of your own and every override are. Every shipped
  theme loads.

### Added

- **`/watch` and `/unwatch`, the footer's watch row and `watch.jump[n]`** (1004d067, ruling 50, C22 I135–I140,
  C16 I76–I77, registry 0.16). `ChromeContext.watches?: WatchRowState` and `OwnerHints.watchRow?:
  "present" | "focused"` carry the session's watches and the row's selection, so an application's own footer
  can draw the row; `WatchItem` and `WatchRowState` are exported.
- **`ColumnDef.vocabulary`** (7003e78f, C04 I6). A column's closed set of words, which may
  carry their tone without a glyph; a cell outside it is refused.
- **`Patch.cap` and `expanded`** on `Patch`, `keyValue`, `events`, `comparison` and `steps`
  (94331d36, C25 I14, C09 I124). A producer declares a patch's row budget; `⏎` expands in place.
  `BlockDefinition.fold?` and `BlockRegistry.fold` carry a kind's fold.
- **The framework's `/config` verb** (70913a44): every setting, its value, and where it came from.
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
- **Copy reaches the system clipboard, and never writes a file on its own** (d59839b5,
  9e2f1983; ruling 72 as the person amended it, ruling 83; C14 I61, C17 I31, C01 I25, C21
  I20). A copy goes to the kill buffer first, then to one clipboard in the person's order: OSC
  52 where the terminal takes it (up to 100 000 bytes of base64) — *sent to the terminal's
  clipboard*, counted as done since nothing comes back — otherwise a platform tool found on
  `PATH` at runtime (`pbcopy`; `wl-copy`, `xclip` or `xsel`; `clip.exe`), spawned with a fixed
  argv, no shell, and the text on stdin: *copying with pbcopy*, then *copied via pbcopy*.
  Where no route takes the text — no clipboard, a payload past OSC 52's limit with no tool, or
  a tool that exits non-zero or does not answer within two seconds — the toast says why and
  that the kill buffer holds it, and **nothing is written**. Copy mode's footer then offers
  the file, `⏎ to file` in place of `⏎ copy` with the reason as its last fact; pressing it
  writes `<stateDir>/copy.txt` and toasts `saved to` its full path. `y` never writes. A tool
  that fails after `⏎` has left the mode is stated and not offered (ruling 83). No tool is
  required, and none is a package dependency; `DEPENDENCIES.md` lists them under *Optional
  system tools*.
- **Copy mode: `⏎` copies and leaves, `⌃V` toggles a rectangle** (f2bf2500, C14 I59–I60).
  `y` copies and stays; a copy with nothing selected, or no text, toasts and does not leave.
  `⌃V` selects a rectangle of cells (`⇧←`/`⇧→` move its column, clamped to the block); `a`
  and `A` discard it. Arrow keys scroll to keep the caret on screen.
- **`CopyState`'s semantic arm gains `clears`, `all`, `rect` and `offersFile?`** (f2bf2500,
  d59839b5, C14 I55, I59–I61), read through `ChromeContext.copy`: whether a selection exists,
  whether every span is selected, the rectangle's size, and whether a copy will go to a file.
  An application building a `CopyState` itself must supply the three required fields.
- **`Image.path?: string`** (138fc42d, C04 I142–I143). `b.image({ path })` keeps the path it
  read the bytes from, as a record — nothing below the builder opens it. Validation refuses a
  `path` that is not a non-empty string. An image copies as its alt, a newline, and its path.
- **`Notice.trailSince?: number`** (ce7f0604, ruling 81, C04 I109, C09 I133, C22 I131). The
  tick a trail's one-shot began on. A `ripple` trail now plays once per arrival and holds its
  final frame, where it held its not-started frame for the life of the stream; the shell
  stamps `trailSince` from the injected clock, so a producer need not supply it. Refused on a
  notice whose `trail` names no one-shot.
- **A ramp's `overshoot: { lift, share }`** (cf973d23, C04 I148, C09 I133). On a gradient over a
  slot pair only: over the last `share` of the axis `to` is lifted up to `×lift`, and `from`
  mixes to it over the rest — the hot edge's profile. `lift` is in `(1, 2]` and `share` in
  `(0, 1)`; refused on a span. `RAMP_KEYS` has eight members. `hotEdge` trails now draw it.
- **A chosen option is bold as well as marked** (89dd5e35, ruling 54, C09 I132), at every
  depth; the weight is never measured.
- **A command of several lines is echoed as its lines** (9fad37e3, C22 I33). A bracketed paste
  or a chip resolving at submission no longer writes a bare line feed into the frame, which
  scrolled the alternate screen.
- **A child's OSC 8 hyperlink and OSC 52 clipboard write have no effect on its snapshot**
  (41aaab33, C27 I8): a link no longer reaches it as an underline run with the link gone.
- **A settled entry's blocks no longer stream** (2af7e95b, C13 I22): `settle` strips every
  block's `streaming` in the one change that settles, so a settled notice loses its mark and
  reserved cells.
- **A chip wider than its row is elided in the middle, frame kept** (dfef2062, C17 I32). It was
  clipped at the row's edge, which left a label with no closing bracket (F1391).
- **A borrowed line numbers its own chips** (dfef2062, C17 I33, I34). A typed reply or a form
  field counts its chips from `#1`, and the prompt's numbering comes back when the borrow ends; a
  chip yanked across owners takes the line's next number.
- **`BlockDefinition.focusShape`: `"box" | "control" | "row" | "frame"`** (0af676a8, C09 I137). A kind
  that publishes `elements` declares what focus paints; an undeclared app kind reads as none and is
  not refused. `RenderContext.focusShapeOf(block)` and an optional `focus` argument on
  `renderChild` are supplied by the registry.
- **Focus now shows where it was invisible** (0af676a8, C09 I137): a focused shed row in `keyValue`,
  `events`, `comparison` or `steps`; a focused `form` field or button at 1-bit, which inverts; and a
  `mosaic` or `split` pane holding a plot, which lights the plot's frame instead of painting a ground
  across it.
