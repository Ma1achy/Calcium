# Key ladder

**Generated** by `npx tsx tools/keymap-table.mjs` from `defaultKeymap` (`src/interaction/router/keymap.ts`) in `FOCUS_ORDER` (`src/interaction/router/focus.ts`). Do not edit by hand: `test/unit/keymap-table.test.ts` fails when this file and the live keymap disagree.

Columns left to right are the ladder's priority (C16 §3, A02 §2): the active target is the first whose condition holds, and `global` is consulted after it. A key bound at two or more targets is marked † — which action fires depends on which target is active, never on the row's position in the source. `interaction` holds no built-in binding: a block's own keys land there at runtime when they collide with `global` or `liveBlock` (C16 I27), and are outside this table.

| key | overlay | copyMode | pushedView | interaction | prompt | liveBlock | global |
|---|---|---|---|---|---|---|---|
| `+` |  |  |  |  |  | dollyIn |  |
| `-` |  |  |  |  |  | dollyOut |  |
| `=` |  |  |  |  |  | dollyIn |  |
| `G` |  |  | viewBottom |  |  |  |  |
| `[` |  |  |  |  |  | orbitLeft |  |
| `]` |  |  |  |  |  | orbitRight |  |
| `c+a` † |  |  |  |  | home | selectAllElements |  |
| `m+a` |  |  |  |  | selectAll |  |  |
| `m+b` |  |  |  |  | wordLeft |  |  |
| `backspace` |  |  |  |  | backspace |  |  |
| `m+backspace` |  |  |  |  | killWordLeft |  |  |
| `m+d` |  |  |  |  | killWordRight |  |  |
| `delete` |  |  |  |  | delete |  |  |
| `down` † | menuNext |  | viewPageDown |  | historyNext | rowDown |  |
| `s+down` |  |  |  |  |  | extendRowDown |  |
| `c+e` |  |  |  |  | end |  |  |
| `c+end` |  |  |  |  |  |  | scrollBottom |
| `end` |  |  |  |  | end |  |  |
| `s+end` |  |  |  |  | extendLineEnd |  |  |
| `enter` † | menuAccept |  |  |  |  | rowActivate |  |
| `m+enter` † |  |  |  |  | insertNewline | rerunEntry |  |
| `s+enter` † |  |  |  |  | insertNewline | rerunEntry |  |
| `escape` † | dismiss | exitCopyMode | viewPop |  |  | focusPrompt |  |
| `m+f` |  |  |  |  | wordRight |  |  |
| `g` |  |  | viewTop |  |  |  |  |
| `c+h` |  |  |  |  | backspace |  |  |
| `c+home` |  |  |  |  |  |  | scrollTop |
| `home` |  |  |  |  | home |  |  |
| `s+home` |  |  |  |  | extendLineStart |  |  |
| `c+j` |  |  |  |  | insertNewline |  |  |
| `c+k` |  |  |  |  | killToEnd |  |  |
| `c+left` |  |  |  |  | wordLeft |  |  |
| `left` † |  |  |  |  | left | cursorLeft |  |
| `ms+left` |  |  |  |  | extendWordLeft |  |  |
| `s+left` |  |  |  |  | extendCharLeft |  |  |
| `n` |  |  | viewNextHunk |  |  |  |  |
| `o` |  |  |  |  |  | orbitToggle |  |
| `p` |  |  | viewPrevHunk |  |  |  |  |
| `pagedown` † |  |  | viewPageDown |  |  | blockPageDown | scrollPageDown |
| `pageup` † |  |  | viewPageUp |  |  | blockPageUp | scrollPageUp |
| `c+r` † | searchOlder |  |  |  | reverseSearch |  |  |
| `r` |  |  |  |  |  | cameraReset |  |
| `c+right` |  |  |  |  | wordRight |  |  |
| `ms+right` |  |  |  |  | extendWordRight |  |  |
| `right` † |  |  |  |  | acceptGhostOrForward | cursorRight |  |
| `s+right` |  |  |  |  | extendCharRight |  |  |
| `s+tab` |  |  |  |  |  | entryPrev |  |
| `tab` † | menuNext |  |  |  | complete | entryNext |  |
| `c+u` |  |  |  |  | killToStart |  |  |
| `s+up` |  |  |  |  |  | extendRowUp |  |
| `up` † | menuPrev |  | viewPageUp |  | historyPrev | rowUp |  |
| `m+v` † |  |  |  |  | enterCopyMode | enterCopyMode |  |
| `c+w` |  |  |  |  | killWordLeft |  |  |
| `m+w` |  |  |  |  | copySelection |  |  |
| `c+y` |  |  |  |  | yank |  |  |
| `y` |  |  |  |  |  | copyElement |  |
| `c+z` |  |  |  |  | undo |  |  |
| `m+z` |  |  |  |  | redo |  |  |
| `{` |  |  |  |  |  | tiltDown |  |
| `}` |  |  |  |  |  | tiltUp |  |

83 bindings · 60 keys · 14 resolved by the ladder (†).
