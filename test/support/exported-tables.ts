// The exported tables of a set of modules, as the type checker sees them (C10 I44).
//
// **Why the checker and not the source text.** What makes a value a table is its
// declared type, and a scan over the text can only see an initialiser's spelling:
// the regex this replaced matched `= Object.freeze(`, `= {` and `= [`, and so
// missed `defaultTheme = REGISTRY_THEMES`, `DARK_FOUR_BIT = FOUR_BIT.dark` and
// `FREE_WIDTH_SLOTS = new Set(…)` — measured at `f34ec560`, 20 found of 28.
//
// **Why this API.** TypeScript 7 is native and exports no in-process compiler;
// `typescript/unstable/sync` is the same installed binary answering over a pipe,
// so this reads the tree with the compiler that type-checks it and no second one.
// The surface is marked unstable and `typescript` is pinned exactly — a bump that
// moves it fails here loudly, since the caller asserts what it expects to find.
import { API, SignatureKind, SymbolFlags, TypeFlags } from "typescript/unstable/sync";

export interface DiscoveredTable {
  /** The declaration's own name, after a re-export is resolved to it. */
  readonly name: string;
  /** Repository-relative path of the first module that exports it. */
  readonly module: string;
}

/**
 * Every exported value in `modules` whose type is an object type with no call
 * signature — a table, whatever its initialiser. A re-export resolves to its
 * declaration, so a barrel repeating a name adds nothing; two *distinct*
 * declarations sharing a name are both returned, for the caller to refuse.
 */
export const discoverTables = (root: string, modules: readonly string[]): readonly DiscoveredTable[] => {
  const api = new API({ cwd: root });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [`${root}/tsconfig.json`] });
    const project = snapshot.getProjects()[0];
    if (project === undefined) throw new Error(`no project opened at ${root}/tsconfig.json`);
    const { checker, program } = project;
    const seen = new Map<number, DiscoveredTable>();
    for (const rel of modules) {
      const file = program.getSourceFile(`${root}/${rel}`);
      if (file === undefined) throw new Error(`${rel} is not in the project`);
      const module = checker.getSymbolAtLocation(file);
      if (module === undefined) continue; // a module with no exports
      for (const exported of checker.getExportsOfModule(module)) {
        const symbol = (exported.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(exported) : exported;
        if ((symbol.flags & SymbolFlags.Variable) === 0 || seen.has(symbol.id)) continue;
        const type = checker.getTypeOfSymbol(symbol);
        if (type === undefined || (type.flags & TypeFlags.Object) === 0) continue;
        if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0) continue;
        seen.set(symbol.id, { name: symbol.name, module: rel });
      }
    }
    return [...seen.values()];
  } finally {
    api.close();
  }
};
