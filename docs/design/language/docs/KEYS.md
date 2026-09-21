<!-- GENERATED FILE — DO NOT EDIT. Source: ../calcium-registry.json; builder: ../build-calcium.mjs -->
# Calcium keys

Revision 0.9 · 39 current bindings · profile: default-terminal

The universal set gives one purpose to each key and does not depend on what has focus; the active owner resolves that purpose.

docs/KEYS.md and the help entry come from the same source; a hand-written keymap drifts.

## global

| Route | Binding | Condition | Action | Meaning |
| --- | --- | --- | --- | --- |
| key | ⏎ | always | confirm | confirm · send · activate · open |
| key | esc | always | escape | out one owner rung · cancel · clear |
| key | ⇥ | always | focus.next | move focus forward; complete in the prompt |
| key | ⇧⇥ | always | focus.previous | move focus backward |
| key | ↑ | focused | move.up | move up within the focused thing |
| key | ↓ | focused | move.down | move down within the focused thing |
| key | ← | focused | move.left | move left within the focused thing |
| key | → | focused | move.right | move right within the focused thing |
| key | ⇧↑ | selectable | selection.up | extend selection up |
| key | ⇧↓ | selectable | selection.down | extend selection down |
| key | ⇧← | selectable | selection.left | extend selection left |
| key | ⇧→ | selectable | selection.right | extend selection right |
| key | ⌃⇧C | always | copy | copy source; ⌘C where passed through |
| key | ⌃C | running | interrupt | interrupt |
| key | F1 | always | help.f1 | emit the resolved keymap |
| key | ? | non-typing | help.question | emit the resolved keymap |
| command | /help | typing | help.command | base-terminal help route |
| key | ⌃⇥ | always | agent.next | switch to next agent |
| key | ⌃⇧⇥ | always | agent.previous | switch to previous agent |
| key | ⌘1 | always | agent.1 | jump to agent 1 |
| key | ⌘2 | always | agent.2 | jump to agent 2 |
| key | ⌘3 | always | agent.3 | jump to agent 3 |
| key | ⌘4 | always | agent.4 | jump to agent 4 |
| key | ⌘5 | always | agent.5 | jump to agent 5 |
| key | ⌘6 | always | agent.6 | jump to agent 6 |
| key | ⌘7 | always | agent.7 | jump to agent 7 |
| key | ⌘8 | always | agent.8 | jump to agent 8 |
| key | ⌘9 | always | agent.9 | jump to agent 9 |
| key | ⌥p | always | posture.cycle | cycle permission posture |
| key | ⌥⇧C | always | selection.native | hand the mouse to the terminal |
| key | ⌥⇧V | always | selection.semantic | enter Calcium copy mode |

## prompt

| Route | Binding | Condition | Action | Meaning |
| --- | --- | --- | --- | --- |
| key | ⇧⏎ | always | newline | newline |
| key | ⌃⇧V | always | paste | paste |
| key | ⌥⌫ | always | queue.drop | drop the last queued message |

## transcript

| Route | Binding | Condition | Action | Meaning |
| --- | --- | --- | --- | --- |
| key | ⌥↑ | always | page.up | scroll one page up |
| key | ⌥↓ | always | page.down | scroll one page down |
| key | ⌘↑ | always | transcript.top | go to top |
| key | ⌘↓ | always | transcript.bottom | go to bottom |
| key | ⌥v | always | values.toggle | toggle per-token values |
