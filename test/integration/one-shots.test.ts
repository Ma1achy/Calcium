// C22 §6o — one-shots, stamped by the shell and stopped when they end.
import { describe, it } from "vitest";

describe("C22 §6o — a one-shot from a producer that cannot stamp it", () => {
  it.todo("T4.106 (C22 I131, C04 I109): a local handler's pop with no since plays and then stops writing — not deferred on a component: the code lands in the next commit of this round");
  it.todo("T4.107 (C22 I131, C22 I132, C09 I120): a b.live poll re-emitting a wipe does not replay it, and the completed one-shot disarms the ticker — not deferred on a component: the code lands in the next commit of this round");
});
