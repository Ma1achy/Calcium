# golden

Frames at 4 widths × 2 themes × 2 unicode modes.

**Two axes, and the second one is why this file has prose.** `blocks.test.ts` frames
`ONE_PER_KIND` — a `Record<BlockKind, Block>`, exhaustive over kinds by its type and holding
exactly one state of each. `states.test.ts` frames `STATES`, one entry per *state*.

The first axis answers *does this kind render*. It can answer nothing about *which state it is
in*, so a new state of an existing kind is invisible to it by construction — which is how the
continuation mark, the gapped series and the wide ramp's lowest step each shipped with golden
green and each needed a frame added afterwards.

`ambiguousWidth: "wide"` is a variant in `states.test.ts` and nowhere else: `cells()` counts a
blank braille cell as one, so every width and length assertion passed while the lowest reading
drew as padding (F171). **The only instrument that reaches a glyph nobody can see is a picture.**

Adding a state is three lines in `test/support/states.ts` plus a name in
`test/contract/states.test.ts` — the equality arm fails until both exist, in either direction.
A03 CP11 records what that arm cannot do.
