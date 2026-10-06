// C10 I63 — a retired theme name resolves to the generated theme that replaced
// it, wherever a name is read, and never shadows a name the set declares.
// Mutated at each reader (C10 T6.111–T6.114): the store's switch, the resolver's
// order, the persisted preference, the handler's write-back, the enum.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/theme-alias.test.ts test/integration/theme-alias.test.ts";
const STORE = "src/presentation/theme/store.ts";
const CONSTRUCT = "src/shell/construct.ts";
const HANDLERS = "src/shell/local/handlers.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: STORE,
    from: 'Object.freeze({ "high-contrast": "hcDark" });',
    to: 'Object.freeze({ "high-contrast": "hcLight" });',
    why: "the alias pointed at the other high-contrast theme — T1.53 opens it by identity",
  },
  mutations: [
    {
      name: "SWITCH-UNRESOLVED: setTheme looks the name up without resolving it (T6.111)",
      file: STORE,
      from: "      const next = resolveThemeName(tokens, requested);",
      to: "      const next = Object.hasOwn(tokens, requested) ? requested : undefined;",
      expect: "T1.53",
    },
    {
      name: "SHADOW: the alias consulted before the set's own keys (T6.112)",
      file: STORE,
      from: "  if (Object.hasOwn(set, name)) return name;\n  const target = Object.hasOwn(THEME_ALIASES, name) ? THEME_ALIASES[name] : undefined;\n  return target !== undefined && Object.hasOwn(set, target) ? target : undefined;",
      to: "  const target = Object.hasOwn(THEME_ALIASES, name) ? THEME_ALIASES[name] : undefined;\n  if (target !== undefined && Object.hasOwn(set, target)) return target;\n  return Object.hasOwn(set, name) ? name : undefined;",
      expect: "T2.68",
    },
    {
      name: "PERSISTED-LOOKUP: the preference guard is a membership test again (T6.113)",
      file: CONSTRUCT,
      from: '    const stated = trimmed === "" ? undefined : themed.value.resolveName(trimmed);',
      to: '    const stated = themed.value.names.includes(trimmed) ? trimmed : undefined;',
      expect: "T4.38",
    },
    {
      name: "WRITE-TYPED: /theme persists the word typed, not the name resolved (T6.114)",
      file: HANDLERS,
      from: "      deps.persistTheme?.(chosen);",
      to: "      deps.persistTheme?.(wanted);",
      expect: "T4.38",
    },
    {
      name: "ENUM-KEYS: /theme's enum is the set's keys alone (T6.114)",
      file: CONSTRUCT,
      from: "    manifest.load(withThemeNames(parsed.value, themeNames(config.theme)));",
      to: "    manifest.load(withThemeNames(parsed.value, Object.keys(config.theme)));",
      expect: "T4.38",
    },
    {
      name: "OPEN-UNRESOLVED: loadTheme's opening is looked up, not resolved (T6.113)",
      file: STORE,
      from: "  const opened = opening === undefined ? first : resolveThemeName(set, opening);",
      to: "  const opened = opening === undefined ? first : Object.hasOwn(set, opening) ? opening : undefined;",
      expect: "T1.53",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
