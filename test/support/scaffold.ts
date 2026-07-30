/**
 * A scaffold that will never be implemented.
 *
 * `todo-expiry`'s TD2 needs one example of a component that exists as a file and
 * carries no behaviour, to assert that existence alone does not expire a
 * deferral. Pointing that example at a real unbuilt component works, and works
 * only until that component lands — the fixture then quietly stops testing what
 * it claims, with nothing failing to say so. It named C14, then C15, and moving
 * it a third time is not the fix.
 *
 * So the fixture is synthetic, as `enforce-commitments.test.ts` is with its C99,
 * and this file is what `C99` maps to in that test's own source map. **It is not
 * a component and must never become one.** If a future hand is looking for the
 * realism of a real path here, the realism is the defect: a fixture whose
 * validity depends on a fact about the tree that changes is the inverse of a
 * self-expiring record.
 */

export {};
