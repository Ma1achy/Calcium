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

export declare function collectTodos(
  dir?: string,
  readFile?: (file: string) => string,
): TodoEntry[];
