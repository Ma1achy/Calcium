# Key ladder

**Generated** by `npx tsx tools/keymap-table.mjs` from `defaultKeymap` (`src/interaction/router/keymap.ts`) in `FOCUS_ORDER` (`src/interaction/router/focus.ts`). Do not edit by hand: `test/unit/keymap-table.test.ts` fails when this file and the live keymap disagree.

Columns left to right are the ladder's priority (C16 §3, A02 §2): the active target is the first whose condition holds, and `global` is consulted after it. A key bound at two or more targets is marked † — which action fires depends on which target is active, never on the row's position in the source. `interaction` holds no built-in binding: a block's own keys land there at runtime when they collide with `global` or `liveBlock` (C16 I27), and are outside this table.


**The `profile` column** (C16 §6a, I35). `both` is the ordinary case. `enhanced-terminal` is a route that resolves only where `capabilities.keyboardProtocol === "kitty"`; every action with one also has a `both` route, because ⌘, ⇧⏎, ⌃⇧-letters and ⌃⇥ are byte-identical to their unmodified forms on a terminal without the protocol (I36).

**Every `m+` route needs the terminal to send Option as Meta** — ESC-prefixing rather than composing a character, which on macOS means *Use Option as Meta Key* in Terminal.app and `Esc+` in iTerm2. Not a new assumption: every `m+` row in this table has always required it.

