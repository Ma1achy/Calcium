/**
 * Types for `interaction-catalogue.mjs` — the focus and selection corpus.
 */
import type { TerminalCapabilities } from "../src/terminal/capabilities.js";
import type { FocusState } from "../src/presentation/blocks/index.js";

export declare const WIDTH: number;

export type Scene = Readonly<{
  blocks: readonly unknown[];
  focus: FocusState | null;
  scrollOffsets?: Readonly<Record<string, number>>;
}>;

export declare const SCENES: Readonly<Record<string, Scene>>;

export declare function frameFor(
  scene: Scene,
  caps: TerminalCapabilities,
  width?: number,
): readonly string[];

export declare function everyFrame(): Generator<
  Readonly<{ sceneName: string; capsName: string; frame: string }>
>;

export declare function clearGenerated(dir: string): number;
export declare function renderInteractionCatalogue(): Promise<void>;
