// Types for the deferral-expiry rule, so the suite drives the same code
// `make enforce` would rather than keeping a second copy of the parser.
// A copy would drift, and then the test passes while the tree is wrong.

export type Violation = {
  rule: string;
  file: string;
  message: string;
  spec: string;
};

export type TodoEntry = {
  file: string;
  title: string;
};

export declare const COMPONENT_SOURCES: Readonly<Record<string, string>>;
export declare const LAYER_SOURCES: Readonly<Record<string, string>>;
export declare const ACKNOWLEDGED_BACKLOG: readonly string[];

/** Component and layer ids in a title's blocker clause. `null` when it names none. */
export declare function blockersIn(title: string): readonly string[] | null;

export declare function todoTitles(source: string): string[];

/** Exists, and holds more than the scaffold's `export {}`. */
export declare function defaultIsImplemented(path: string): boolean;

export declare function checkTodoExpiry(
  entries: readonly TodoEntry[],
  sources?: Readonly<Record<string, string>>,
  isImplemented?: (path: string) => boolean,
): Violation[];

export declare const UNSCAFFOLDED: Readonly<Record<string, string>>;

/** TD3 — every path the component map names must exist, exceptions named. */
export declare function checkSourceMap(
  sources?: Readonly<Record<string, string>>,
  unscaffolded?: Readonly<Record<string, string>>,
  exists?: (path: string) => boolean,
): Violation[];

export declare const KIND_OF_COMPONENT: Readonly<Record<string, string>>;

/** TD4 — a surface deferral's blocker must be the right component (A03 §9a). */
export declare function checkSurfaceDeferrals(
  entries: readonly TodoEntry[],
  kinds?: Readonly<Record<string, string>>,
  readDir?: (dir: string) => readonly string[],
  readFile?: (file: string) => string,
): Violation[];

export declare function collectTodos(
  dir?: string,
  readFile?: (file: string) => string,
): TodoEntry[];
