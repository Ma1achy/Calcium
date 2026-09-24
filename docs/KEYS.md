# Key ladder

**Generated** by `npx tsx tools/keymap-table.mjs` from `defaultKeymap` (`src/interaction/router/keymap.ts`) in `FOCUS_ORDER` (`src/interaction/router/focus.ts`). Do not edit by hand: `test/unit/keymap-table.test.ts` fails when this file and the live keymap disagree.

Columns left to right are the ladder's priority (C16 §3, A02 §2): the active target is the first whose condition holds, and `global` is consulted after it. A key bound at two or more targets is marked † — which action fires depends on which target is active, never on the row's position in the source. `interaction` holds no built-in binding: a block's own keys land there at runtime when they collide with `global` or `liveBlock` (C16 I27), and are outside this table.


**The `profile` column** (C16 §6a, I35). `both` is the ordinary case. `enhanced-terminal` is a route that resolves only where `capabilities.keyboardProtocol === "kitty"`; every action with one also has a `both` route, because ⌘, ⇧⏎, ⌃⇧-letters and ⌃⇥ are byte-identical to their unmodified forms on a terminal without the protocol (I36).

**Every `⌥` route needs the terminal to send Option as Meta** — ESC-prefixing rather than composing a character, which on macOS means *Use Option as Meta Key* in Terminal.app and `Esc+` in iTerm2. Not a new assumption: every `⌥` row in this table has always required it — they were spelled `m+` until the key column moved to the design's notation (C16 §6a clause 6).