| key | profile | child | overlay | copyMode | panel | interaction | prompt | liveBlock | global |
|---|---|---|---|---|---|---|---|---|---|
| `+` | both |  |  |  |  |  |  | dollyIn |  |
| `m+,` | both |  |  |  |  |  |  |  | agentPrevious |
| `-` | both |  |  |  |  |  |  | dollyOut |  |
| `m+.` | both |  |  |  |  |  |  |  | agentNext |
| `m+1` | both |  |  |  |  |  |  |  | agent1 |
| `u+1` | enhanced-terminal |  |  |  |  |  |  |  | agent1 |
| `m+2` | both |  |  |  |  |  |  |  | agent2 |
| `u+2` | enhanced-terminal |  |  |  |  |  |  |  | agent2 |
| `m+3` | both |  |  |  |  |  |  |  | agent3 |
| `u+3` | enhanced-terminal |  |  |  |  |  |  |  | agent3 |
| `m+4` | both |  |  |  |  |  |  |  | agent4 |
| `u+4` | enhanced-terminal |  |  |  |  |  |  |  | agent4 |
| `m+5` | both |  |  |  |  |  |  |  | agent5 |
| `u+5` | enhanced-terminal |  |  |  |  |  |  |  | agent5 |
| `m+6` | both |  |  |  |  |  |  |  | agent6 |
| `u+6` | enhanced-terminal |  |  |  |  |  |  |  | agent6 |
| `m+7` | both |  |  |  |  |  |  |  | agent7 |
| `u+7` | enhanced-terminal |  |  |  |  |  |  |  | agent7 |
| `m+8` | both |  |  |  |  |  |  |  | agent8 |
| `u+8` | enhanced-terminal |  |  |  |  |  |  |  | agent8 |
| `m+9` | both |  |  |  |  |  |  |  | agent9 |
| `u+9` | enhanced-terminal |  |  |  |  |  |  |  | agent9 |
| `=` | both |  |  |  |  |  |  | dollyIn |  |
| `?` | both |  |  |  |  |  |  | helpKeymap |  |
| `m+C` † | both |  |  |  |  |  | enterCopyMode | enterCopyMode |  |
| `m+V` † | both |  |  |  |  |  | enterSemanticSelection | enterSemanticSelection |  |
| `[` | both |  |  |  |  |  |  | orbitLeft |  |
| `]` | both |  |  |  |  |  |  | orbitRight |  |
| `c+]` | both | hostDetach |  |  |  |  |  |  |  |
| `c+a` † | both |  |  |  |  |  | home | selectAllElements |  |
| `m+a` | both |  |  |  |  |  | selectAll |  |  |
| `m+b` | both |  |  |  |  |  | wordLeft |  |  |
| `backspace` | both |  |  |  |  |  | backspace |  |  |
| `m+backspace` | both |  |  |  |  |  | queueDrop |  |  |
| `cs+c` | enhanced-terminal |  |  |  |  |  | copySelection |  |  |
| `m+d` | both |  |  |  |  |  | killWordRight |  |  |
| `delete` | both |  |  |  |  |  | delete |  |  |
| `down` † | both |  |  |  | menuNext |  | historyNext | rowDown |  |
| `m+down` | both |  |  |  |  |  |  |  | scrollPageDown |
| `s+down` | both |  |  |  |  |  |  | extendRowDown |  |
| `u+down` | enhanced-terminal |  |  |  |  |  |  |  | scrollBottom |
| `c+e` | both |  |  |  |  |  | end |  |  |
| `c+end` | both |  |  |  |  |  |  |  | scrollBottom |
| `end` | both |  |  |  |  |  | end |  |  |
| `s+end` | both |  |  |  |  |  | extendLineEnd |  |  |
| `enter` † | both |  |  |  | menuAccept |  |  | rowActivate |  |
| `m+enter` † | both |  |  |  |  |  | insertNewline | rerunEntry |  |
| `s+enter` † | both |  |  |  |  |  | insertNewline | rerunEntry |  |
| `escape` † | both |  | dismiss | exitCopyMode | dismiss |  |  | focusPrompt |  |
| `m+escape` | enhanced-terminal | hostDetach |  |  |  |  |  |  |  |
| `m+f` | both |  |  |  |  |  | wordRight |  |  |
| `f1` | both |  |  |  |  |  |  |  | helpKeymap |
| `c+h` | both |  |  |  |  |  | backspace |  |  |
| `c+home` | both |  |  |  |  |  |  |  | scrollTop |
| `home` | both |  |  |  |  |  | home |  |  |
| `s+home` | both |  |  |  |  |  | extendLineStart |  |  |
| `c+j` | both |  |  |  |  |  | insertNewline |  |  |
| `c+k` | both |  |  |  |  |  | killToEnd |  |  |
| `c+left` | both |  |  |  |  |  | wordLeft |  |  |
| `left` † | both |  |  |  |  |  | left | cursorLeft |  |
| `ms+left` | both |  |  |  |  |  | extendWordLeft |  |  |
| `s+left` | both |  |  |  |  |  | extendCharLeft |  |  |
| `o` | both |  |  |  |  |  |  | orbitToggle |  |
| `m+p` | both |  |  |  |  |  |  |  | postureCycle |
| `pagedown` † | both |  |  |  |  |  |  | blockPageDown | scrollPageDown |
| `pageup` † | both |  |  |  |  |  |  | blockPageUp | scrollPageUp |
| `c+r` † | both |  |  |  | searchOlder |  | reverseSearch |  |  |
| `r` | both |  |  |  |  |  |  | cameraReset |  |
| `c+right` | both |  |  |  |  |  | wordRight |  |  |
| `ms+right` | both |  |  |  |  |  | extendWordRight |  |  |
| `right` † | both |  |  |  |  |  | acceptGhostOrForward | cursorRight |  |
| `s+right` | both |  |  |  |  |  | extendCharRight |  |  |
| `c+tab` | enhanced-terminal |  |  |  |  |  |  |  | agentNext |
| `cs+tab` | enhanced-terminal |  |  |  |  |  |  |  | agentPrevious |
| `s+tab` † | both |  |  |  |  |  | focusTranscript | entryPrev |  |
| `tab` † | both |  |  |  | menuNext |  | complete | entryNext |  |
| `c+u` | both |  |  |  |  |  | killToStart |  |  |
| `m+up` | both |  |  |  |  |  |  |  | scrollPageUp |
| `s+up` | both |  |  |  |  |  |  | extendRowUp |  |
| `u+up` | enhanced-terminal |  |  |  |  |  |  |  | scrollTop |
| `up` † | both |  |  |  | menuPrev |  | historyPrev | rowUp |  |
| `cs+v` | enhanced-terminal |  |  |  |  |  | yank |  |  |
| `m+v` † | both |  |  |  |  |  | valuesToggle | valuesToggle |  |
| `c+w` | both |  |  |  |  |  | killWordLeft |  |  |
| `m+w` | both |  |  |  |  |  | copySelection |  |  |
| `c+y` | both |  |  |  |  |  | yank |  |  |
| `y` | both |  |  |  |  |  |  | copyElement |  |
| `c+z` | both |  |  |  |  |  | undo |  |  |
| `m+z` | both |  |  |  |  |  | redo |  |  |
| `{` | both |  |  |  |  |  |  | tiltDown |  |
| `}` | both |  |  |  |  |  |  | tiltUp |  |

113 bindings · 91 keys · 17 resolved by the ladder (†).
