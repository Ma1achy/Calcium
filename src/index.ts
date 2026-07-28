/**
 * C24 — the public API.
 *
 * Every export here is a compatibility obligation. An export consumed by
 * neither the reference app nor prism-tui is removed.
 *
 * Eleven components are deliberately absent: terminal lifecycle, frame
 * scheduler, transcript, viewport, overlays, input router, editor, parser,
 * completion, history, process runner. A consumer never touches them, and
 * needing one is a signal the layering has a gap.
 */

export {};
