/**
 * C25 — the patch renderer. One export, and it is the registration.
 *
 * Nothing else crosses the boundary (§2). The block shape is C04's, the registry is
 * C09's, the tokeniser is C09's, and a consumer producing a patch uses `b.patch(…)`
 * from C24 — so an export beyond this one would be an export nothing consumes.
 */
export { patchDefinition } from "./definition.js";