| key | profile | child | overlay | nativeSelection | semanticSelection | panel | interaction | prompt | liveBlock | global |
|---|---|---|---|---|---|---|---|---|---|---|
| `+` | both |  |  |  |  |  | dollyIn |  |  |  |
| `⌥,` | both |  |  |  |  |  |  |  |  | agentPrevious |
| `-` | both |  |  |  |  |  | dollyOut |  |  |  |
| `⌥.` | both |  |  |  |  |  |  |  |  | agentNext |
| `⌥1` | both |  |  |  |  |  |  |  |  | agent1 |
| `⌘1` | enhanced-terminal |  |  |  |  |  |  |  |  | agent1 |
| `⌥2` | both |  |  |  |  |  |  |  |  | agent2 |
| `⌘2` | enhanced-terminal |  |  |  |  |  |  |  |  | agent2 |
| `⌥3` | both |  |  |  |  |  |  |  |  | agent3 |
| `⌘3` | enhanced-terminal |  |  |  |  |  |  |  |  | agent3 |
| `⌥4` | both |  |  |  |  |  |  |  |  | agent4 |
| `⌘4` | enhanced-terminal |  |  |  |  |  |  |  |  | agent4 |
| `⌥5` | both |  |  |  |  |  |  |  |  | agent5 |
| `⌘5` | enhanced-terminal |  |  |  |  |  |  |  |  | agent5 |
| `⌥6` | both |  |  |  |  |  |  |  |  | agent6 |
| `⌘6` | enhanced-terminal |  |  |  |  |  |  |  |  | agent6 |
| `⌥7` | both |  |  |  |  |  |  |  |  | agent7 |
| `⌘7` | enhanced-terminal |  |  |  |  |  |  |  |  | agent7 |
| `⌥8` | both |  |  |  |  |  |  |  |  | agent8 |
| `⌘8` | enhanced-terminal |  |  |  |  |  |  |  |  | agent8 |
| `⌥9` | both |  |  |  |  |  |  |  |  | agent9 |
| `⌘9` | enhanced-terminal |  |  |  |  |  |  |  |  | agent9 |
| `=` | both |  |  |  |  |  | dollyIn |  |  |  |
| `?` | both |  |  |  |  |  |  |  | helpKeymap |  |
| `⇧A` | both |  |  |  | selectAllLoadedEntries |  |  |  |  |  |
| `⌥⇧C` † | both |  |  |  |  |  |  | enterNativeSelection | enterNativeSelection |  |
| `⌥⇧V` † | both |  |  |  |  |  |  | enterSemanticSelection | enterSemanticSelection |  |
| `⌃]` | both | hostDetach |  |  |  |  |  |  |  |  |
| `a` | both |  |  |  | selectEntryUnderCaret |  |  |  |  |  |
| `⌃A` † | both |  |  |  |  |  |  | home | selectAllElements |  |
| `⌥a` | both |  |  |  |  |  |  | selectAll |  |  |
| `⌥b` | both |  |  |  |  |  |  | wordLeft |  |  |
| `⌫` | both |  |  |  |  |  |  | backspace |  |  |
| `⌥⌫` | both |  |  |  |  |  |  | queueDrop |  |  |
| `⌃⇧C` | enhanced-terminal |  |  |  |  |  |  | copySelection |  |  |
| `⌥d` | both |  |  |  |  |  |  | killWordRight |  |  |
| `delete` | both |  |  |  |  |  |  | delete |  |  |
| `↓` † | both |  |  |  | moveSemanticCaretDown | menuNext | insideDown | historyNext | rowDown |  |
| `⌥↓` | both |  |  |  |  |  |  |  |  | scrollPageDown |
| `⇧↓` † | both |  |  |  | extendSemanticSelectionDown |  |  |  | extendRowDown |  |
| `⌘↓` | enhanced-terminal |  |  |  |  |  |  |  |  | scrollBottom |
| `⌃E` | both |  |  |  |  |  |  | end |  |  |
| `⌃end` | both |  |  |  |  |  |  |  |  | scrollBottom |
| `end` | both |  |  |  |  |  |  | end |  |  |
| `⇧end` | both |  |  |  |  |  |  | extendLineEnd |  |  |
| `⏎` † | both |  |  |  | copySelectedEntries | menuAccept |  |  | rowActivate |  |
| `⌥⏎` † | both |  |  |  |  |  |  | insertNewline | rerunEntry |  |
| `⇧⏎` † | both |  |  |  |  |  |  | insertNewline | rerunEntry |  |
| `esc` † | both |  | dismiss | exitNativeSelection | escapeSemanticSelection | dismiss | exitInside |  | focusPrompt |  |
| `⌥esc` | enhanced-terminal | hostDetach |  |  |  |  |  |  |  |  |
| `⌥f` | both |  |  |  |  |  |  | wordRight |  |  |
| `F1` | both |  |  |  |  |  |  |  |  | helpKeymap |
| `⌃H` | both |  |  |  |  |  |  | backspace |  |  |
| `⌃home` | both |  |  |  |  |  |  |  |  | scrollTop |
| `home` | both |  |  |  |  |  |  | home |  |  |
| `⇧home` | both |  |  |  |  |  |  | extendLineStart |  |  |
| `⌃J` | both |  |  |  |  |  |  | insertNewline |  |  |
| `⌃K` | both |  |  |  |  |  |  | killToEnd |  |  |
| `⌃←` | both |  |  |  |  |  |  | wordLeft |  |  |
| `←` † | both |  |  |  |  |  | insideLeft | left |  |  |
| `⌥←` | both |  |  |  |  |  |  | wordLeft |  |  |
| `⌥⇧←` | both |  |  |  |  |  |  | extendWordLeft |  |  |
| `⇧←` | both |  |  |  |  |  |  | extendCharLeft |  |  |
| `o` | both |  |  |  |  |  | orbitToggle |  |  |  |
| `⌥p` | both |  |  |  |  |  |  |  |  | postureCycle |
| `pagedown` † | both |  |  |  |  |  |  |  | blockPageDown | scrollPageDown |
| `pageup` † | both |  |  |  |  |  |  |  | blockPageUp | scrollPageUp |
| `⌃R` † | both |  |  |  |  | searchOlder |  | reverseSearch |  |  |
| `r` | both |  |  |  |  |  | cameraReset |  |  |  |
| `⌃→` | both |  |  |  |  |  |  | wordRight |  |  |
| `⌥→` | both |  |  |  |  |  |  | wordRight |  |  |
| `⌥⇧→` | both |  |  |  |  |  |  | extendWordRight |  |  |
| `→` † | both |  |  |  |  |  | insideRight | acceptGhostOrForward |  |  |
| `⇧→` | both |  |  |  |  |  |  | extendCharRight |  |  |
| `⌃⇥` | enhanced-terminal |  |  |  |  |  |  |  |  | agentNext |
| `⌃⇧⇥` | enhanced-terminal |  |  |  |  |  |  |  |  | agentPrevious |
| `⇧⇥` † | both |  |  |  |  |  |  | focusTranscript | entryPrev |  |
| `⇥` † | both |  |  |  |  | menuNext |  | complete | entryNext |  |
| `⌃U` | both |  |  |  |  |  |  | killToStart |  |  |
| `⌥↑` | both |  |  |  |  |  |  |  |  | scrollPageUp |
| `⇧↑` † | both |  |  |  | extendSemanticSelectionUp |  |  |  | extendRowUp |  |
| `⌘↑` | enhanced-terminal |  |  |  |  |  |  |  |  | scrollTop |
| `↑` † | both |  |  |  | moveSemanticCaretUp | menuPrev | insideUp | historyPrev | rowUp |  |
| `⌃⇧V` | enhanced-terminal |  |  |  |  |  |  | yank |  |  |
| `⌥v` † | both |  |  |  |  |  |  | valuesToggle | valuesToggle |  |
| `⌃W` | both |  |  |  |  |  |  | killWordLeft |  |  |
| `⌥w` | both |  |  |  |  |  |  | copySelection |  |  |
| `⌃Y` | both |  |  |  |  |  |  | yank |  |  |
| `y` † | both |  |  |  | copySelectedEntries |  |  |  | copyElement |  |
| `⌃Z` | both |  |  |  |  |  |  | undo |  |  |
| `⌥z` | both |  |  |  |  |  |  | redo |  |  |

123 bindings · 91 keys · 20 resolved by the ladder (†).
