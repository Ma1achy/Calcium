// Hand-written declarations for `chromium.mjs` — the browser rows import it.
// Every export there has a line here; a .d.mts is a second record of exports.
export declare const PIN: Readonly<{
  version: string;
  x64: Readonly<{ url: string; sha256: string; bin: string }>;
  arm64: Readonly<{ url: string; sha256: string; bin: string }>;
}>;
export declare const FLAGS: readonly string[];
export declare const ROUTES: readonly Readonly<{ query: string; capability: string; source: string; perSet?: boolean }>[];
export interface PageReport {
  flags: Record<string, string>;
  errors: string[];
  body: Record<string, string>;
  spinners: number;
  applied: number;
}
export declare function verifyZip(zip: string, pinned: string, from: string): void;
export declare function install(): Promise<string>;
export declare function load(page: string, options?: { timeoutMs?: number; query?: string }): Promise<PageReport>;
export declare function verdict(report: Pick<PageReport, "flags" | "errors">): string[];
export declare function checkPage(page: string): Promise<string[]>;
export declare function selfTest(): Promise<{ cases: number; problems: string[] }>;
