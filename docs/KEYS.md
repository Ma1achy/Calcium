<!-- GENERATED FILE — DO NOT EDIT. Source: docs/design/language/calcium-registry.json, rendered by build-calcium.mjs's renderKeysMarkdown; written with the key ladder below by tools/keymap-table.mjs -->
# Calcium keys

Revision 0.14 · 57 current bindings · a `default-terminal` chord is one a terminal without the Kitty protocol sends; an `enhanced-terminal` chord needs the protocol

The universal set gives one purpose to each key and does not depend on what has focus; the active owner resolves that purpose.

docs/KEYS.md and the help entry come from the same source; a hand-written keymap drifts.

## global

| Route | Binding | Profile | Condition | Action | Meaning |
| --- | --- | --- | --- | --- | --- |
| key | ⏎ | default-terminal | always | confirm | confirm · send · activate · open |
| key | esc | default-terminal | always | escape | out one owner rung · cancel · clear |
| key | ⇥ | default-terminal | always | focus.next | move focus forward; complete in the prompt |
| key | ⇧⇥ | default-terminal | always | focus.previous | move focus backward |
| key | ↑ | default-terminal | focused | move.up | move up within the focused thing |
| key | ↓ | default-terminal | focused | move.down | move down within the focused thing |
| key | ← | default-terminal | focused | move.left | move left within the focused thing |
| key | → | default-terminal | focused | move.right | move right within the focused thing |
| key | ⇧↑ | default-terminal | selectable | selection.up | extend selection up |
| key | ⇧↓ | default-terminal | selectable | selection.down | extend selection down |
| key | ⇧← | default-terminal | selectable | selection.left | extend selection left |
| key | ⇧→ | default-terminal | selectable | selection.right | extend selection right |
| key | ⌃⇧C | enhanced-terminal | always | copy | copy source; ⌘C where passed through |
| key | ⌥w | default-terminal | always | copy | copy source; ⌘C where passed through |
| key | ⌃C | default-terminal | running | interrupt | interrupt |
| key | F1 | default-terminal | always | help.f1 | emit the resolved keymap |
| key | ? | default-terminal | non-typing | help.question | emit the resolved keymap |
| command | /help | default-terminal | typing | help.command | base-terminal help route |
| key | ⌃⇥ | enhanced-terminal | always | agent.next | switch to next agent |
| key | ⌥. | default-terminal | always | agent.next | switch to next agent |
| key | ⌃⇧⇥ | enhanced-terminal | always | agent.previous | switch to previous agent |
| key | ⌥, | default-terminal | always | agent.previous | switch to previous agent |
| key | ⌘1 | enhanced-terminal | always | agent.1 | jump to agent 1 |
| key | ⌥1 | default-terminal | always | agent.1 | jump to agent 1 |
| key | ⌘2 | enhanced-terminal | always | agent.2 | jump to agent 2 |
| key | ⌥2 | default-terminal | always | agent.2 | jump to agent 2 |
| key | ⌘3 | enhanced-terminal | always | agent.3 | jump to agent 3 |
| key | ⌥3 | default-terminal | always | agent.3 | jump to agent 3 |
| key | ⌘4 | enhanced-terminal | always | agent.4 | jump to agent 4 |
| key | ⌥4 | default-terminal | always | agent.4 | jump to agent 4 |
| key | ⌘5 | enhanced-terminal | always | agent.5 | jump to agent 5 |
| key | ⌥5 | default-terminal | always | agent.5 | jump to agent 5 |
| key | ⌘6 | enhanced-terminal | always | agent.6 | jump to agent 6 |
| key | ⌥6 | default-terminal | always | agent.6 | jump to agent 6 |
| key | ⌘7 | enhanced-terminal | always | agent.7 | jump to agent 7 |
| key | ⌥7 | default-terminal | always | agent.7 | jump to agent 7 |
| key | ⌘8 | enhanced-terminal | always | agent.8 | jump to agent 8 |
| key | ⌥8 | default-terminal | always | agent.8 | jump to agent 8 |
| key | ⌘9 | enhanced-terminal | always | agent.9 | jump to agent 9 |
| key | ⌥9 | default-terminal | always | agent.9 | jump to agent 9 |
| key | ⌥p | default-terminal | always | posture.cycle | cycle permission posture |
| key | ⌥⇧C | default-terminal | always | selection.native | hand the mouse to the terminal |
| key | ⌥⇧V | default-terminal | always | selection.semantic | enter Calcium copy mode |
| key | ⌃] | default-terminal | attached | host.detach | host escape |
| key | ⌥esc | enhanced-terminal | attached | host.detach | enhanced detach |

