/**
 * A form's submit — the button's command, completed with the fields' values
 * (C04 I137, §105, A01 D8).
 *
 * **In the shell and not in the kind**: C18's `quote` is L3's and a block
 * definition is L1's, so an element carries its button's own action and the
 * shell completes it at dispatch, after the borrow has ended (C22 I118).
 *
 * **Arguments, and never a template.** The command stays a string the reader
 * can read before it runs — which is `fill`'s whole argument — and C18's one
 * quoter makes a value with a space or a quote one token, as the parser will
 * read it back (C18 I11).
 */
import type { Action, Form } from "../data/viewmodel/index.js";
import { quote } from "../interaction/parser/index.js";

/** `action` completed for `buttonId`'s submit, or `action` itself where that button does not submit. */
export function submitAction(form: Form, buttonId: string, action: Action): Action {
  const button = form.buttons?.find((b) => b.id === buttonId);
  if (button?.submit !== true || (action.kind !== "fill" && action.kind !== "exec")) return action;
  const args = form.fields
    .filter((f) => (f.value ?? "") !== "")
    .map((f) => {
      const flag = f.flag ?? `--${f.id}`;
      return flag === "" ? quote(f.value ?? "") : `${flag} ${quote(f.value ?? "")}`;
    });
  return { ...action, command: [action.command, ...args].join(" ") };
}
