// C22 I135–I140, C16 I76 and C05 §3 — watches through a built session
// (ruling 50, §085, C22 §6p).
import { describe, it } from "vitest";

describe("C22 §6p — watches through a built session (ruling 50)", () => {
  it.todo(`T4.110 (C22 I135, I136, I137, I139, I140, C16 I76): /watch, a progress patch, ⇧⇥, ⏎ and the settle — not deferred on a component: the code lands in the next commit of this round`);
  it.todo(`T4.111 (C22 I135, I126): a watched short settle rings while away, an unwatched one does not, and the row needs no opt-in — not deferred on a component: the code lands in the next commit of this round`);
  it.todo(`T4.112 (C22 I136, C23 I5, C22 §6p.5): /watch behind a guard-holding invoke answers nothing is running to watch — not deferred on a component: the code lands in the next commit of this round`);
  it.todo(`T4.113 (C22 I137, C16 I76, R-COR-002): the last watch settling leaves focus on the row, and a question over it takes the keys — not deferred on a component: the code lands in the next commit of this round`);
  it.todo(`T4.95 (C16 I76): ⇧⇥ from the prompt goes to the row while a watch stands, then to the transcript; ⇥ and ⌃c return — not deferred on a component: the code lands in the next commit of this round`);
  it.todo(`T4.10 (C05 §3, C22 I136): /watch and /unwatch are framework rows after /config — not deferred on a component: the code lands in the next commit of this round`);
});