## prompt

| Route | Binding | Profile | Condition | Action | Meaning |
| --- | --- | --- | --- | --- | --- |
| key | ⇧⏎ | enhanced-terminal | always | newline | newline |
| key | ⌥⏎ | default-terminal | always | newline | newline |
| key | ⌃⇧V | enhanced-terminal | always | paste | paste |
| key | ⌃Y | default-terminal | always | paste | paste |
| key | ⌥⌫ | default-terminal | always | queue.drop | drop the last queued message |

## transcript

| Route | Binding | Profile | Condition | Action | Meaning |
| --- | --- | --- | --- | --- | --- |
| key | ⌥↑ | default-terminal | always | page.up | scroll one page up |
| key | ⌥↓ | default-terminal | always | page.down | scroll one page down |
| key | ⌘↑ | enhanced-terminal | always | transcript.top | go to top |
| key | ⌃home | default-terminal | always | transcript.top | go to top |
| key | ⌘↓ | enhanced-terminal | always | transcript.bottom | go to bottom |
| key | ⌃end | default-terminal | always | transcript.bottom | go to bottom |
| key | ⌥v | default-terminal | always | values.toggle | toggle per-token values |

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
| `?` † | both |  |  | passToTerminal |  |  |  |  |  | helpKeymap |
| `⇧A` | both |  |  |  | selectAllLoadedEntries |  |  |  |  |  |
| `⌥⇧C` | both |  |  |  |  |  |  |  |  | enterNativeSelection |
| `⌥⇧V` | both |  |  |  |  |  |  |  |  | enterSemanticSelection |
| `⌃]` | both | hostDetach |  |  |  |  |  |  |  |  |
| `a` | both |  |  |  | selectEntryUnderCaret |  |  |  |  |  |
| `⌃A` † | both |  |  |  |  |  |  | home | selectAllElements |  |
| `⌥a` | both |  |  |  |  |  |  | selectAll |  |  |
| `⌥b` | both |  |  |  |  |  |  | wordLeft |  |  |
| `⌫` | both |  |  |  |  |  |  | backspace |  |  |
| `⌥⌫` | both |  |  |  |  |  |  | queueDrop, else killWordLeft |  |  |
| `⌃⇧C` † | enhanced-terminal |  |  |  | copySelectedEntries |  | copyElement | copySelection | copyElement |  |
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
| `⏎` † | both |  |  |  | copySelectedEntries | menuAccept | keepField | submit | rowActivate |  |
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
| `←` † | both |  |  |  |  |  | insideLeft | left | paneLeft |  |
| `⌥←` † | both |  |  |  |  |  |  | wordLeft | dividerLeft |  |
| `⌥⇧←` | both |  |  |  |  |  |  | extendWordLeft |  |  |
| `⇧←` | both |  |  |  |  |  |  | extendCharLeft |  |  |
| `o` | both |  |  |  |  |  | orbitToggle |  |  |  |
| `⌥p` | both |  |  |  |  |  |  |  |  | postureCycle |
| `pagedown` † | both |  |  |  |  |  |  |  | blockPageDown | scrollPageDown |
| `pageup` † | both |  |  |  |  |  |  |  | blockPageUp | scrollPageUp |
| `⌃R` † | both |  |  |  |  | searchOlder |  | reverseSearch |  |  |
| `r` | both |  |  |  |  |  | cameraReset |  |  |  |
| `⌃→` | both |  |  |  |  |  |  | wordRight |  |  |
| `⌥→` † | both |  |  |  |  |  |  | wordRight | dividerRight |  |
| `⌥⇧→` | both |  |  |  |  |  |  | extendWordRight |  |  |
| `→` † | both |  |  |  |  |  | insideRight | acceptGhostOrForward | paneRight |  |
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
| `⌥w` † | both |  |  |  | copySelectedEntries |  | copyElement | copySelection | copyElement |  |
| `⌃Y` | both |  |  |  |  |  |  | yank |  |  |
| `y` † | both |  |  |  | copySelectedEntries |  |  |  | copyElement |  |
| `⌃Z` | both |  |  |  |  |  |  | undo |  |  |
| `⌥z` | both |  |  |  |  |  |  | redo |  |  |

134 bindings · 91 keys · 23 resolved by the ladder (†).
