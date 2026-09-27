// C10 I63 — a retired theme name resolves to the generated theme that replaced
// it, wherever a name is read, and never shadows a name the set declares.
import { describe, it } from "vitest";

describe("C10 I63 — the high-contrast alias", () => {
  it.todo("T1.53 (C10 I63): loadTheme(defaultTheme, \"high-contrast\") opens hcDark by identity, and setTheme resolves the alias — not deferred on a component: the code lands in the next commit of this round");
  it.todo("T2.67 (C10 I63, R-THM-002): a 5.79 : 1 accent override on bgElev through the alias is refused — not deferred on a component: the code lands in the next commit of this round");
  it.todo("T2.68 (C10 I63): the alias never shadows a declared key, and resolves to nothing without its target — not deferred on a component: the code lands in the next commit of this round");
});
