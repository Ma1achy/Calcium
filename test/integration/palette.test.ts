// C16 I68 — `>` opens the action palette only as the line's first character, and a
// `>`-led line never reaches C18 (§6c "The palette's way in", ruling 45, ruling 67).
import { describe, it } from "vitest";

describe("C16 §6c — the palette's way in (review batch 2, M6, ruling 45)", () => {
  it.todo(
    "T1.176 (C16 I68): contextAt answers the action slot for a >-led line and C18's slot for every other — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T1.177 (C16 I68): > opens the menu over the actions, Tab then ⏎ runs one, and a handler-less reserved action is not offered — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T1.178 (C16 I68): the palette's rows are the actions the prompt reaches, each with its chords — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T4.109 (C16 I68): `> notes` ⏎ submits nothing and keeps the line; `ls > notes` is submitted — not deferred on a component: the code lands in the next commit of this round",
  );
});
