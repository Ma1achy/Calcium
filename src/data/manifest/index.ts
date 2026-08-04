/**
 * Tool manifest: schema, loader, pre-spawn validation.
 *
 * C05 — see spec. The manifest is what stops the TUI from guessing. Completion,
 * validation and help all derive from it, and none of them knows what a verb is;
 * `tui-kit` knows there is a tool with typed args, and that is the whole of its
 * knowledge about any app built on it.
 *
 * The schema is owned here; the content is the app's (commitment 2).
 */

export {
  ARG_TYPES,
  MANIFEST_SCHEMA,
  type ArgDef,
  type ArgType,
  type FlagDef,
  type Manifest,
  type ManifestDocument,
  type ManifestError,
  type ManifestStore,
  type ToolDef,
  type ToolMatch,
  type ValidationResult,
} from "./types.js";

export { parseManifest } from "./parse.js";

export { findTool, visibleTools } from "./find.js";

export { suggestName, validateInvocation } from "./validate.js";

export { createManifestStore } from "./store.js";
